import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aprBpsToApyPct,
  advertisedFigures,
  convertToAssetsPrice,
  roundingTolerance,
  selectToken,
  sharePrice,
  verifyShareSupply,
  APR_TO_APY_NOTE,
  SUPPLY_AGREEMENT_TOLERANCE,
  TOKENS_URL,
} from '../src/adapters/jupiterLend.mjs';
import { pickAdvertised, isComparableBasis } from '../src/basis.mjs';

// A real payload shape, with the values Jupiter served for jlUSDC on 2026-08-09.
function token(over = {}) {
  return {
    id: 2,
    address: '9BEcn9aPEmhSPbPQeFGjidRiEKki46fVQDyPpSQXPA2D',
    symbol: 'jlUSDC',
    decimals: 6,
    assetAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    asset: { symbol: 'USDC', decimals: 6 },
    totalAssets: '408465134526098',
    totalSupply: '387162414086968',
    convertToAssets: '1055023',
    supplyRate: '498',
    rewardsRate: '74',
    totalRate: '572',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// The APR to APY conversion.
//
// These four expected values are not this project's arithmetic checking itself.
// They are DeFiLlama's independently computed apyBase for the same four pools,
// read at 2026-08-09T17:01:49Z, when Jupiter was serving exactly these basis
// point figures. Four separate reserves agreeing to five decimal places is what
// established that supplyRate is a simple rate compounded daily, rather than an
// APY that needed no conversion at all.
// ---------------------------------------------------------------------------

test('a simple annual rate in basis points becomes the daily compounded yield DeFiLlama independently reports', () => {
  assert.ok(Math.abs(aprBpsToApyPct('498') - 5.10573) < 1e-5, 'USDC 4.98 percent APR');
  assert.ok(Math.abs(aprBpsToApyPct('307') - 3.11748) < 1e-5, 'USDT 3.07 percent APR');
  assert.ok(Math.abs(aprBpsToApyPct('345') - 3.51003) < 1e-5, 'USDS 3.45 percent APR');
  assert.ok(Math.abs(aprBpsToApyPct('376') - 3.83138) < 1e-5, 'JupUSD 3.76 percent APR');
});

test('the conversion always raises the figure, because compounding cannot lower it', () => {
  for (const bps of ['1', '100', '498', '2000']) {
    const apr = Number(bps) / 100;
    assert.ok(aprBpsToApyPct(bps) > apr, `${bps} bps must compound upward`);
  }
  assert.equal(aprBpsToApyPct('0'), 0);
});

test('an unparseable rate yields null rather than a plausible looking number', () => {
  assert.equal(aprBpsToApyPct('not a number'), null);
  assert.equal(aprBpsToApyPct(undefined), null);
  assert.equal(aprBpsToApyPct(null), null);
});

// ---------------------------------------------------------------------------
// Share price
// ---------------------------------------------------------------------------

test('share price is total assets over total shares, and matches the issuer rounded figure', () => {
  const t = token();
  const pps = sharePrice(t);
  const issuer = convertToAssetsPrice(t);
  assert.ok(Math.abs(pps - 1.055023) < 1e-6, `got ${pps}`);
  assert.ok(Math.abs(pps - issuer) / issuer <= roundingTolerance(t), 'the two must agree to within the issuer rounding');
});

test('a share token whose decimals no longer match the asset is refused, not silently divided', () => {
  assert.throws(() => sharePrice(token({ decimals: 9 })), /is not a share price/);
  assert.throws(() => sharePrice(token({ asset: { symbol: 'USDC' } })), /missing a decimals field/);
});

test('an empty vault withholds a share price rather than dividing by zero', () => {
  assert.equal(sharePrice(token({ totalSupply: '0' })), null);
});

test('selectToken names the address it could not find rather than returning undefined', () => {
  assert.equal(selectToken([token()], token().address).symbol, 'jlUSDC');
  assert.throws(() => selectToken([token()], 'nope'), /no earn token with address nope/);
});

// ---------------------------------------------------------------------------
// The advertised figures, and the gate they pass through
// ---------------------------------------------------------------------------

test('both the carry figure and the incentive bundled figure are published', () => {
  const figures = advertisedFigures(token(), '2026-08-09T00:00:00.000Z');
  assert.equal(figures.length, 2);
  assert.equal(figures[0].includesRewards, false);
  assert.equal(figures[1].includesRewards, true);
  assert.ok(figures[1].pct > figures[0].pct, 'the rewards figure is the larger one, which is the point');
});

test('the gate takes the conservative figure, so Jupiter cannot improve its standing by advertising rewards', () => {
  const modest = pickAdvertised(advertisedFigures(token()));
  const loud = pickAdvertised(advertisedFigures(token({ rewardsRate: '5000', totalRate: '5498' })));
  assert.equal(modest.includesRewards, false);
  assert.equal(loud.includesRewards, false);
  assert.equal(modest.pct, loud.pct, 'a bigger rewards number must not move the figure this board judges');
});

test('a product paying no rewards publishes one figure, not a duplicate', () => {
  const figures = advertisedFigures(token({ rewardsRate: '0', totalRate: '498' }));
  assert.equal(figures.length, 1);
  assert.equal(figures[0].includesRewards, false);
});

test('the published figure is comparable, carries the issuer raw payload, and declares the conversion', () => {
  const [supply] = advertisedFigures(token());
  assert.ok(isComparableBasis(supply.basis));
  assert.equal(supply.sourceUrl, TOKENS_URL);
  assert.match(supply.verbatim, /"supplyRate":"498"/, 'the untouched basis point value must survive into the row');
  assert.equal(supply.transform, APR_TO_APY_NOTE);
  assert.notEqual(supply.pct, 4.98, 'the raw simple rate must not be what gets compared');
});

// ---------------------------------------------------------------------------
// The on chain half
// ---------------------------------------------------------------------------

function rpcReturning(amount) {
  return { getTokenSupply: async () => (amount === null ? null : { amount }) };
}

test('the share supply Jupiter reports is held against the SPL mint supply on chain', async () => {
  // The exact integer both sides returned on 2026-08-09.
  const res = await verifyShareSupply(rpcReturning('387162414086968'), token());
  assert.equal(res.ok, true);
  assert.equal(res.relativeDifference, 0);
});

test('flow between the two reads is tolerated, a fabricated denominator is not', async () => {
  const reported = 387162414086968n;
  const withinFlow = String((reported * 1005n) / 1000n); // half a percent of movement
  const beyond = String(reported * 2n);
  assert.equal((await verifyShareSupply(rpcReturning(withinFlow), token())).ok, true);

  const bad = await verifyShareSupply(rpcReturning(beyond), token());
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /wider than flow between two reads explains/);
  assert.ok(bad.relativeDifference > SUPPLY_AGREEMENT_TOLERANCE);
});

test('an unreadable mint is reported as unverified rather than assumed good', async () => {
  const res = await verifyShareSupply(rpcReturning(null), token());
  assert.equal(res.ok, false);
  assert.match(res.reason, /returned no supply/);
});
