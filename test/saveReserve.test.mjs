import test from 'node:test';
import assert from 'node:assert/strict';

import { decodeReserve, pricePerShare, totalLiquidityRaw, OFFSETS, RESERVE_ACCOUNT_LEN } from '../src/adapters/saveReserve.mjs';
import { decodeBase58, encodeBase58, isValidSolanaAddress } from '../src/base58.mjs';
import { readU64LE, readU128LE } from '../src/rpc.mjs';

// A synthetic reserve account built from known values, so the decoder is tested
// without a network call. The live cross check against Save's own API lives in
// live.test.mjs and only runs with SOLHONESTY_LIVE=1.
function buildFixture({
  available = 6_709_940_992_531n,
  borrowedWads = 15_941_902_166_637_685_909_189_942_624_758n,
  feesWads = 2_138_691_172_821_978_197_561_153n,
  collateralSupply = 17_384_549_321_180n,
  collateralMint = '993dVFL2uXWYeoXuEBFXR4BijeXdTv4s6BzsCjJZuwqk',
  liquidityMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  market = '4UpD2fh7xH3VP9QQaXtsS1YY3bxzWhtfpks7FatyKvdY',
} = {}) {
  const buf = Buffer.alloc(RESERVE_ACCOUNT_LEN);
  buf.writeUInt8(1, OFFSETS.version);
  buf.writeBigUInt64LE(437_197_144n, OFFSETS.slot);
  buf.writeUInt8(0, OFFSETS.stale);
  decodeBase58(market).copy(buf, OFFSETS.lendingMarket);
  decodeBase58(liquidityMint).copy(buf, OFFSETS.liquidityMint);
  buf.writeUInt8(6, OFFSETS.liquidityMintDecimals);
  buf.writeBigUInt64LE(available, OFFSETS.availableAmount);
  writeU128(buf, OFFSETS.borrowedAmountWads, borrowedWads);
  decodeBase58(collateralMint).copy(buf, OFFSETS.collateralMint);
  buf.writeBigUInt64LE(collateralSupply, OFFSETS.collateralMintTotalSupply);
  writeU128(buf, OFFSETS.accumulatedProtocolFeesWads, feesWads);
  return buf;
}

function writeU128(buf, offset, value) {
  buf.writeBigUInt64LE(value & ((1n << 64n) - 1n), offset);
  buf.writeBigUInt64LE(value >> 64n, offset + 8);
}

test('base58 round trips a Solana address', () => {
  const addr = '6Ke43qHnAQhvaet6RyxvB126GUps9jUvq2ZPzTnxZ9BJ';
  const bytes = decodeBase58(addr);
  assert.equal(bytes.length, 32);
  assert.equal(encodeBase58(bytes), addr);
  assert.equal(isValidSolanaAddress(addr), true);
});

test('base58 rejects a string that is not 32 bytes', () => {
  assert.equal(isValidSolanaAddress('abc'), false);
  assert.equal(isValidSolanaAddress('0OIl'), false); // characters outside the alphabet
});

test('u128 little endian reader handles a value above 2^64', () => {
  const buf = Buffer.alloc(16);
  const v = 15_941_902_166_637_685_909_189_942_624_758n;
  writeU128(buf, 0, v);
  assert.equal(readU128LE(buf, 0), v);
});

test('decodeReserve reads every field back out of a known account', () => {
  const r = decodeReserve(buildFixture());
  assert.equal(r.version, 1);
  assert.equal(r.liquidityMintDecimals, 6);
  assert.equal(r.liquidityMint, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  assert.equal(r.collateralMint, '993dVFL2uXWYeoXuEBFXR4BijeXdTv4s6BzsCjJZuwqk');
  assert.equal(r.availableAmount, 6_709_940_992_531n);
  assert.equal(r.collateralMintTotalSupply, 17_384_549_321_180n);
});

test('decodeReserve refuses an account of the wrong length rather than reading garbage', () => {
  assert.throws(() => decodeReserve(Buffer.alloc(200)), /619 byte reserve/);
  assert.throws(() => decodeReserve(null), /619 byte reserve/);
});

test('total liquidity subtracts accrued protocol fees', () => {
  const withFees = totalLiquidityRaw(decodeReserve(buildFixture()));
  const withoutFees = totalLiquidityRaw(decodeReserve(buildFixture({ feesWads: 0n })));
  assert.ok(withoutFees > withFees, 'fees must reduce the assets backing the share token');
  assert.equal(withoutFees - withFees, 2_138_691n);
});

test('share price matches the value Save publishes for this account state', () => {
  const pps = pricePerShare(decodeReserve(buildFixture()));
  // Save's own API reported cTokenExchangeRate 1.30298744908649569024 for this
  // reserve state. Agreement to 1e-7 is the bar, because the two reads are of
  // the same slot but the API rounds.
  assert.ok(Math.abs(pps - 1.302987449) < 1e-6, `got ${pps}`);
});

test('share price is withheld rather than dividing by zero on an empty reserve', () => {
  const r = decodeReserve(buildFixture({ collateralSupply: 0n }));
  assert.equal(pricePerShare(r), null);
});

test('readU64LE reads the collateral supply at the documented offset', () => {
  const buf = buildFixture();
  assert.equal(readU64LE(buf, OFFSETS.collateralMintTotalSupply), 17_384_549_321_180n);
});
