// DeFiLlama daily rate series, used only as a bootstrap.
//
// This is a third party's observation of a rate, not a share price, so it is
// strictly weaker evidence and every row that leans on it says so in its own
// `method` field. It exists for one reason: a product whose share price history
// is not published anywhere would otherwise have no realized figure at all
// until this project has run for thirty days, and an empty column teaches a
// reader nothing.
//
// apyBase is used rather than apy, because apy folds in reward emissions that a
// share price would never contain.

import { getJson } from '../http.mjs';
import { realizedFromRateSeries } from '../realized.mjs';

const CHART = 'https://yields.llama.fi/chart';

export async function fetchRateSeries(poolId, windowDays = 30) {
  const url = `${CHART}/${poolId}`;
  const res = await getJson(url, { timeoutMs: 60_000 });
  if (res?.status !== 'success' || !Array.isArray(res.data)) {
    return { ok: false, reason: `DeFiLlama returned no usable chart for pool ${poolId}`, method: 'thirdparty_rate_series', source: url };
  }
  const points = res.data
    .map((p) => ({
      timestampSeconds: Math.floor(Date.parse(p.timestamp) / 1000),
      aprPct: p.apyBase ?? null,
    }))
    .filter((p) => Number.isFinite(p.timestampSeconds) && Number.isFinite(p.aprPct));
  return realizedFromRateSeries(points, windowDays, { source: url, includesRewards: false });
}
