import test from 'node:test';
import assert from 'node:assert/strict';

import { BASES, isComparableBasis, pickAdvertised, assessRow, nonComparableReason } from '../src/basis.mjs';

test('only spot and trailing-30d bases are comparable', () => {
  assert.equal(isComparableBasis(BASES.SPOT_APY), true);
  assert.equal(isComparableBasis(BASES.TRAILING_30D), true);
  for (const b of [BASES.TRAILING_7D, BASES.TRAILING_24H, BASES.INCEPTION_TO_DATE, BASES.MODELED, BASES.TARGET, BASES.RANGE_MAX, BASES.UNKNOWN]) {
    assert.equal(isComparableBasis(b), false, `${b} must not be comparable`);
  }
});

test('every non comparable basis carries a stated reason', () => {
  for (const b of Object.values(BASES)) {
    if (isComparableBasis(b)) continue;
    const r = nonComparableReason(b);
    assert.ok(typeof r === 'string' && r.length > 20, `${b} needs a real reason, got ${r}`);
  }
});

// This is the v47 failure mode, encoded so it cannot come back.
test('pickAdvertised never returns the largest figure, it returns the most conservative comparable one', () => {
  const figures = [
    { label: 'headline', pct: 12.5, basis: BASES.RANGE_MAX },
    { label: 'since inception', pct: 8.4, basis: BASES.INCEPTION_TO_DATE },
    { label: 'current', pct: 4.1, basis: BASES.SPOT_APY },
    { label: 'trailing 30d', pct: 4.9, basis: BASES.TRAILING_30D },
  ];
  const chosen = pickAdvertised(figures);
  assert.equal(chosen.pct, 4.1, 'the lowest comparable figure must win');
});

test('a protocol cannot improve its standing by publishing a bigger number', () => {
  const before = pickAdvertised([{ pct: 5, basis: BASES.SPOT_APY }]);
  const after = pickAdvertised([
    { pct: 5, basis: BASES.SPOT_APY },
    { pct: 99, basis: BASES.SPOT_APY },
    { pct: 250, basis: BASES.RANGE_MAX },
  ]);
  assert.equal(before.pct, after.pct);
});

test('pickAdvertised returns null when nothing is comparable', () => {
  assert.equal(pickAdvertised([{ pct: 20, basis: BASES.MODELED }]), null);
  assert.equal(pickAdvertised([]), null);
  assert.equal(pickAdvertised(null), null);
});

test('assessRow computes gap and delivery on a comparable pair', () => {
  const v = assessRow({
    advertisedFigures: [{ pct: 4.1648, basis: BASES.SPOT_APY, includesRewards: false }],
    realized: { ok: true, annualizedPct: 4.0744, includesRewards: false },
  });
  assert.equal(v.comparable, true);
  assert.equal(v.advertisedPct, 4.1648);
  assert.equal(v.realizedPct, 4.0744);
  assert.equal(v.gapPct, 0.0904);
  assert.equal(v.deliveredPct, 97.83);
});

test('assessRow refuses to compare when the advertised figure bundles rewards and realized does not', () => {
  const v = assessRow({
    advertisedFigures: [{ pct: 12, basis: BASES.SPOT_APY, includesRewards: true }],
    realized: { ok: true, annualizedPct: 3, includesRewards: false },
  });
  assert.equal(v.comparable, false);
  assert.match(v.reason, /incentive/);
  assert.equal(v.gapPct, null, 'a non comparable row must not publish a gap');
});

test('assessRow publishes a realized figure even when nothing advertised is comparable', () => {
  const v = assessRow({
    advertisedFigures: [{ pct: 9, basis: BASES.INCEPTION_TO_DATE }],
    realized: { ok: true, annualizedPct: 3.2 },
  });
  assert.equal(v.comparable, false);
  assert.equal(v.realizedPct, 3.2);
  assert.equal(v.advertisedPct, null);
  assert.match(v.reason, /since inception/);
});

test('a product that publishes nothing is described as publishing nothing', () => {
  const v = assessRow({ advertisedFigures: [], realized: { ok: true, annualizedPct: 3.2 } });
  assert.equal(v.comparable, false);
  assert.match(v.reason, /publishes no yield figure/);
});

test('delivery ratio is withheld rather than divided by zero', () => {
  const v = assessRow({
    advertisedFigures: [{ pct: 0, basis: BASES.SPOT_APY }],
    realized: { ok: true, annualizedPct: 1 },
  });
  assert.equal(v.deliveredPct, null);
});
