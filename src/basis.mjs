// The comparability gate.
//
// This is the part of the method that people get wrong, and getting it wrong
// always flatters somebody. A protocol quoting an inception-to-date average is
// not saying the same thing as a protocol quoting the rate a holder earns
// today, and a figure that includes a temporary incentive is not the same thing
// as carry. If you rank a board by whichever number is largest on each
// protocol's page, you produce a ranking that measures marketing copy.
//
// So a figure is compared only when its basis answers the same question the
// realized figure answers: what did a holder actually earn over the trailing
// window, from the product itself.
//
// Everything else is still published. It is just published as NOT COMPARABLE,
// with the reason attached, instead of being silently averaged into a league
// table.

export const BASES = Object.freeze({
  SPOT_APY: 'spot-apy',
  TRAILING_30D: 'trailing-30d',
  TRAILING_7D: 'trailing-7d',
  TRAILING_24H: 'trailing-24h',
  INCEPTION_TO_DATE: 'inception-to-date',
  MODELED: 'modeled',
  TARGET: 'target',
  RANGE_MAX: 'range-max',
  UNKNOWN: 'unknown',
});

// Bases that answer the same question as a trailing realized measurement.
const COMPARABLE_BASES = new Set([BASES.SPOT_APY, BASES.TRAILING_30D]);

const REASONS = {
  [BASES.TRAILING_7D]:
    'a trailing 7 day figure is a different window from the 30 day realized window and moves far more with a single day',
  [BASES.TRAILING_24H]:
    'a trailing 24 hour figure annualizes one day and is not a window a holder can earn',
  [BASES.INCEPTION_TO_DATE]:
    'a since inception average is not what a holder earns today, so subtracting it from a trailing realized figure measures history rather than the current product',
  [BASES.MODELED]:
    'a modeled or expected figure has not been paid, so comparing it to a realized figure compares a forecast with a record',
  [BASES.TARGET]: 'a target is an intention, not a rate any holder has received',
  [BASES.RANGE_MAX]:
    'the top of an advertised range is the best case, and taking the best case is exactly the failure this gate exists to stop',
  [BASES.UNKNOWN]: 'the basis of this figure is not stated on the source surface, so it cannot be matched to a window',
};

export function isComparableBasis(basis) {
  return COMPARABLE_BASES.has(basis);
}

export function nonComparableReason(basis) {
  if (isComparableBasis(basis)) return null;
  return REASONS[basis] ?? REASONS[BASES.UNKNOWN];
}

// Rewards handling. A realized share price includes only what the product
// itself paid into the share price. If an advertised figure bundles an external
// incentive, the two are measuring different things.
export function rewardsMismatch(advertised, realized) {
  if (!advertised || !realized) return null;
  if (advertised.includesRewards && realized.includesRewards === false) {
    return 'the advertised figure bundles an external incentive while the realized figure reads only the product share price';
  }
  return null;
}

// Pick the ONE advertised figure a row is judged on.
//
// Deliberately NOT the maximum. When a protocol publishes several figures the
// comparable one wins; among comparable ones the most conservative wins, so a
// protocol can never improve its standing on this board by adding a bigger
// number to its own page.
export function pickAdvertised(figures) {
  if (!Array.isArray(figures) || figures.length === 0) return null;
  const comparable = figures.filter((f) => isComparableBasis(f.basis) && Number.isFinite(f.pct));
  if (comparable.length > 0) {
    return comparable.reduce((min, f) => (f.pct < min.pct ? f : min));
  }
  return null;
}

// The full verdict for one row.
export function assessRow({ advertisedFigures, realized }) {
  const chosen = pickAdvertised(advertisedFigures);
  const published = Array.isArray(advertisedFigures) ? advertisedFigures.length : 0;

  if (!realized || !realized.ok) {
    return {
      comparable: false,
      reason: realized?.reason ?? 'no realized figure could be computed for this product',
      advertisedPct: chosen?.pct ?? null,
      realizedPct: null,
      gapPct: null,
      deliveredPct: null,
      publishedFigures: published,
    };
  }

  if (!chosen) {
    const anyBasis = advertisedFigures?.[0]?.basis ?? BASES.UNKNOWN;
    return {
      comparable: false,
      reason:
        published === 0
          ? 'this product publishes no yield figure on a public surface we can read'
          : nonComparableReason(anyBasis),
      advertisedPct: null,
      realizedPct: round(realized.annualizedPct, 4),
      gapPct: null,
      deliveredPct: null,
      publishedFigures: published,
    };
  }

  const mismatch = rewardsMismatch(chosen, realized);
  if (mismatch) {
    return {
      comparable: false,
      reason: mismatch,
      advertisedPct: round(chosen.pct, 4),
      realizedPct: round(realized.annualizedPct, 4),
      gapPct: null,
      deliveredPct: null,
      publishedFigures: published,
    };
  }

  const gap = chosen.pct - realized.annualizedPct;
  // Delivery ratio is undefined against a zero or negative advertised figure.
  const delivered = chosen.pct > 0 ? (realized.annualizedPct / chosen.pct) * 100 : null;

  return {
    comparable: true,
    reason: null,
    advertisedPct: round(chosen.pct, 4),
    realizedPct: round(realized.annualizedPct, 4),
    gapPct: round(gap, 4),
    deliveredPct: delivered === null ? null : round(delivered, 2),
    publishedFigures: published,
  };
}

export function round(n, dp) {
  if (!Number.isFinite(n)) return null;
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}
