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
  const realized = await kamino.fetchRealized({
    marketPubkey: product.marketPubkey,
    reservePubkey: product.reservePubkey,
    windowDays,
  });
  return { advertisedFigures: adv.figures, realized, context: adv.context ?? null, note: adv.note ?? null, observation: null };
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
  return {
    products_tracked: rows.length,
    rows_comparable: comparable.length,
    rows_not_comparable: rows.length - comparable.length,
    widest_gap: byGap[0] ? { key: byGap[0].key, gap_pct: byGap[0].gap_pct } : null,
    lowest_delivery: byDelivery[0] ? { key: byDelivery[0].key, delivered_pct: byDelivery[0].delivered_pct } : null,
    realized_methods: rows.reduce((acc, r) => {
      const m = r.realized_method ?? 'none';
      acc[m] = (acc[m] ?? 0) + 1;
      return acc;
    }, {}),
  };
}
