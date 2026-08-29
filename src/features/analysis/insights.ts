// Pure correlation/insight functions (BUILD_PLAN.md Phase 3, reworked into the
// outcome-based engine at Milestone B3). Baseline-relative, confidence-labeled
// findings over the user's own logs — these are observations, never medical
// advice; the UI states that plainly.
//
// React-free and fixture-testable: this is where Phase 3's verification leverage is.

import type { LogEntry } from '@/db/schema';
import { FOOD_TYPES } from '@/db/schema';
import { NUTRITION_FIELDS, type NutritionField } from '@/lib/validation';
import { parseTagsJson } from '@/lib/ingredients';
import { wilsonLowerBound, type ConfidenceTier } from '@/lib/stats';
import {
  analyzeOutcomeRates,
  isOutcome,
  MEDIUM_CONFIDENCE_MIN_MEALS,
  mealsFollowedByOutcome,
  tagHitRates,
  type OutcomeFinding,
  type OutcomeKey,
} from './temporal';

export type { ConfidenceTier };
export type { OutcomeFinding, OutcomeKey };

/** Nutrient split needs at least this many samples with the field set (≥4 per side). */
export const MIN_NUTRIENT_SAMPLES = 8;
export const MIN_GROUP_SIZE = 4;
export const MIN_FOOD_OCCURRENCES = 3;
/** Tag-pair analysis considers only the N most frequent tags (bounds the pair space). */
export const MAX_PAIR_TAGS = 15;
/** A pair needs at least this many co-occurring meals. */
export const MIN_PAIR_OCCURRENCES = 3;
export const MAX_PAIR_FINDINGS = 5;
/** A pair's hit rate must beat BOTH constituent tags' raw hit rates by this
 * margin to count as a genuine interaction, not just two independently-risky
 * ingredients sharing meals. */
export const PAIR_RATE_MARGIN = 0.1;
/** Minimum high-vs-low outcome-rate gap for a nutrient finding to surface. */
export const NUTRIENT_RATE_MARGIN = 0.15;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isFood(entry: LogEntry): boolean {
  return (FOOD_TYPES as readonly string[]).includes(entry.type);
}

// --- Outcome-based analyses (Milestone B2, promoted to the sole engine at
// Milestone B3). Keyed on `isOutcome` (a bad BM, a low-rated BM, or a
// significant symptom within the window) rather than a meal's own sentiment
// rating. See temporal.ts for the shared engine (`analyzeOutcomeRates`,
// `tagHitRates`, `mealsFollowedByOutcome`).

/**
 * Ingredient/allergen/additive tags whose meals are followed by a rough
 * outcome (`isOutcome`) more often than the overall baseline. Gating/
 * confidence tiers are exactly `analyzeOutcomeRates`'s (Wilson-tiered,
 * minOccurrences, low-only fallback). This is also the temporal
 * (ingredient-to-outcome timing) analysis — there is no separate "timing"
 * finding set; ingredient outcomes ARE the timing analysis.
 */
export function analyzeIngredientOutcomes(entries: readonly LogEntry[]): OutcomeFinding[] {
  return analyzeOutcomeRates(entries, (meal) =>
    parseTagsJson(meal.tagsJson).map((tag) => ({ key: tag, label: tag })),
  );
}

/**
 * Recurring foods (grouped by name, case-insensitive; the first-seen casing
 * is kept as the label) whose meals are followed by a rough outcome more
 * often than the overall baseline.
 */
export function analyzeFoodOutcomes(entries: readonly LogEntry[]): OutcomeFinding[] {
  return analyzeOutcomeRates(
    entries,
    (meal) => {
      const name = meal.name.trim();
      return name.length > 0 ? [{ key: name.toLowerCase(), label: name }] : [];
    },
    { minOccurrences: MIN_FOOD_OCCURRENCES },
  );
}

/**
 * For pairs of tags that co-occur in meals, check whether the pair together
 * carries more outcome risk than either tag alone — an interaction, not just
 * two independently-risky ingredients sharing meals. Bounds the search space
 * to the MAX_PAIR_TAGS most frequent tags (frequency counted over all food
 * entries' parsed tags, since outcome membership doesn't require a rating).
 * A pair's key/label is `"${a} + ${b}"` (tags sorted). A pair survives only
 * when its hit rate beats BOTH constituent tags' raw hit rates (via
 * `tagHitRates`; a tag absent from that map — never seen alone — counts as
 * rate 0) by at least PAIR_RATE_MARGIN, then is capped at MAX_PAIR_FINDINGS.
 */
export function analyzePairOutcomes(entries: readonly LogEntry[]): OutcomeFinding[] {
  const foodEntries = entries.filter(isFood);

  const tagCounts = new Map<string, number>();
  for (const entry of foodEntries) {
    for (const tag of parseTagsJson(entry.tagsJson)) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const topTagSet = new Set(
    [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_PAIR_TAGS)
      .map(([tag]) => tag),
  );

  const findings = analyzeOutcomeRates(
    entries,
    (meal) => {
      const tags = parseTagsJson(meal.tagsJson).filter((t) => topTagSet.has(t));
      const keys: OutcomeKey[] = [];
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const [a, b] = [tags[i], tags[j]].sort();
          const key = `${a} + ${b}`;
          keys.push({ key, label: key });
        }
      }
      return keys;
    },
    { minOccurrences: MIN_PAIR_OCCURRENCES },
  );

  const rates = tagHitRates(entries);
  return findings
    .filter((f) => {
      const [a, b] = f.key.split(' + ');
      return (
        f.hitRate >= (rates.get(a) ?? 0) + PAIR_RATE_MARGIN &&
        f.hitRate >= (rates.get(b) ?? 0) + PAIR_RATE_MARGIN
      );
    })
    .slice(0, MAX_PAIR_FINDINGS);
}

export interface NutrientOutcomeFinding {
  nutrient: NutritionField;
  /** Median value that splits the "high" and "low" groups. */
  thresholdValue: number;
  /** Fraction of the high-value group's meals followed by >=1 rough outcome within DEFAULT_WINDOW_MS. */
  highRate: number;
  /** Same fraction for the low-value group. */
  lowRate: number;
  /** Number of entries in the high group (the supporting sample size). */
  sampleSize: number;
  confidence: ConfidenceTier;
}

/**
 * For each nutrient, split food entries carrying that field at the median
 * and report nutrients whose high-value meals are followed by a rough
 * outcome meaningfully more often than the low-value meals are (a straight
 * rate gap — no Welch/SE test, since a rate isn't a mean). Needs at least
 * MIN_NUTRIENT_SAMPLES total samples and MIN_GROUP_SIZE on each side of the
 * median split. Confidence: `high` when the high side's Wilson lower bound
 * clears the low side's raw rate outright; `medium` when the rate gap clears
 * NUTRIENT_RATE_MARGIN (the surfacing gate below already guarantees this)
 * and the high side has at least MEDIUM_CONFIDENCE_MIN_MEALS meals;
 * otherwise `low`, which is suppressed — only medium+high findings surface.
 */
export function analyzeNutrientOutcomes(entries: readonly LogEntry[]): NutrientOutcomeFinding[] {
  const food = entries.filter(isFood);
  const findings: NutrientOutcomeFinding[] = [];

  for (const nutrient of NUTRITION_FIELDS) {
    const samples = food.filter((e) => e[nutrient] != null);
    if (samples.length < MIN_NUTRIENT_SAMPLES) continue;

    const threshold = median(samples.map((e) => e[nutrient] as number));
    const high = samples.filter((e) => (e[nutrient] as number) >= threshold);
    const low = samples.filter((e) => (e[nutrient] as number) < threshold);
    if (high.length < MIN_GROUP_SIZE || low.length < MIN_GROUP_SIZE) continue;

    const outcomeMap = mealsFollowedByOutcome(entries, samples);
    const hitsHigh = high.filter((e) => outcomeMap.get(e.id)).length;
    const hitsLow = low.filter((e) => outcomeMap.get(e.id)).length;
    const highRate = Math.round((hitsHigh / high.length) * 100) / 100;
    const lowRate = Math.round((hitsLow / low.length) * 100) / 100;

    if (highRate - lowRate < NUTRIENT_RATE_MARGIN) continue;

    const confidence: ConfidenceTier =
      wilsonLowerBound(hitsHigh, high.length) > lowRate
        ? 'high'
        : high.length >= MEDIUM_CONFIDENCE_MIN_MEALS
          ? 'medium'
          : 'low';
    if (confidence === 'low') continue;

    findings.push({
      nutrient,
      thresholdValue: round1(threshold),
      highRate,
      lowRate,
      sampleSize: high.length,
      confidence,
    });
  }

  return findings.sort((a, b) => b.highRate - b.lowRate - (a.highRate - a.lowRate));
}

export interface InsightsSummary {
  totalEntries: number;
  foodEntries: number;
  bmEntries: number;
  symptomEntries: number;
  roughOutcomes: number;
}

/** Outcome-based summary counts — `roughOutcomes` is how many entries `isOutcome` flags. */
export function summarize(entries: readonly LogEntry[]): InsightsSummary {
  return {
    totalEntries: entries.length,
    foodEntries: entries.filter(isFood).length,
    bmEntries: entries.filter((e) => e.type === 'bowel_movement').length,
    symptomEntries: entries.filter((e) => e.type === 'symptom').length,
    roughOutcomes: entries.filter(isOutcome).length,
  };
}

export interface Insights {
  summary: InsightsSummary;
  nutrientFindings: NutrientOutcomeFinding[];
  foodFindings: OutcomeFinding[];
  ingredientFindings: OutcomeFinding[];
  pairFindings: OutcomeFinding[];
}

export function computeInsights(entries: readonly LogEntry[]): Insights {
  return {
    summary: summarize(entries),
    nutrientFindings: analyzeNutrientOutcomes(entries),
    foodFindings: analyzeFoodOutcomes(entries),
    ingredientFindings: analyzeIngredientOutcomes(entries),
    pairFindings: analyzePairOutcomes(entries),
  };
}
