// Temporal meal-to-outcome correlation (HANDOFF.md flagship trio).
// Windowed join: meals with a given ingredient tag that were followed by a
// bad outcome within a configurable window. Pure, fixture-testable — no React.

import type { LogEntry } from '@/db/schema';
import { FOOD_TYPES } from '@/db/schema';
import { isBristolValue } from '@/features/bm/bristol';
import { isSentimentValue } from '@/features/sentiment/scale';
import { isSeverityValue } from '@/features/symptoms/severity';
import { parseTagsJson } from '@/lib/ingredients';

export const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
export const DEFAULT_MIN_MEALS = 3;

const FOOD_TYPES_SET = new Set(FOOD_TYPES as readonly string[]);
const BAD_BRISTOL_TYPES = new Set([1, 2, 6, 7]);

/**
 * An outcome is something that represents a poor gut experience:
 * a bad BM (Bristol 1, 2, 6, or 7), a significant symptom (severity ≥ 3),
 * or a food entry rated poorly (sentiment ≤ 2).
 */
export function isOutcome(entry: LogEntry): boolean {
  if (entry.type === 'bowel_movement') {
    return isBristolValue(entry.bristolScale) && BAD_BRISTOL_TYPES.has(entry.bristolScale as number);
  }
  if (entry.type === 'symptom') {
    return isSeverityValue(entry.severity) && (entry.severity as number) >= 3;
  }
  if (FOOD_TYPES_SET.has(entry.type)) {
    return isSentimentValue(entry.sentiment) && (entry.sentiment as number) <= 2;
  }
  return false;
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
}

export interface TemporalOptions {
  windowMs?: number;
  minMeals?: number;
}

/**
 * For each ingredient tag, measure how often a meal containing it is followed
 * by a bad outcome within `windowMs`. Reports tags whose hit rate exceeds the
 * overall base rate, gated on a minimum number of meals with that tag.
 *
 * Findings are sorted by (hitRate − baseRate) descending — highest excess risk first.
 */
export function analyzeTemporalTriggers(
  entries: readonly LogEntry[],
  options: TemporalOptions = {},
): TemporalFinding[] {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const minMeals = options.minMeals ?? DEFAULT_MIN_MEALS;

  // Food entries that have at least one tag — these are the potential triggers.
  const taggedMeals = entries.filter(
    (e) => FOOD_TYPES_SET.has(e.type) && parseTagsJson(e.tagsJson).length > 0,
  );

  if (taggedMeals.length === 0) return [];

  const outcomes = entries.filter(isOutcome);

  // Precompute: did this meal have any outcome following it within the window?
  function hasFollowingOutcome(meal: LogEntry): boolean {
    return outcomes.some(
      (o) => o.loggedAt > meal.loggedAt && o.loggedAt <= meal.loggedAt + windowMs,
    );
  }

  const mealOutcomeMap = new Map<string, boolean>(
    taggedMeals.map((m) => [m.id, hasFollowingOutcome(m)]),
  );

  const baseHits = taggedMeals.filter((m) => mealOutcomeMap.get(m.id)).length;
  const baseRate = taggedMeals.length > 0 ? baseHits / taggedMeals.length : 0;

  // Group by tag.
  const byTag = new Map<string, { meals: LogEntry[] }>();
  for (const meal of taggedMeals) {
    for (const tag of parseTagsJson(meal.tagsJson)) {
      const group = byTag.get(tag) ?? { meals: [] };
      group.meals.push(meal);
      byTag.set(tag, group);
    }
  }

  const findings: TemporalFinding[] = [];
  for (const [tag, group] of byTag.entries()) {
    if (group.meals.length < minMeals) continue;
    const hits = group.meals.filter((m) => mealOutcomeMap.get(m.id)).length;
    const hitRate = hits / group.meals.length;
    if (hitRate <= baseRate) continue; // no excess risk
    findings.push({
      tag,
      meals: group.meals.length,
      hits,
      hitRate: Math.round(hitRate * 100) / 100,
      baseRate: Math.round(baseRate * 100) / 100,
    });
  }

  return findings.sort((a, b) => b.hitRate - b.baseRate - (a.hitRate - a.baseRate));
}
