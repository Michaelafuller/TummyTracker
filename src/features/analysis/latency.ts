// Reaction latency (#21): how long after eating a finding's meals the first
// rough outcome usually arrived. Purely descriptive — a median and a
// 25th–75th percentile range over the hit meals, never a claim of cause.

const HOUR_MS = 60 * 60 * 1000;

/** Fewer hits than this and the range says nothing — no summary is produced. */
export const MIN_LATENCY_HITS = 3;

export interface LatencySummary {
  /** Median delay in whole hours (0 means under an hour). */
  medianH: number;
  /** 25th percentile, whole hours. */
  lowH: number;
  /** 75th percentile, whole hours. */
  highH: number;
  /** Hit meals the summary is built from. */
  n: number;
}

/** Nearest-rank percentile of an ascending-sorted list: the value at rank ceil(p * n). */
function nearestRank(sorted: readonly number[], p: number): number {
  const rank = Math.max(1, Math.ceil(p * sorted.length));
  return sorted[rank - 1];
}

/**
 * Whole hours, with anything under an hour reported as 0 ("within the hour")
 * rather than rounding 40 minutes up to "about 1 h". Monotone, so low <=
 * median <= high survives the rounding.
 */
function wholeHours(ms: number): number {
  return ms < HOUR_MS ? 0 : Math.round(ms / HOUR_MS);
}

/**
 * Median and 25th–75th percentile (nearest-rank on the sorted delays — for an
 * even count the median is the lower middle value) of the given delays in
 * milliseconds, rounded to whole hours. Null with fewer than MIN_LATENCY_HITS
 * delays.
 */
export function latencySummary(delaysMs: readonly number[]): LatencySummary | null {
  if (delaysMs.length < MIN_LATENCY_HITS) return null;
  const sorted = [...delaysMs].sort((a, b) => a - b);
  return {
    medianH: wholeHours(nearestRank(sorted, 0.5)),
    lowH: wholeHours(nearestRank(sorted, 0.25)),
    highH: wholeHours(nearestRank(sorted, 0.75)),
    n: sorted.length,
  };
}

/** "Usually about 5 h later (3–8 h)"; "Usually within an hour"; "Usually about 5 h later" when the range collapses. */
export function latencyLine(s: LatencySummary): string {
  if (s.medianH < 1) return 'Usually within an hour';
  if (s.lowH === s.highH) return `Usually about ${s.medianH} h later`;
  return `Usually about ${s.medianH} h later (${s.lowH}–${s.highH} h)`;
}

/** Per-meal wording for the detail screen: "5 h later" / "within the hour". */
export function delayPhrase(delayMs: number): string {
  const hours = wholeHours(delayMs);
  return hours < 1 ? 'within the hour' : `${hours} h later`;
}
