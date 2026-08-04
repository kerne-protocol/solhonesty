// Save (formerly Solend) adapter, reading the reserve account directly.
//
// This is the adapter that proves the point of the project. Save publishes a
// cTokenExchangeRate on its own API, and this file recomputes the same number
// from the raw 619 byte reserve account over plain JSON-RPC, with no SDK and no
// API key. The two agree, which is what makes the published figure checkable by
// somebody who does not trust either of us.
//
// Layout offsets below were located empirically against mainnet and each one is
// asserted in the test suite against Save's own decoded JSON, so a silent
// upstream layout change fails a test rather than quietly producing a wrong
// share price.
//
//   0    version                              u8
//   1    lastUpdate.slot                      u64
//   9    lastUpdate.stale                     u8
//   10   lendingMarket                        pubkey(32)
//   42   liquidity.mintPubkey                 pubkey(32)
//   74   liquidity.mintDecimals               u8
//   75   liquidity.supplyPubkey               pubkey(32)
//   107  liquidity.pythOracle                 pubkey(32)
//   139  liquidity.switchboardOracle          pubkey(32)
//   171  liquidity.availableAmount            u64
//   179  liquidity.borrowedAmountWads         u128
//   195  liquidity.cumulativeBorrowRateWads   u128
//   211  liquidity.marketPrice                u128
//   227  collateral.mintPubkey                pubkey(32)
//   259  collateral.mintTotalSupply           u64
//   267  collateral.supplyPubkey              pubkey(32)
//   373  liquidity.accumulatedProtocolFeesWads u128

import { getJson } from '../http.mjs';
import { readU64LE, readU128LE } from '../rpc.mjs';
import { encodeBase58 } from '../base58.mjs';
import { BASES } from '../basis.mjs';

const API = 'https://api.save.finance';
export const SAVE_PROGRAM_ID = 'So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo';
const WAD = 10n ** 18n;

export const OFFSETS = Object.freeze({
  version: 0,
  slot: 1,
  stale: 9,
  lendingMarket: 10,
  liquidityMint: 42,
  liquidityMintDecimals: 74,
  liquiditySupply: 75,
  availableAmount: 171,
  borrowedAmountWads: 179,
  cumulativeBorrowRateWads: 195,
  marketPrice: 211,
  collateralMint: 227,
  collateralMintTotalSupply: 259,
  collateralSupply: 267,
  accumulatedProtocolFeesWads: 373,
});

export const RESERVE_ACCOUNT_LEN = 619;

export function decodeReserve(buf) {
  if (!Buffer.isBuffer(buf) || buf.length !== RESERVE_ACCOUNT_LEN) {
    throw new Error(`save: expected a ${RESERVE_ACCOUNT_LEN} byte reserve account, got ${buf?.length}`);
  }
  const pk = (o) => encodeBase58(buf.subarray(o, o + 32));
  return {
    version: buf.readUInt8(OFFSETS.version),
    slot: readU64LE(buf, OFFSETS.slot),
    stale: buf.readUInt8(OFFSETS.stale),
    lendingMarket: pk(OFFSETS.lendingMarket),
    liquidityMint: pk(OFFSETS.liquidityMint),
    liquidityMintDecimals: buf.readUInt8(OFFSETS.liquidityMintDecimals),
    availableAmount: readU64LE(buf, OFFSETS.availableAmount),
    borrowedAmountWads: readU128LE(buf, OFFSETS.borrowedAmountWads),
    cumulativeBorrowRateWads: readU128LE(buf, OFFSETS.cumulativeBorrowRateWads),
    marketPrice: readU128LE(buf, OFFSETS.marketPrice),
    collateralMint: pk(OFFSETS.collateralMint),
    collateralMintTotalSupply: readU64LE(buf, OFFSETS.collateralMintTotalSupply),
    accumulatedProtocolFeesWads: readU128LE(buf, OFFSETS.accumulatedProtocolFeesWads),
  };
}

// Total underlying backing the collateral token, in raw units.
// available + borrowed - protocol fees, exactly as the program computes it.
export function totalLiquidityRaw(r) {
  return r.availableAmount + r.borrowedAmountWads / WAD - r.accumulatedProtocolFeesWads / WAD;
}

// One collateral token, priced in the underlying. This is the share price.
export function pricePerShare(r) {
  if (r.collateralMintTotalSupply === 0n) return null;
  return Number(totalLiquidityRaw(r)) / Number(r.collateralMintTotalSupply);
}

export async function readOnChain(rpc, reservePubkey) {
  const acct = await rpc.getAccountRaw(reservePubkey);
  if (!acct) throw new Error(`save: reserve account ${reservePubkey} does not exist`);
  if (acct.owner !== SAVE_PROGRAM_ID) {
    throw new Error(`save: ${reservePubkey} is owned by ${acct.owner}, not the Save lending program`);
  }
  const decoded = decodeReserve(acct.buffer);
  return {
    decoded,
    pricePerShare: pricePerShare(decoded),
    slot: acct.slot,
    readAtISO: new Date().toISOString(),
  };
}

export async function fetchAdvertised(reservePubkey) {
  const url = `${API}/v1/reserves?ids=${reservePubkey}`;
  const res = await getJson(url);
  const row = res?.results?.[0];
  if (!row?.rates?.supplyInterest) {
    return { figures: [], note: 'Save published no supplyInterest for this reserve' };
  }
  const pct = Number(row.rates.supplyInterest);
  if (!Number.isFinite(pct)) return { figures: [], note: 'Save published a supplyInterest that did not parse' };
  return {
    figures: [
      {
        label: 'Supply APY',
        pct,
        basis: BASES.SPOT_APY,
        includesRewards: false,
        sourceUrl: url,
        verbatim: `"rates":{"supplyInterest":"${row.rates.supplyInterest}","borrowInterest":"${row.rates.borrowInterest}"}`,
        capturedAt: new Date().toISOString(),
      },
    ],
    issuerReportedExchangeRate: row.cTokenExchangeRate ? Number(row.cTokenExchangeRate) : null,
    sourceUrl: url,
  };
}
