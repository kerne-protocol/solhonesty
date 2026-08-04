import test from 'node:test';
import assert from 'node:assert/strict';

import { annualize, realizedFromSeries, realizedFromRateSeries, MIN_WINDOW_DAYS } from '../src/realized.mjs';
import { exchangeRateToPricePerShare } from '../src/adapters/kaminoLend.mjs';

const DAY = 86_400;

test('annualize compounds a 30 day move to a year', () => {
  // 1 percent over 30 days.
  const r = annualize({ ppsFrom: 1, ppsTo: 1.01, elapsedSeconds: 30 * DAY });
  assert.equal(r.ok, true);
  assert.equal(r.windowDays, 30);
  // (1.01 ^ (365/30) - 1) * 100 = 12.869529...
  assert.ok(Math.abs(r.annualizedPct - 12.869529) < 0.001, `got ${r.annualizedPct}`);
});

test('annualize refuses a window shorter than the minimum rather than extrapolating it', () => {
  const r = annualize({ ppsFrom: 1, ppsTo: 1.001, elapsedSeconds: 2 * DAY });
  assert.equal(r.ok, false);
  assert.match(r.reason, new RegExp(`${MIN_WINDOW_DAYS} days`));
});

test('annualize rejects non positive or non finite inputs instead of returning NaN', () => {
  assert.equal(annualize({ ppsFrom: 0, ppsTo: 1, elapsedSeconds: 30 * DAY }).ok, false);
  assert.equal(annualize({ ppsFrom: 1, ppsTo: NaN, elapsedSeconds: 30 * DAY }).ok, false);
  assert.equal(annualize({ ppsFrom: 1, ppsTo: 1.1, elapsedSeconds: 0 }).ok, false);
});

test('a flat share price annualizes to zero, not to something', () => {
  const r = annualize({ ppsFrom: 1.5, ppsTo: 1.5, elapsedSeconds: 30 * DAY });
  assert.equal(r.ok, true);
  assert.equal(r.annualizedPct, 0);
});

test('a falling share price produces a negative figure rather than being clamped', () => {
  const r = annualize({ ppsFrom: 1.1, ppsTo: 1.05, elapsedSeconds: 30 * DAY });
  assert.equal(r.ok, true);
  assert.ok(r.annualizedPct < 0, `expected negative, got ${r.annualizedPct}`);
});

test('realizedFromSeries measures the window ending at the newest observation', () => {
  const now = Math.floor(Date.now() / 1000);
  const series = [];
  for (let d = 60; d >= 0; d--) {
    series.push({ timestampSeconds: now - d * DAY, pricePerShare: 1 + (60 - d) * 0.0001 });
  }
  const r = realizedFromSeries(series, 30);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.windowDays - 30) < 0.01, `window was ${r.windowDays}`);
  assert.equal(r.method, 'onchain_share_price');
  assert.equal(r.observations, 61);
  // 30 days of 0.0001 per day on a base near 1.003
  assert.ok(r.annualizedPct > 3 && r.annualizedPct < 5, `got ${r.annualizedPct}`);
});

test('realizedFromSeries reports insufficient history instead of guessing', () => {
  const now = Math.floor(Date.now() / 1000);
  const r = realizedFromSeries(
    [
      { timestampSeconds: now - 2 * DAY, pricePerShare: 1 },
      { timestampSeconds: now, pricePerShare: 1.001 },
    ],
    30,
  );
  assert.equal(r.ok, false);
  assert.match(r.reason, /days of share price history/);
});

test('realizedFromSeries needs at least two observations', () => {
  const r = realizedFromSeries([{ timestampSeconds: 1, pricePerShare: 1 }], 30);
  assert.equal(r.ok, false);
  assert.match(r.reason, /fewer than two/);
});

test('rate series is time weighted, so a gap cannot count as one day', () => {
  const now = Math.floor(Date.now() / 1000);
  // 29 days at 2 percent then a single reading at 100 percent.
  const points = [
    { timestampSeconds: now - 30 * DAY, aprPct: 2 },
    { timestampSeconds: now - 1 * DAY, aprPct: 2 },
    { timestampSeconds: now, aprPct: 100 },
  ];
  const r = realizedFromRateSeries(points, 30);
  assert.equal(r.ok, true);
  // Unweighted mean would be 34.67. Time weighted keeps it near 2.
  assert.ok(r.annualizedPct < 5, `time weighting failed, got ${r.annualizedPct}`);
  assert.equal(r.method, 'thirdparty_rate_series');
});

// Direction test. Kamino's exchangeRate is collateral per liquidity, so the
// share price is its reciprocal. Getting this backwards turns yield negative.
test('kamino exchangeRate inverts to a share price above one for an accruing reserve', () => {
  const pps = exchangeRateToPricePerShare('0.84086458445029510003');
  assert.ok(pps > 1, `expected a share price above 1, got ${pps}`);
  assert.ok(Math.abs(pps - 1.189252132) < 1e-6, `got ${pps}`);
});

test('a rising share price means a falling exchangeRate', () => {
  const earlier = exchangeRateToPricePerShare('0.84086458445029510003');
  const later = exchangeRateToPricePerShare('0.83743497'); // rate went down
  assert.ok(later > earlier, 'a falling exchangeRate must mean a rising share price');
});

test('exchangeRateToPricePerShare rejects garbage rather than returning Infinity', () => {
  assert.equal(exchangeRateToPricePerShare('0'), null);
  assert.equal(exchangeRateToPricePerShare('not a number'), null);
  assert.equal(exchangeRateToPricePerShare(null), null);
});
