// Temporal meal-to-outcome correlation (HANDOFF.md flagship trio).
// Windowed join: meals with a given ingredient tag that were followed by a
// bad outcome within a configurable window. Pure, fixture-testable — no React.

import type { LogEntry } from '@/db/schema';
import { FOOD_TYPES } from '@/db/schema';
import { isBadBristol } from '@/features/bm/bristol';
import { isSentimentValue } from '@/features/sentiment/scale';
import { isSeverityValue } from '@/features/symptoms/severity';
import { parseTagsJson } from '@/lib/ingredients';
import { wilsonLowerBound, type ConfidenceTier } from '@/lib/stats';

export const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
export const DEFAULT_MIN_MEALS = 3;
/** Meals needed before a raw-hit-rate finding can qualify as medium confidence. */
export const MEDIUM_CONFIDENCE_MIN_MEALS = 5;
/** Raw hit-rate margin over baseRate needed for medium confidence (when Wilson doesn't clear baseRate). */
export const MEDIUM_HIT_RATE_MARGIN = 0.15;
/** At most this many low-confidence findings are shown, and only when nothing better exists. */
export const MAX_LOW_CONFIDENCE_FINDINGS = 3;

const FOOD_TYPES_SET = new Set(FOOD_TYPES as readonly string[]);

/**
 * A rough outcome: a bad BM (Bristol 1, 2, 6, 7), a BM that felt bad (feel
 * rating <= 2), or a significant symptom (severity >= 3). Food entries are
 * never outcomes — analysis keys on outcomes, not meal ratings. A BM's
 * optional "how did it feel?" rating lives in the same `sentiment` column as
 * the food-entry rating; that's what the BM feel-rating arm reads here.
 */
export function isOutcome(entry: LogEntry): boolean {
  if (entry.type === 'bowel_movement') {
    return (
      isBadBristol(entry.bristolScale) ||
      (isSentimentValue(entry.sentiment) && (entry.sentiment as number) <= 2)
    );
  }
  if (entry.type === 'symptom') {
    return isSeverityValue(entry.severity) && (entry.severity as number) >= 3;
  }
  return false;
}

/**
 * For each of `meals`, whether it was followed by >=1 outcome (anywhere in
 * `entries`) within `windowMs` — the strictly-after, inclusive-of-boundary
 * join rule shared by every outcome-rate analysis. Returns a map keyed by
 * meal id. Exported so callers outside this module (e.g. a nutrient-split
 * outcome analysis) can reuse the same join instead of re-deriving it.
 */
export function mealsFollowedByOutcome(
  entries: readonly LogEntry[],
  meals: readonly LogEntry[],
  windowMs: number = DEFAULT_WINDOW_MS,
): Map<string, boolean> {
  const outcomes = entries.filter(isOutcome);
  function hasFollowingOutcome(meal: LogEntry): boolean {
    return outcomes.some(
      (o) => o.loggedAt > meal.loggedAt && o.loggedAt <= meal.loggedAt + windowMs,
    );
  }
  return new Map(meals.map((m) => [m.id, hasFollowingOutcome(m)]));
}

/** A grouping key + its display label, as produced by an `analyzeOutcomeRates` caller. */
export interface OutcomeKey {
  key: string;
  label: string;
}

export interface OutcomeFinding {
  key: string;
  label: string;
  /** Meals (food entries) contributing to this group. */
  occurrences: number;
  /** How many of those meals were followed by >=1 outcome within windowMs. */
  hits: number;
  /** hits / occurrences. */
  hitRate: number;
  /** Fraction of all eligible meals that are followed by any outcome — the baseline. */
  baseRate: number;
  confidence: ConfidenceTier;
}

export interface OutcomeRateOptions {
  windowMs?: number;
  minOccurrences?: number;
}

/**
 * For each grouping key returned by `keysOf`, measure how often a meal in
 * that group is followed by a bad outcome within `windowMs`. Reports groups
 * whose hit rate exceeds the overall base rate, gated on a minimum number of
 * meals in the group, and labels each finding's confidence via a Wilson
 * score interval:
 *  - `high`  — the Wilson lower bound on the group's hit rate clears baseRate
 *              (the excess risk is unlikely to be noise even at the pessimistic end).
 *  - `medium` — the raw hit rate clears baseRate by MEDIUM_HIT_RATE_MARGIN with
 *              at least MEDIUM_CONFIDENCE_MIN_MEALS meals, but the Wilson bound
 *              doesn't clear baseRate outright.
 *  - `low`   — excess risk exists but neither bar above is cleared.
 *
 * All medium+high findings are surfaced; low-confidence findings are included
 * only when nothing better exists, capped at MAX_LOW_CONFIDENCE_FINDINGS.
 *
 * Findings are sorted by (hitRate − baseRate) descending — highest excess risk first.
 *
 * A meal may contribute to several groups at once (`keysOf` may return more
 * than one key). When a key is seen from more than one meal, the label from
 * the first meal it's seen on wins.
 */
export function analyzeOutcomeRates(
  entries: readonly LogEntry[],
  keysOf: (meal: LogEntry) => OutcomeKey[],
  options: OutcomeRateOptions = {},
): OutcomeFinding[] {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const minOccurrences = options.minOccurrences ?? DEFAULT_MIN_MEALS;

  // Food entries that yield at least one grouping key — these are the potential triggers.
  const eligibleMeals = entries.filter(
    (e) => FOOD_TYPES_SET.has(e.type) && keysOf(e).length > 0,
  );

  if (eligibleMeals.length === 0) return [];

  const mealOutcomeMap = mealsFollowedByOutcome(entries, eligibleMeals, windowMs);

  const baseHits = eligibleMeals.filter((m) => mealOutcomeMap.get(m.id)).length;
  const baseRate = eligibleMeals.length > 0 ? baseHits / eligibleMeals.length : 0;

  // Group by key (first-seen label wins).
  const byKey = new Map<string, { label: string; meals: LogEntry[] }>();
  for (const meal of eligibleMeals) {
    for (const { key, label } of keysOf(meal)) {
      const group = byKey.get(key) ?? { label, meals: [] };
      group.meals.push(meal);
      byKey.set(key, group);
    }
  }

  const highOrMedium: OutcomeFinding[] = [];
  const low: OutcomeFinding[] = [];
  for (const [key, group] of byKey.entries()) {
    if (group.meals.length < minOccurrences) continue;
    const hits = group.meals.filter((m) => mealOutcomeMap.get(m.id)).length;
    const hitRate = hits / group.meals.length;
    if (hitRate <= baseRate) continue; // no excess risk

    const lowerBound = wilsonLowerBound(hits, group.meals.length);
    let confidence: ConfidenceTier;
    if (lowerBound > baseRate) {
      confidence = 'high';
    } else if (hitRate >= baseRate + MEDIUM_HIT_RATE_MARGIN && group.meals.length >= MEDIUM_CONFIDENCE_MIN_MEALS) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    const finding: OutcomeFinding = {
      key,
      label: group.label,
      occurrences: group.meals.length,
      hits,
      hitRate: Math.round(hitRate * 100) / 100,
      baseRate: Math.round(baseRate * 100) / 100,
      confidence,
    };
    if (confidence === 'low') {
      low.push(finding);
    } else {
      highOrMedium.push(finding);
    }
  }

  const byExcessDesc = (a: OutcomeFinding, b: OutcomeFinding) =>
    b.hitRate - b.baseRate - (a.hitRate - a.baseRate);

  highOrMedium.sort(byExcessDesc);
  if (highOrMedium.length > 0) return highOrMedium;

  return low.sort(byExcessDesc).slice(0, MAX_LOW_CONFIDENCE_FINDINGS);
}

/**
 * Per-tag RAW hit rates (hits / occurrences) over the same tag-eligible meals
 * and window `analyzeTemporalTriggers` uses, but with NO gating (minOccurrences,
 * excess-over-baseline) and NO rounding — callers needing precision beyond 2dp
 * (e.g. a pair-interaction filter comparing two raw rates) should use this
 * instead of reading `hitRate` off an `OutcomeFinding`. Returns an empty map
 * when there are no tag-eligible meals.
 */
export function tagHitRates(
  entries: readonly LogEntry[],
  windowMs: number = DEFAULT_WINDOW_MS,
): Map<string, number> {
  const taggedMeals = entries.filter(
    (e) => FOOD_TYPES_SET.has(e.type) && parseTagsJson(e.tagsJson).length > 0,
  );

  const mealOutcomeMap = mealsFollowedByOutcome(entries, taggedMeals, windowMs);

  const byTag = new Map<string, { hits: number; total: number }>();
  for (const meal of taggedMeals) {
    const hit = mealOutcomeMap.get(meal.id) ?? false;
    for (const tag of parseTagsJson(meal.tagsJson)) {
      const group = byTag.get(tag) ?? { hits: 0, total: 0 };
      group.total += 1;
      if (hit) group.hits += 1;
      byTag.set(tag, group);
    }
  }

  const rates = new Map<string, number>();
  for (const [tag, group] of byTag.entries()) {
    rates.set(tag, group.hits / group.total);
  }
  return rates;
}

export interface TemporalFinding {
  tag: string;
  /** Meals (food entries with this tag) in the dataset. */
  meals: number;
  /** How many of those meals were followed by ≥1 outcome within windowMs. */
  hits: number;
  /** hits / meals. */
  hitRate: number;
  /** Fraction of all tagged meals that are followed by any outcome — the baseline. */
  baseRate: number;
  confidence: ConfidenceTier;
}

export interface TemporalOptions {
  windowMs?: number;
  minMeals?: number;
}

/**
 * Thin wrapper over `analyzeOutcomeRates`, grouping by ingredient tag (the
 * original, tag-specific shape of this analyzer). See `analyzeOutcomeRates`
 * for the gating/confidence-tier rules, which apply unchanged here.
 */
export function analyzeTemporalTriggers(
  entries: readonly LogEntry[],
  options: TemporalOptions = {},
): TemporalFinding[] {
  const findings = analyzeOutcomeRates(
    entries,
    (meal) => parseTagsJson(meal.tagsJson).map((tag) => ({ key: tag, label: tag })),
    { windowMs: options.windowMs, minOccurrences: options.minMeals },
  );

  return findings.map((f) => ({
    tag: f.key,
    meals: f.occurrences,
    hits: f.hits,
    hitRate: f.hitRate,
    baseRate: f.baseRate,
    confidence: f.confidence,
  }));
}
