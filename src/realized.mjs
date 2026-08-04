// Realized yield, computed from a share price rather than taken from a claim.
//
// A share price is the only measure of a yield product that a holder cannot be
// talked out of: it is what one unit of the share token converts into, and it
// moves only when value actually lands. Solana has no ERC-4626, so there is no
// single call that returns it. Each adapter is responsible for producing a
// series of { timestampSeconds, pricePerShare }; everything downstream is this
// file, and it is the same arithmetic for every product on the board.

export const MIN_WINDOW_DAYS = 7;

export function annualize({ ppsFrom, ppsTo, elapsedSeconds }) {
  if (!Number.isFinite(ppsFrom) || !Number.isFinite(ppsTo) || ppsFrom <= 0 || ppsTo <= 0) {
    return { ok: false, reason: 'share price series contained a non positive or non finite value' };
  }
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return { ok: false, reason: 'the two share price reads were not separated by a positive amount of time' };
  }
  const days = elapsedSeconds / 86_400;
  if (days < MIN_WINDOW_DAYS) {
    return {
      ok: false,
      reason: `only ${days.toFixed(2)} days of share price history exist for this product, and this board refuses to annualize a window shorter than ${MIN_WINDOW_DAYS} days`,
      windowDays: days,
    };
  }
  const ratio = ppsTo / ppsFrom;
  const growthPct = (ratio - 1) * 100;
  const annualizedPct = (Math.pow(ratio, 365 / days) - 1) * 100;
  return {
    ok: true,
    ppsFrom,
    ppsTo,
    elapsedSeconds,
    windowDays: Number(days.toFixed(6)),
    growthPct: Number(growthPct.toFixed(9)),
    annualizedPct: Number(annualizedPct.toFixed(6)),
  };
}

// Take a series and measure the longest window that ends at the newest point
// and is no longer than targetDays.
export function realizedFromSeries(series, targetDays = 30, opts = {}) {
  const { includesRewards = false, method = 'onchain_share_price', source = null } = opts;
  if (!Array.isArray(series) || series.length < 2) {
    return { ok: false, reason: 'fewer than two share price observations exist for this product', method, source };
  }
  const sorted = [...series].sort((a, b) => a.timestampSeconds - b.timestampSeconds);
  const last = sorted[sorted.length - 1];
  const cutoff = last.timestampSeconds - targetDays * 86_400;

  // The first observation at or after the cutoff. If the whole series is newer
  // than the cutoff, use the oldest point we have and report the real window.
  const start = sorted.find((p) => p.timestampSeconds >= cutoff) ?? sorted[0];
  const first = start.timestampSeconds >= last.timestampSeconds ? sorted[0] : start;

  const res = annualize({
    ppsFrom: first.pricePerShare,
    ppsTo: last.pricePerShare,
    elapsedSeconds: last.timestampSeconds - first.timestampSeconds,
  });

  return {
    ...res,
    method,
    source,
    includesRewards,
    observations: sorted.length,
    fromISO: new Date(first.timestampSeconds * 1000).toISOString(),
    toISO: new Date(last.timestampSeconds * 1000).toISOString(),
  };
}

// Fallback measure used only when no share price series exists: the time
// weighted mean of a third party's daily rate observations. This is weaker than
// a share price and the row says so in its own `method` field, because a reader
// who cannot tell the two apart has been misled by the format rather than by
// the numbers.
export function realizedFromRateSeries(points, targetDays = 30, opts = {}) {
  const { source = null, includesRewards = false } = opts;
  if (!Array.isArray(points) || points.length < 2) {
    return { ok: false, reason: 'fewer than two rate observations exist for this product', method: 'thirdparty_rate_series', source };
  }
  const sorted = [...points]
    .filter((p) => Number.isFinite(p.aprPct) && Number.isFinite(p.timestampSeconds))
    .sort((a, b) => a.timestampSeconds - b.timestampSeconds);
  if (sorted.length < 2) {
    return { ok: false, reason: 'the rate series contained fewer than two usable observations', method: 'thirdparty_rate_series', source };
  }
  const last = sorted[sorted.length - 1];
  const cutoff = last.timestampSeconds - targetDays * 86_400;
  const window = sorted.filter((p) => p.timestampSeconds >= cutoff);
  if (window.length < 2) {
    return { ok: false, reason: 'the rate series has fewer than two observations inside the window', method: 'thirdparty_rate_series', source };
  }

  // Time weighted so that a gap in the feed cannot be counted as if it were a
  // single day, which is what an unweighted mean silently does.
  let weighted = 0;
  let totalSeconds = 0;
  for (let i = 1; i < window.length; i++) {
    const dt = window[i].timestampSeconds - window[i - 1].timestampSeconds;
    if (dt <= 0) continue;
    weighted += window[i - 1].aprPct * dt;
    totalSeconds += dt;
  }
  if (totalSeconds <= 0) {
    return { ok: false, reason: 'the rate series observations carried no elapsed time between them', method: 'thirdparty_rate_series', source };
  }
  const days = totalSeconds / 86_400;
  if (days < MIN_WINDOW_DAYS) {
    return {
      ok: false,
      reason: `the rate series covers only ${days.toFixed(2)} days, shorter than the ${MIN_WINDOW_DAYS} day minimum`,
      method: 'thirdparty_rate_series',
      source,
    };
  }
  return {
    ok: true,
    annualizedPct: Number((weighted / totalSeconds).toFixed(6)),
    windowDays: Number(days.toFixed(6)),
    observations: window.length,
    method: 'thirdparty_rate_series',
    source,
    includesRewards,
    fromISO: new Date(window[0].timestampSeconds * 1000).toISOString(),
    toISO: new Date(last.timestampSeconds * 1000).toISOString(),
  };
}
