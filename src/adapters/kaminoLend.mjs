// Kamino Lend adapter.
//
// Advertised: Kamino's own public API publishes `supplyApy` per reserve. That is
// the number a depositor is shown, from the issuer's own surface, so it is the
// advertised figure for this board.
//
// Realized: the same API publishes a history of the reserve `exchangeRate`.
// exchangeRate is collateral supply divided by liquidity supply, so the price of
// one collateral token in units of the underlying is its RECIPROCAL. Getting
// that inversion backwards turns every positive yield into a negative one, so
// there is a test that pins the direction.

import { getJson } from '../http.mjs';
import { BASES } from '../basis.mjs';
import { realizedFromSeries } from '../realized.mjs';

const API = 'https://api.kamino.finance';

export async function fetchReserveMetrics(marketPubkey) {
  const url = `${API}/kamino-market/${marketPubkey}/reserves/metrics`;
  const rows = await getJson(url);
  if (!Array.isArray(rows)) throw new Error(`kamino: unexpected shape from ${url}`);
  return { url, rows };
}

export function exchangeRateToPricePerShare(exchangeRate) {
  const r = Number(exchangeRate);
  if (!Number.isFinite(r) || r <= 0) return null;
  return 1 / r;
}

export async function fetchAdvertised({ marketPubkey, reservePubkey, cache }) {
  const { url, rows } = cache ?? (await fetchReserveMetrics(marketPubkey));
  const row = rows.find((r) => r.reserve === reservePubkey);
  if (!row) {
    return { figures: [], note: `reserve ${reservePubkey} was not present in Kamino's own reserve metrics response` };
  }
  const pct = Number(row.supplyApy) * 100;
  if (!Number.isFinite(pct)) {
    return { figures: [], note: 'Kamino published a supplyApy that did not parse as a number' };
  }
  return {
    figures: [
      {
        label: `${row.liquidityToken} supply APY`,
        pct: Number(pct.toFixed(6)),
        basis: BASES.SPOT_APY,
        includesRewards: false,
        sourceUrl: url,
        verbatim: `"reserve":"${row.reserve}","liquidityToken":"${row.liquidityToken}","supplyApy":"${row.supplyApy}"`,
        capturedAt: new Date().toISOString(),
      },
    ],
    context: {
      symbol: row.liquidityToken,
      liquidityTokenMint: row.liquidityTokenMint,
      totalSupplyUsd: Number(row.totalSupplyUsd),
    },
  };
}

export async function fetchRealized({ marketPubkey, reservePubkey, windowDays = 30 }) {
  const end = new Date();
  const start = new Date(end.getTime() - (windowDays + 5) * 86_400_000);
  const url =
    `${API}/kamino-market/${marketPubkey}/reserves/${reservePubkey}/metrics/history` +
    `?env=mainnet-beta&start=${start.toISOString()}&end=${end.toISOString()}`;
  const res = await getJson(url, { timeoutMs: 60_000 });
  const history = res?.history;
  if (!Array.isArray(history) || history.length === 0) {
    return { ok: false, reason: 'Kamino returned no reserve history for this window', method: 'issuer_share_price_history', source: url };
  }
  const series = [];
  for (const point of history) {
    const pps = exchangeRateToPricePerShare(point?.metrics?.exchangeRate);
    const ts = Date.parse(point?.timestamp);
    if (pps === null || !Number.isFinite(ts)) continue;
    series.push({ timestampSeconds: Math.floor(ts / 1000), pricePerShare: pps });
  }
  return realizedFromSeries(series, windowDays, {
    includesRewards: false,
    method: 'issuer_share_price_history',
    source: url,
  });
}
