// Board builder.
//
// One product in, one row out. No figure in a row is written by hand: every
// number is produced by an adapter from a surface named in the row itself, so a
// row cannot outlive the read that made it.

import fs from 'node:fs';
import path from 'node:path';

import { SolanaRpc } from './rpc.mjs';
import { assessRow, round } from './basis.mjs';
import { realizedFromSeries } from './realized.mjs';
import { summarizeAdvertisedSeries, locateSpot } from './advertisedSeries.mjs';
import * as kamino from './adapters/kaminoLend.mjs';
import * as save from './adapters/saveReserve.mjs';
import { fetchRateSeries } from './adapters/llamaSeries.mjs';

export const SCHEMA_VERSION = 1;

export function loadRegistry(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const reg = JSON.parse(raw);
  if (!Array.isArray(reg.products) || reg.products.length === 0) {
    throw new Error('registry: products must be a non empty array');
  }
  const seen = new Set();
  for (const p of reg.products) {
    if (!p.key) throw new Error('registry: every product needs a key');
    if (seen.has(p.key)) throw new Error(`registry: duplicate key ${p.key}`);
    seen.add(p.key);
  }
  return reg;
}

// Our own share price observations, appended one line per read. This is the
// series that eventually replaces every third party bootstrap on the board.
export function readObservations(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function appendObservations(file, rows) {
  if (rows.length === 0) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

async function buildKaminoRow(product, windowDays, cache) {
  const adv = await kamino.fetchAdvertised({
    marketPubkey: product.marketPubkey,
    reservePubkey: product.reservePubkey,
    cache,
  });
  const prefetched = await kamino.fetchHistory({
    marketPubkey: product.marketPubkey,
    reservePubkey: product.reservePubkey,
    windowDays,
  });
  const realized = await kamino.fetchRealized({
    marketPubkey: product.marketPubkey,
    reservePubkey: product.reservePubkey,
    windowDays,
    prefetched,
  });
  const advPoints = kamino.advertisedSeriesFromHistory(prefetched.history);
  const advertisedHistory = summarizeAdvertisedSeries(advPoints, {
    source: prefetched.url,
    field: 'metrics.supplyInterestAPY',
  });
  return {
    advertisedFigures: adv.figures,
    realized,
    advertisedHistory,
    advertisedPoints: advPoints,
    context: adv.context ?? null,
    note: adv.note ?? null,
    observation: null,
  };
}

async function buildSaveRow(product, windowDays, rpc, ownObservations) {
  const adv = await save.fetchAdvertised(product.reservePubkey);

  // Read the reserve account ourselves so today's share price is ours, not
  // theirs, and so a divergence between the two is visible rather than assumed
  // away.
  let onChain = null;
  let onChainError = null;
  try {
    onChain = await save.readOnChain(rpc, product.reservePubkey);
  } catch (err) {
    onChainError = err.message;
  }

  const observation = onChain?.pricePerShare
    ? {
        key: product.key,
        timestampSeconds: Math.floor(Date.now() / 1000),
        pricePerShare: onChain.pricePerShare,
        slot: onChain.slot === null ? null : String(onChain.slot),
        source: 'onchain:save-reserve',
      }
    : null;

  // Prefer our own series once it is long enough to mean anything.
  const mine = ownObservations
    .filter((o) => o.key === product.key)
    .concat(observation ? [observation] : [])
    .map((o) => ({ timestampSeconds: o.timestampSeconds, pricePerShare: o.pricePerShare }));

  let realized = realizedFromSeries(mine, windowDays, {
    includesRewards: false,
    method: 'onchain_share_price',
    source: `solana:account:${product.reservePubkey}`,
  });

  if (!realized.ok && product.llamaPoolId) {
    const bootstrap = await fetchRateSeries(product.llamaPoolId, windowDays);
    if (bootstrap.ok) {
      bootstrap.bootstrapReason = realized.reason;
      realized = bootstrap;
    }
  }

  return {
    advertisedFigures: adv.figures,
    realized,
    // Save publishes a rate but no history of it, so the volatility of its
    // advertised figure cannot be described from the issuer's own surface. That
    // is recorded as an absence rather than filled in from a third party, which
    // would mix a Save claim with somebody else's observation of it.
    advertisedHistory: {
      ok: false,
      reason: 'Save publishes a current rate but no history of that rate, so the distribution its spot reading was drawn from cannot be measured from the issuer surface',
      observations: 0,
      source: null,
      field: null,
    },
    advertisedPoints: [],
    context: {
      onChainPricePerShare: onChain?.pricePerShare ?? null,
      issuerReportedExchangeRate: adv.issuerReportedExchangeRate ?? null,
      onChainError,
    },
    note: adv.note ?? null,
    observation,
  };
}

export async function buildBoard({ registry, rpc = new SolanaRpc(), observationsFile = null } = {}) {
  const windowDays = registry.windowDays ?? 30;
  const own = observationsFile ? readObservations(observationsFile) : [];

  // One shared read of Kamino's reserve metrics for every Kamino row.
  const kaminoCache = new Map();
  const rows = [];
  const newObservations = [];

  for (const product of registry.products) {
    const started = Date.now();
    let built;
    try {
      if (product.adapter === 'kamino-lend') {
        if (!kaminoCache.has(product.marketPubkey)) {
          kaminoCache.set(product.marketPubkey, await kamino.fetchReserveMetrics(product.marketPubkey));
        }
        built = await buildKaminoRow(product, windowDays, kaminoCache.get(product.marketPubkey));
      } else if (product.adapter === 'save-reserve') {
        built = await buildSaveRow(product, windowDays, rpc, own);
      } else {
        throw new Error(`unknown adapter ${product.adapter}`);
      }
    } catch (err) {
      rows.push({
        key: product.key,
        protocol: product.protocol,
        product: product.product,
        symbol: product.symbol,
        chain: product.chain,
        error: err.message,
        comparable: false,
        reason: `this row could not be built: ${err.message}`,
        advertised_pct: null,
        realized_pct: null,
        gap_pct: null,
        delivered_pct: null,
        realized_method: null,
        advertised_source_url: null,
        advertised_verbatim: null,
        window_days: null,
        built_ms: Date.now() - started,
      });
      continue;
    }

    if (built.observation) newObservations.push(built.observation);

    const verdict = assessRow({ advertisedFigures: built.advertisedFigures, realized: built.realized });
    const chosen = built.advertisedFigures?.find((f) => f.pct === verdict.advertisedPct) ?? built.advertisedFigures?.[0] ?? null;

    // Where did the spot reading this row is judged on sit inside its own recent
    // history, and what would the gap have been against the median of that
    // history instead? See advertisedSeries.mjs for why this column exists.
    const advHist = built.advertisedHistory ?? { ok: false, reason: 'no advertised history was collected for this adapter' };
    const spot = locateSpot(verdict.advertisedPct, advHist, built.advertisedPoints);
    const medianGap =
      advHist.ok && Number.isFinite(verdict.realizedPct)
        ? round(advHist.medianPct - verdict.realizedPct, 4)
        : null;
    const medianDelivered =
      advHist.ok && Number.isFinite(verdict.realizedPct) && advHist.medianPct > 0
        ? round((verdict.realizedPct / advHist.medianPct) * 100, 2)
        : null;

    rows.push({
      key: product.key,
      protocol: product.protocol,
      product: product.product,
      symbol: product.symbol,
      chain: product.chain,
      reserve: product.reservePubkey ?? null,
      comparable: verdict.comparable,
      reason: verdict.reason,
      advertised_pct: verdict.advertisedPct,
      realized_pct: verdict.realizedPct,
      gap_pct: verdict.gapPct,
      delivered_pct: verdict.deliveredPct,
      published_figures: verdict.publishedFigures,
      realized_method: built.realized?.method ?? null,
      realized_source: built.realized?.source ?? null,
      realized_from: built.realized?.fromISO ?? null,
      realized_to: built.realized?.toISO ?? null,
      realized_observations: built.realized?.observations ?? null,
      window_days: built.realized?.windowDays ? round(built.realized.windowDays, 4) : null,
      price_per_share_from: built.realized?.ppsFrom ?? null,
      price_per_share_to: built.realized?.ppsTo ?? null,
      // The advertised figure's own distribution over the same window. A gap
      // computed from a spot reading outside p25..p75 is telling you about the
      // clock, not the product.
      advertised_history_ok: advHist.ok,
      advertised_history_reason: advHist.ok ? null : advHist.reason,
      advertised_history_observations: advHist.observations ?? 0,
      advertised_min_pct: advHist.ok ? round(advHist.minPct, 4) : null,
      advertised_p25_pct: advHist.ok ? round(advHist.p25Pct, 4) : null,
      advertised_median_pct: advHist.ok ? round(advHist.medianPct, 4) : null,
      advertised_p75_pct: advHist.ok ? round(advHist.p75Pct, 4) : null,
      advertised_max_pct: advHist.ok ? round(advHist.maxPct, 4) : null,
      advertised_spread_ratio: advHist.ok ? round(advHist.spreadRatio, 2) : null,
      spot_percentile: spot.ok ? round(spot.percentile, 1) : null,
      spot_is_representative: spot.ok ? spot.representative : null,
      spot_caveat: spot.ok ? spot.reason : null,
      gap_vs_median_pct: medianGap,
      delivered_vs_median_pct: medianDelivered,
      advertised_history_source: advHist.source ?? null,
      advertised_basis: chosen?.basis ?? null,
      advertised_source_url: chosen?.sourceUrl ?? null,
      advertised_verbatim: chosen?.verbatim ?? null,
      advertised_surface: product.advertisedSurface ?? null,
      captured_at: chosen?.capturedAt ?? null,
      context: built.context,
      note: built.note,
      built_ms: Date.now() - started,
    });
  }

  return {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    window_days: windowDays,
    chain: 'solana',
    rows,
    new_observations: newObservations,
    summary: summarize(rows),
  };
}

export function summarize(rows) {
  const comparable = rows.filter((r) => r.comparable && Number.isFinite(r.gap_pct));
  const byGap = [...comparable].sort((a, b) => b.gap_pct - a.gap_pct);
  const byDelivery = [...comparable]
    .filter((r) => Number.isFinite(r.delivered_pct))
    .sort((a, b) => a.delivered_pct - b.delivered_pct);
  // Stability of the ADVERTISED figure. Reported at the top level because it
  // governs how much weight any gap on this board can carry.
  const withHistory = rows.filter((r) => r.advertised_history_ok);
  const bySpread = [...withHistory].sort((a, b) => (b.advertised_spread_ratio ?? 0) - (a.advertised_spread_ratio ?? 0));
  const unrepresentative = withHistory.filter((r) => r.spot_is_representative === false);

  return {
    products_tracked: rows.length,
    rows_comparable: comparable.length,
    rows_not_comparable: rows.length - comparable.length,
    widest_gap: byGap[0] ? { key: byGap[0].key, gap_pct: byGap[0].gap_pct } : null,
    lowest_delivery: byDelivery[0] ? { key: byDelivery[0].key, delivered_pct: byDelivery[0].delivered_pct } : null,
    advertised_stability: {
      rows_with_advertised_history: withHistory.length,
      rows_without: rows.length - withHistory.length,
      widest_spread: bySpread[0]
        ? {
            key: bySpread[0].key,
            ratio: bySpread[0].advertised_spread_ratio,
            min_pct: bySpread[0].advertised_min_pct,
            max_pct: bySpread[0].advertised_max_pct,
          }
        : null,
      rows_whose_spot_reading_is_unrepresentative: unrepresentative.length,
      unrepresentative_keys: unrepresentative.map((r) => r.key),
    },
    realized_methods: rows.reduce((acc, r) => {
      const m = r.realized_method ?? 'none';
      acc[m] = (acc[m] ?? 0) + 1;
      return acc;
    }, {}),
  };
}
