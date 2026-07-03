// Pure statistics helpers for Insights v2 (HANDOFF.md Phase 3.1).
// No React, no I/O — fully fixture-testable. These back the baseline-relative
// findings, Wilson-gated temporal findings, and confidence labeling.

/** Arithmetic mean. Callers must pass a non-empty array. */
export function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Sample standard deviation (n − 1 denominator). Returns 0 for fewer than two
 * values — a single point has no spread to estimate.
 */
export function sd(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) * (v - m), 0) / (n - 1);
  return Math.sqrt(variance);
}

/**
 * Welch-style standard error of the difference between two independent sample
 * means: sqrt(s1²/n1 + s2²/n2), using the SAMPLE standard deviation (n − 1) of
 * each group.
 */
export function seMeanDiff(s1: number, n1: number, s2: number, n2: number): number {
  return Math.sqrt((s1 * s1) / n1 + (s2 * s2) / n2);
}

/**
 * Wilson score interval lower bound for a proportion (95% by default, z = 1.96).
 * Standard closed-form Wilson score, no continuity correction. Returns 0 when
 * n is 0 (nothing to estimate).
 */
export function wilsonLowerBound(successes: number, n: number, z = 1.96): number {
  if (n === 0) return 0;
  const p = successes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return (centre - margin) / denominator;
}

export type ConfidenceTier = 'low' | 'medium' | 'high';

/** Minimum sample size + effect-vs-SE multiples gating each confidence tier. */
export const HIGH_CONFIDENCE_MIN_N = 10;
export const HIGH_CONFIDENCE_SE_MULTIPLE = 2;
export const MEDIUM_CONFIDENCE_MIN_N = 5;
export const MEDIUM_CONFIDENCE_SE_MULTIPLE = 1.5;

/**
 * Labels a finding's confidence from its sample size, effect size, and
 * standard error. `high` requires n ≥ 10 AND |effect| ≥ 2·se; `medium`
 * requires n ≥ 5 AND |effect| ≥ 1.5·se; anything else is `low`.
 */
export function confidenceTier({
  n,
  effect,
  se,
}: {
  n: number;
  effect: number;
  se: number;
}): ConfidenceTier {
  const absEffect = Math.abs(effect);
  if (n >= HIGH_CONFIDENCE_MIN_N && absEffect >= HIGH_CONFIDENCE_SE_MULTIPLE * se) {
    return 'high';
  }
  if (n >= MEDIUM_CONFIDENCE_MIN_N && absEffect >= MEDIUM_CONFIDENCE_SE_MULTIPLE * se) {
    return 'medium';
  }
  return 'low';
}
