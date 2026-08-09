import test from 'node:test';
import assert from 'node:assert/strict';

import { toCsv, datasetCard } from '../src/publish.mjs';
import { summarize } from '../src/engine.mjs';

const ROWS = [
  {
    key: 'a-usdc',
    protocol: 'A',
    product: 'A USDC',
    symbol: 'USDC',
    chain: 'solana',
    comparable: true,
    advertised_pct: 4.1648,
    realized_pct: 4.0744,
    gap_pct: 0.0904,
    delivered_pct: 97.83,
    advertised_history_ok: true,
    gap_vs_median_pct: 0.0904,
    delivered_vs_median_pct: 97.83,
    realized_method: 'issuer_share_price_history',
    reason: null,
    advertised_verbatim: 'he said "4.1648", then, a comma',
  },
  {
    key: 'b-usdc',
    protocol: 'B',
    product: 'B USDC',
    symbol: 'USDC',
    chain: 'solana',
    comparable: false,
    advertised_pct: null,
    realized_pct: 2.1,
    gap_pct: null,
    delivered_pct: null,
    realized_method: 'thirdparty_rate_series',
    reason: 'a since inception average is not what a holder earns today',
  },
  {
    key: 'c-usdc',
    protocol: 'C',
    product: 'C USDC',
    symbol: 'USDC',
    chain: 'solana',
    comparable: true,
    advertised_pct: 10,
    realized_pct: 1,
    gap_pct: 9,
    delivered_pct: 10,
    advertised_history_ok: true,
    gap_vs_median_pct: 9,
    delivered_vs_median_pct: 10,
    realized_method: 'onchain_share_price',
    reason: null,
  },
];

// A row with a huge gap and NO readable advertised history. This is the shape of
// the mistake the whole of advertisedSeries.mjs exists to prevent: a spot reading
// of a figure whose distribution is unknown, sitting next to a 30 day realized
// figure, producing a number that would top any ranking sorted on gap alone.
// Naming it would be a claim about somebody else's protocol built out of this
// collector's sampling instant.
const NO_HISTORY_HUGE_GAP = {
  key: 'd-usdc',
  protocol: 'D',
  product: 'D USDC',
  symbol: 'USDC',
  chain: 'solana',
  comparable: true,
  advertised_pct: 60,
  realized_pct: 2,
  gap_pct: 58,
  delivered_pct: 3.33,
  advertised_history_ok: false,
  gap_vs_median_pct: null,
  delivered_vs_median_pct: null,
  realized_method: 'thirdparty_rate_series',
  reason: null,
};

test('csv escapes quotes and commas so a verbatim quote cannot break a column', () => {
  const csv = toCsv(ROWS);
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 4);
  assert.match(csv, /"he said ""4\.1648"", then, a comma"/);
});

test('csv writes an empty cell for null rather than the string null', () => {
  const csv = toCsv([{ key: 'x', gap_pct: null }], ['key', 'gap_pct']);
  assert.equal(csv.trim().split('\n')[1], 'x,');
});

test('summarize names the widest gap and the worst delivery, not the first row', () => {
  const s = summarize(ROWS);
  assert.equal(s.products_tracked, 3);
  assert.equal(s.rows_comparable, 2);
  assert.equal(s.rows_not_comparable, 1);
  assert.equal(s.widest_gap.key, 'c-usdc');
  assert.equal(s.lowest_delivery.key, 'c-usdc');
});

test('a row with no advertised history can never be named, however large its gap', () => {
  const s = summarize([...ROWS, NO_HISTORY_HUGE_GAP]);
  // Sorted on gap alone, d-usdc wins by a mile at 58 points. It must not be
  // named, because nothing here knows whether that 58 is the product or the
  // minute the collector ran.
  assert.equal(s.widest_gap.key, 'c-usdc', 'the ranking must ignore rows with no distribution behind them');
  assert.equal(s.lowest_delivery.key, 'c-usdc');
  assert.ok(s.unrankable_keys.includes('d-usdc'), 'and it must be named as excluded rather than silently dropped');
  assert.equal(s.ranking_basis, 'gap_vs_median_pct');
});

test('a board made only of rows without history names no widest gap at all', () => {
  const s = summarize([NO_HISTORY_HUGE_GAP]);
  assert.equal(s.rows_comparable, 1);
  assert.equal(s.rows_rankable, 0);
  assert.equal(s.widest_gap, null, 'no ranking is better than a dishonest one');
});

test('the card refuses to name a protocol it cannot rank', () => {
  const board = {
    generated_at: '2026-08-04T12:00:00.000Z',
    window_days: 30,
    rows: [NO_HISTORY_HUGE_GAP],
    summary: summarize([NO_HISTORY_HUGE_GAP]),
  };
  const card = datasetCard(board);
  // The row itself, gap and all, still appears in the table. Publishing it is
  // not the problem. Promoting it to a headline about a named protocol is.
  assert.match(card, /D USDC/, 'the row is still published in full');
  assert.doesNotMatch(card, /Widest gap among rows this board can rank/);
  assert.match(card, /names no widest gap/);
  assert.match(card, /d-usdc/, 'and it is named as excluded rather than silently dropped');
});

test('summarize reports zero comparable rows honestly instead of picking one anyway', () => {
  const s = summarize([ROWS[1]]);
  assert.equal(s.rows_comparable, 0);
  assert.equal(s.widest_gap, null);
  assert.equal(s.lowest_delivery, null);
});

test('the dataset card is generated from the board, including the non comparable reasons', () => {
  const board = {
    generated_at: '2026-08-04T12:00:00.000Z',
    window_days: 30,
    rows: ROWS,
    summary: summarize(ROWS),
  };
  const card = datasetCard(board);
  assert.match(card, /license: cc-by-4\.0/);
  assert.match(card, /Solana Honesty Index/);
  assert.match(card, /a since inception average is not what a holder earns today/);
  assert.match(card, /c-usdc/, 'the card must name the widest gap it computed');
  assert.match(card, /advertised_verbatim/, 'the licence carve out must be stated');
});

test('the card stops claiming a widest gap when no row is comparable', () => {
  const board = {
    generated_at: '2026-08-04T12:00:00.000Z',
    window_days: 30,
    rows: [ROWS[1]],
    summary: summarize([ROWS[1]]),
  };
  const card = datasetCard(board);
  assert.match(card, /names no widest gap/);
});
