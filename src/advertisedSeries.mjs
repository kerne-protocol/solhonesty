// How much does the ADVERTISED figure move?
//
// This module exists because of a defect this project found in itself.
//
// The board compares one spot reading of an issuer's advertised rate against a
// 30 day realized figure, and calls the difference a gap. On 2026-08-04 that
// method reported Kamino's PYUSD reserve advertising 6.92 percent against 4.60
// realized, a 2.32 point gap, and it was nearly published as a finding about
// Kamino. Three days later the same code on the same reserve reported 3.25
// advertised against 4.76 realized: the gap had not narrowed, it had changed
// SIGN. On 2026-08-08 a single read caught the USDC reserve advertising 18.19
// percent, and a read minutes later returned 3.91.
//
// None of those readings was wrong. A lending reserve's supply APY is an
// instantaneous rate set by utilisation, and Kamino's own rate curve has a steep
// kink above 95 percent utilisation, where the borrow rate runs from 4.61 to
// 30.4 percent. A reserve oscillating in the high eighties therefore prints an
// advertised figure whose 30 day range spans a factor of 7 to 9. The realized
// figure over the same period moves by hundredths of a point.
//
// So a single spot reading minus a 30 day realized figure does not measure the
// product. It measures WHEN THE COLLECTOR RAN. Publishing that difference as a
// gap would be a real claim about somebody else's protocol built on an artifact
// of our own sampling, which is precisely the failure the comparability gate in
// basis.mjs was written to prevent, arriving through a door that gate does not
// cover.
//
// The fix is not to stop publishing the spot gap. It is to publish, beside it,
// the distribution the spot reading was drawn from, so a reader can see whether
// a given gap is a fact about the product or a fact about the clock.

/** Quantile by linear interpolation on a sorted array. */
function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Summarize a series of advertised readings.
 *
 * @param {Array<{timestampSeconds:number, pct:number}>} points
 * @param {{source?:string, field?:string, minObservations?:number}} [meta]
 */
export function summarizeAdvertisedSeries(points, meta = {}) {
  const minObs = meta.minObservations ?? 24;
  const clean = (Array.isArray(points) ? points : [])
    .filter((p) => p && Number.isFinite(p.pct) && Number.isFinite(p.timestampSeconds))
    .sort((a, b) => a.timestampSeconds - b.timestampSeconds);

  if (clean.length < minObs) {
    return {
      ok: false,
      reason: `advertised history has ${clean.length} usable observations, fewer than the ${minObs} required to describe a distribution`,
      observations: clean.length,
      source: meta.source ?? null,
      field: meta.field ?? null,
    };
  }

  const vals = clean.map((p) => p.pct).sort((a, b) => a - b);
  const min = vals[0];
  const max = vals[vals.length - 1];
  const median = quantile(vals, 0.5);
  const mean = clean.reduce((s, p) => s + p.pct, 0) / clean.length;

  return {
    ok: true,
    reason: null,
    observations: clean.length,
    fromISO: new Date(clean[0].timestampSeconds * 1000).toISOString(),
    toISO: new Date(clean[clean.length - 1].timestampSeconds * 1000).toISOString(),
    minPct: min,
    p25Pct: quantile(vals, 0.25),
    medianPct: median,
    p75Pct: quantile(vals, 0.75),
    maxPct: max,
    meanPct: mean,
    // How many times bigger the top of the range is than the bottom. Undefined
    // against a zero floor rather than Infinity, because Infinity serializes to
    // null in JSON and would silently become "not measured".
    spreadRatio: min > 0 ? max / min : null,
    source: meta.source ?? null,
    field: meta.field ?? null,
  };
}

/**
 * Where does one spot reading sit inside its own recent history?
 *
 * Returns the percentile of `spotPct` within the series, and a verdict on
 * whether a gap computed from that reading should be trusted as a statement
 * about the product.
 */
export function locateSpot(spotPct, summary, points) {
  if (!summary?.ok || !Number.isFinite(spotPct)) {
    return { ok: false, reason: summary?.reason ?? 'no advertised history to locate this reading in' };
  }
  const vals = (points ?? []).map((p) => p.pct).filter(Number.isFinite);
  if (vals.length === 0) return { ok: false, reason: 'no advertised history to locate this reading in' };

  const below = vals.filter((v) => v < spotPct).length;
  const equal = vals.filter((v) => v === spotPct).length;
  const percentile = ((below + equal / 2) / vals.length) * 100;

  // A reading in the middle half of its own distribution is a fair sample of
  // the product. Outside that, the gap it produces is mostly about the clock.
  const representative = spotPct >= summary.p25Pct && spotPct <= summary.p75Pct;

  return {
    ok: true,
    percentile,
    representative,
    reason: representative
      ? null
      : `this reading sits at the ${percentile.toFixed(0)}th percentile of the same figure's own ${summary.observations} observation history, which ranged ${summary.minPct.toFixed(2)} to ${summary.maxPct.toFixed(2)} percent, so a gap computed from it reflects the sampling instant as much as the product`,
  };
}
