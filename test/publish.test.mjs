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
    realized_method: 'onchain_share_price',
    reason: null,
  },
];

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
  assert.match(card, /No row in this snapshot produced a comparable gap/);
});
