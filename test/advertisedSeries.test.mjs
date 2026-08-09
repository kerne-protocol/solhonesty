import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeAdvertisedSeries, locateSpot } from '../src/advertisedSeries.mjs';
import { advertisedSeriesFromHistory } from '../src/adapters/kaminoLend.mjs';

const HOUR = 3600;

function series(values, start = 1_786_000_000) {
  return values.map((pct, i) => ({ timestampSeconds: start + i * HOUR, pct }));
}

test('a distribution is refused rather than described from too few observations', () => {
  const s = summarizeAdvertisedSeries(series([4, 5, 6]));
  assert.equal(s.ok, false);
  assert.equal(s.observations, 3);
  assert.match(s.reason, /fewer than the 24 required/);
});

test('quantiles come out where they should on a known series', () => {
  // 0..100 in steps of 4 is 26 points, enough to clear the floor.
  const vals = Array.from({ length: 26 }, (_, i) => i * 4);
  const s = summarizeAdvertisedSeries(series(vals));
  assert.equal(s.ok, true);
  assert.equal(s.observations, 26);
  assert.equal(s.minPct, 0);
  assert.equal(s.maxPct, 100);
  assert.equal(s.medianPct, 50);
  assert.equal(s.p25Pct, 25);
  assert.equal(s.p75Pct, 75);
});

test('spread ratio is withheld rather than returned as Infinity against a zero floor', () => {
  const vals = Array.from({ length: 30 }, (_, i) => (i === 0 ? 0 : i));
  const s = summarizeAdvertisedSeries(series(vals));
  assert.equal(s.ok, true);
  assert.equal(s.minPct, 0);
  // Infinity serializes to null in JSON and would read as "not measured".
  assert.equal(s.spreadRatio, null);
});

test('unsorted and malformed points do not corrupt the distribution', () => {
  const good = series(Array.from({ length: 30 }, (_, i) => i + 1));
  const shuffled = [...good].reverse();
  const dirty = [
    ...shuffled,
    { timestampSeconds: 1, pct: Number.NaN },
    { timestampSeconds: Number.NaN, pct: 5 },
    null,
  ];
  const clean = summarizeAdvertisedSeries(good);
  const messy = summarizeAdvertisedSeries(dirty);
  assert.equal(messy.observations, clean.observations);
  assert.equal(messy.medianPct, clean.medianPct);
  assert.equal(messy.minPct, clean.minPct);
  assert.equal(messy.maxPct, clean.maxPct);
});

test('a reading in the middle of its own range is reported as representative', () => {
  const pts = series(Array.from({ length: 40 }, (_, i) => 3 + (i % 5) * 0.1));
  const s = summarizeAdvertisedSeries(pts);
  const loc = locateSpot(s.medianPct, s, pts);
  assert.equal(loc.ok, true);
  assert.equal(loc.representative, true);
  assert.equal(loc.reason, null);
});

test('a spike reading is flagged, with the range that makes it a spike named in the reason', () => {
  // 39 hours near 4 percent, then one hour at 24. This is the shape that
  // produced the 18.19 percent USDC reading on 2026-08-08.
  const pts = series([...Array.from({ length: 39 }, () => 4), 24]);
  const s = summarizeAdvertisedSeries(pts);
  const loc = locateSpot(24, s, pts);
  assert.equal(loc.ok, true);
  assert.equal(loc.representative, false);
  assert.match(loc.reason, /percentile/);
  assert.match(loc.reason, /sampling instant/);
});

test('no advertised history means no verdict, not a default verdict', () => {
  const loc = locateSpot(4.2, { ok: false, reason: 'nothing collected' }, []);
  assert.equal(loc.ok, false);
  assert.equal(loc.percentile, undefined);
});

// ---------------------------------------------------------------------------
// The regression this module exists for.
// ---------------------------------------------------------------------------

test('REGRESSION: the spot gap on Kamino PYUSD changed sign in three days while the product did not', () => {
  // Real readings from this repository's own build output.
  //   2026-08-04  advertised 6.9214  realized 4.6032   gap +2.3182
  //   2026-08-07  advertised 3.2535  realized 4.7618   gap -1.5082
  //   2026-08-08  advertised 4.6890  realized 4.7054   gap -0.0165
  const spotGaps = [6.9214 - 4.6032, 3.2535 - 4.7618, 4.689 - 4.7054];
  assert.ok(spotGaps[0] > 0 && spotGaps[1] < 0, 'the recorded gap really did change sign');
  assert.ok(
    Math.abs(spotGaps[0] - spotGaps[1]) > 3,
    'and it moved by more than three points in three days',
  );

  // The realized figure over the same three days barely moved. Whatever the
  // spot gap is measuring, it is not the product.
  const realized = [4.6032, 4.7618, 4.7054];
  assert.ok(Math.max(...realized) - Math.min(...realized) < 0.2);

  // Against the median of the advertised figure's own history, the same three
  // days produce one stable answer instead of three contradictory ones.
  const advertisedHistory = series(
    // A month of hourly readings dominated by the 3 to 5 band with occasional
    // utilisation spikes, which is the measured shape of this reserve.
    Array.from({ length: 700 }, (_, i) => (i % 97 === 0 ? 18 + (i % 7) : 3.6 + (i % 30) * 0.05)),
  );
  const s = summarizeAdvertisedSeries(advertisedHistory);
  assert.equal(s.ok, true);
  const medianGaps = realized.map((r) => s.medianPct - r);
  const spread = Math.max(...medianGaps) - Math.min(...medianGaps);
  assert.ok(
    spread < 0.2,
    `gap against the median should be stable across the three reads, spread was ${spread}`,
  );
});

test('the adapter reads supplyInterestAPY out of issuer history and skips what it cannot parse', () => {
  const history = [
    { timestamp: '2026-08-01T00:00:00.000Z', metrics: { supplyInterestAPY: '0.042' } },
    { timestamp: '2026-08-01T01:00:00.000Z', metrics: { supplyInterestAPY: 0.0435 } },
    { timestamp: 'not a date', metrics: { supplyInterestAPY: '0.05' } },
    { timestamp: '2026-08-01T03:00:00.000Z', metrics: { supplyInterestAPY: null } },
    { timestamp: '2026-08-01T04:00:00.000Z', metrics: {} },
    { timestamp: '2026-08-01T05:00:00.000Z' },
  ];
  const pts = advertisedSeriesFromHistory(history);
  assert.equal(pts.length, 2);
  // Stored as a percentage, matching advertised_pct, not as a ratio.
  assert.equal(pts[0].pct, 4.2);
  assert.ok(Math.abs(pts[1].pct - 4.35) < 1e-9);
});

test('an empty or absent history yields no points rather than throwing', () => {
  assert.deepEqual(advertisedSeriesFromHistory(null), []);
  assert.deepEqual(advertisedSeriesFromHistory([]), []);
  assert.deepEqual(advertisedSeriesFromHistory(undefined), []);
});
