// Jupiter Lend adapter.
//
// Jupiter Lend is the largest stablecoin lending venue on Solana by a wide
// margin, and it was missing from this board for the first week of the board's
// life. Its USDC market alone is roughly thirty times the size of the Kamino
// USDC reserve already listed here, so a board that omitted it was not thin, it
// was unrepresentative.
//
// Two things about this venue are worth stating before any number is read.
//
// THE ADVERTISED FIGURE IS AN APR, NOT AN APY.
// --------------------------------------------
// `supplyRate` is quoted in basis points of a SIMPLE annual rate. The realized
// figure on this board is a compounded annualization of a share price. Putting
// the raw APR next to it would compare a simple rate with a compounded one and
// manufacture a gap that is pure arithmetic.
//
// This was not assumed. It was established against an independent implementation:
// DeFiLlama computes `apyBase` for these same pools from its own reads, and on
// 2026-08-09 the daily-compounded conversion of `supplyRate` reproduced DeFiLlama's
// figure to five decimal places on four of the five USD reserves simultaneously
// (USDC 4.98 -> 5.10573, USDT 3.07 -> 3.11748, USDS 3.45 -> 3.51003, JupUSD
// 3.76 -> 3.83138). The fifth, USDG, had moved between the two reads. Four exact
// agreements across independently chosen reserves is not a coincidence.
//
// So this adapter publishes the APY, records the raw APR verbatim in the row,
// and names the conversion in `advertised_transform` so a reader can redo it.
//
// THE SHARE SUPPLY IS VERIFIABLE ON CHAIN. THE ASSETS ARE NOT.
// ------------------------------------------------------------
// Jupiter reports `totalAssets` and `totalSupply`, and the share price is their
// ratio. The denominator is the SPL mint supply of the jlToken, which anybody can
// read over plain JSON-RPC, and this adapter does read it: on 2026-08-09 the mint
// supply of jlUSDC was 387,162,414.086968 and Jupiter's reported `totalSupply` was
// the same integer. The numerator is internal accounting and cannot be recomputed
// from outside without decoding the lending program.
//
// That makes this measurement strictly weaker than the Save adapter, which
// derives both halves from raw account data, and strictly stronger than a third
// party's rate feed, which never touches the product at all. It gets its own
// method name rather than being folded into either neighbour.

import { getJson } from '../http.mjs';
import { BASES } from '../basis.mjs';

export const TOKENS_URL = 'https://lite-api.jup.ag/lend/v1/earn/tokens';

// Jupiter quotes rates in basis points of a simple annual rate.
export const RATE_SCALE = 100;

// Compounding convention used to turn that APR into the APY published here.
// Daily, which is the convention that reproduces DeFiLlama's independent figure.
export const COMPOUNDS_PER_YEAR = 365;

export const APR_TO_APY_NOTE =
  'Jupiter publishes supplyRate as a simple annual rate in basis points. This board publishes its daily compounded equivalent, apy = ((1 + apr/365) ^ 365 - 1) * 100, so that it answers the same question as the compounded realized figure it is placed next to. The raw basis point value is quoted in advertised_verbatim.';

// A simple annual rate in basis points, as the compounded annual yield it
// corresponds to. This is the one transformation this adapter applies to an
// issuer figure, and every row it touches says so.
export function aprBpsToApyPct(bps) {
  // Number(null) and Number('') are both 0, so an absent rate would otherwise be
  // published as a confident zero percent rather than as a missing figure. A
  // wrong number is worse than no number on a board about honesty.
  if (bps === null || bps === undefined || bps === '') return null;
  const n = Number(bps);
  if (!Number.isFinite(n)) return null;
  const apr = n / RATE_SCALE / 100;
  return (Math.pow(1 + apr / COMPOUNDS_PER_YEAR, COMPOUNDS_PER_YEAR) - 1) * 100;
}

// One read serves every Jupiter row.
export async function fetchTokens() {
  const res = await getJson(TOKENS_URL);
  if (!Array.isArray(res) || res.length === 0) {
    throw new Error('jupiter: the earn tokens endpoint returned no tokens');
  }
  return res;
}

export function selectToken(tokens, jlTokenAddress) {
  const t = tokens.find((x) => x.address === jlTokenAddress);
  if (!t) {
    throw new Error(`jupiter: no earn token with address ${jlTokenAddress} is listed by the issuer`);
  }
  return t;
}

// Share price, as total assets over total shares.
//
// Both sides carry the same number of decimals on every token this board lists,
// and that is asserted rather than assumed: if the issuer ever changes one
// without the other, the ratio silently stops being a share price.
export function sharePrice(token) {
  const shareDecimals = Number(token.decimals);
  const assetDecimals = Number(token.asset?.decimals);
  if (!Number.isFinite(shareDecimals) || !Number.isFinite(assetDecimals)) {
    throw new Error('jupiter: token is missing a decimals field on either the share or the asset');
  }
  if (shareDecimals !== assetDecimals) {
    throw new Error(
      `jupiter: share decimals ${shareDecimals} and asset decimals ${assetDecimals} differ, so total assets over total supply is not a share price`,
    );
  }
  const assets = BigInt(token.totalAssets);
  const supply = BigInt(token.totalSupply);
  if (supply === 0n) return null;
  return Number(assets) / Number(supply);
}

// The issuer also publishes convertToAssets, which is the same share price
// rounded to the token's own decimals. Recomputing the ratio and holding it
// against their rounded figure catches a payload where the two disagree for a
// reason other than rounding.
export function convertToAssetsPrice(token) {
  const c2a = Number(token.convertToAssets);
  const dec = Number(token.decimals);
  if (!Number.isFinite(c2a) || !Number.isFinite(dec)) return null;
  return c2a / Math.pow(10, dec);
}

// Quantization of a value rounded to `decimals` places, expressed relative to
// the value itself, with headroom for the rounding mode. A disagreement wider
// than this is not rounding.
export function roundingTolerance(token) {
  const dec = Number(token.decimals);
  const pps = sharePrice(token);
  if (!Number.isFinite(dec) || !Number.isFinite(pps) || pps <= 0) return 1e-5;
  return Math.max((Math.pow(10, -dec) / pps) * 4, 1e-9);
}

// Every figure Jupiter publishes for this product, each labelled with what it
// answers and whether it bundles an incentive the share price never contained.
//
// The rewards figure is published rather than dropped, and it is published as
// the LARGER of the two, which is exactly the number a board that ranked by
// whichever figure is biggest would pick up. The comparability gate takes the
// conservative one instead. See basis.mjs.
export function advertisedFigures(token, capturedAt = new Date().toISOString()) {
  const figures = [];
  const supplyApy = aprBpsToApyPct(token.supplyRate);
  if (Number.isFinite(supplyApy)) {
    figures.push({
      label: 'Supply APY',
      pct: supplyApy,
      basis: BASES.SPOT_APY,
      includesRewards: false,
      sourceUrl: TOKENS_URL,
      verbatim: `"symbol":"${token.symbol}","supplyRate":"${token.supplyRate}","rewardsRate":"${token.rewardsRate}","totalRate":"${token.totalRate}"`,
      capturedAt,
      transform: APR_TO_APY_NOTE,
    });
  }

  const rewardsBps = Number(token.rewardsRate);
  const totalApy = aprBpsToApyPct(token.totalRate);
  if (Number.isFinite(rewardsBps) && rewardsBps > 0 && Number.isFinite(totalApy)) {
    figures.push({
      label: 'Total APY including rewards',
      pct: totalApy,
      basis: BASES.SPOT_APY,
      includesRewards: true,
      sourceUrl: TOKENS_URL,
      verbatim: `"symbol":"${token.symbol}","totalRate":"${token.totalRate}"`,
      capturedAt,
      transform: APR_TO_APY_NOTE,
    });
  }
  return figures;
}

export async function fetchAdvertised(token) {
  const figures = advertisedFigures(token);
  if (figures.length === 0) {
    return { figures: [], note: 'Jupiter published no parseable supply rate for this token' };
  }
  return { figures, sourceUrl: TOKENS_URL };
}

// Read the jlToken mint supply over plain JSON-RPC and hold it against the
// denominator the issuer reported. The two reads are of different slots, so
// normal deposit and withdrawal flow between them is expected; the tolerance is
// wide enough for that and far too tight for a fabricated denominator.
export const SUPPLY_AGREEMENT_TOLERANCE = 0.01;

export async function verifyShareSupply(rpc, token) {
  const supply = await rpc.getTokenSupply(token.address);
  if (!supply?.amount) {
    return { ok: false, reason: `jupiter: the mint ${token.address} returned no supply`, onChain: null };
  }
  const onChain = BigInt(supply.amount);
  const reported = BigInt(token.totalSupply);
  if (reported === 0n) {
    return { ok: false, reason: 'jupiter reported a zero share supply', onChain: onChain.toString() };
  }
  const relative = Math.abs(Number(onChain - reported) / Number(reported));
  return {
    ok: relative <= SUPPLY_AGREEMENT_TOLERANCE,
    onChain: onChain.toString(),
    reported: reported.toString(),
    relativeDifference: relative,
    reason:
      relative <= SUPPLY_AGREEMENT_TOLERANCE
        ? null
        : `the jlToken mint supply on chain and the share supply Jupiter reports differ by ${(relative * 100).toFixed(4)} percent, which is wider than flow between two reads explains`,
  };
}
