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
  DEFAULT_WINDOW_MS,
  displayOutcomeFindings,
  isOutcome,
  MEDIUM_CONFIDENCE_MIN_MEALS,
  mealsFollowedByOutcome,
  outcomeRateCandidates,
  SLOW_WINDOW_MS,
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
export function analyzeIngredientOutcomes(
  entries: readonly LogEntry[],
  windowMs: number = DEFAULT_WINDOW_MS,
): OutcomeFinding[] {
  return analyzeOutcomeRates(entries, ingredientKeysOf, { windowMs });
}

/** Grouping keys for ingredient/allergen/additive tags: one key per parsed tag. */
const ingredientKeysOf = (meal: LogEntry): OutcomeKey[] =>
  parseTagsJson(meal.tagsJson).map((tag) => ({ key: tag, label: tag }));

/** Grouping keys for recurring foods: the trimmed name, case-insensitive, first-seen casing as label. */
const foodKeysOf = (meal: LogEntry): OutcomeKey[] => {
  const name = meal.name.trim();
  return name.length > 0 ? [{ key: name.toLowerCase(), label: name }] : [];
};

/**
 * Every compared ingredient's excess-risk result at every tier (low included),
 * with no display rules — see `outcomeRateCandidates`. Used by the chance check.
 */
export function ingredientCandidates(
  entries: readonly LogEntry[],
  windowMs: number = DEFAULT_WINDOW_MS,
): { checked: number; candidates: OutcomeFinding[] } {
  return outcomeRateCandidates(entries, ingredientKeysOf, { windowMs });
}

/**
 * Recurring foods (grouped by name, case-insensitive; the first-seen casing
 * is kept as the label) whose meals are followed by a rough outcome more
 * often than the overall baseline.
 */
export function analyzeFoodOutcomes(
  entries: readonly LogEntry[],
  windowMs: number = DEFAULT_WINDOW_MS,
): OutcomeFinding[] {
  return analyzeOutcomeRates(entries, foodKeysOf, { minOccurrences: MIN_FOOD_OCCURRENCES, windowMs });
}

/** Food counterpart of `ingredientCandidates`. */
export function foodCandidates(
  entries: readonly LogEntry[],
  windowMs: number = DEFAULT_WINDOW_MS,
): { checked: number; candidates: OutcomeFinding[] } {
  return outcomeRateCandidates(entries, foodKeysOf, { minOccurrences: MIN_FOOD_OCCURRENCES, windowMs });
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
 * `windowMs` (default 24 h) applies to the pair rates and the tag rates alike.
 */
export function analyzePairOutcomes(
  entries: readonly LogEntry[],
  windowMs: number = DEFAULT_WINDOW_MS,
): OutcomeFinding[] {
  return pairAnalysis(entries, windowMs).shown;
}

/**
 * Builds the `keysOf` for tag pairs: each meal yields `"a + b"` (tags sorted)
 * for every pair among its tags that are in the MAX_PAIR_TAGS most frequent
 * (frequency counted over all food entries' parsed tags).
 */
function pairKeysOf(entries: readonly LogEntry[]): (meal: LogEntry) => OutcomeKey[] {
  // Each food entry's tags are parsed once and reused (a per-call map, not a global cache).
  const parsed = new Map<LogEntry, string[]>();
  const tagCounts = new Map<string, number>();
  for (const entry of entries) {
    if (!isFood(entry)) continue;
    const tags = parseTagsJson(entry.tagsJson);
    parsed.set(entry, tags);
    for (const tag of tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const topTagSet = new Set(
    [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_PAIR_TAGS)
      .map(([tag]) => tag),
  );

  return (meal) => {
    const tags = (parsed.get(meal) ?? parseTagsJson(meal.tagsJson)).filter((t) => topTagSet.has(t));
    const keys: OutcomeKey[] = [];
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        // Same order as `[a, b].sort()` (UTF-16 code-unit comparison), without the allocation.
        const [a, b] = tags[i] <= tags[j] ? [tags[i], tags[j]] : [tags[j], tags[i]];
        const key = `${a} + ${b}`;
        keys.push({ key, label: key });
      }
    }
    return keys;
  };
}

/** The interaction test: a pair must beat BOTH constituent tags' raw rates by PAIR_RATE_MARGIN. */
function interactionFilter(
  entries: readonly LogEntry[],
  windowMs: number,
): (f: OutcomeFinding) => boolean {
  const rates = tagHitRates(entries, windowMs);
  return (f) => {
    const [a, b] = f.key.split(' + ');
    return (
      f.hitRate >= (rates.get(a) ?? 0) + PAIR_RATE_MARGIN &&
      f.hitRate >= (rates.get(b) ?? 0) + PAIR_RATE_MARGIN
    );
  };
}

/**
 * One pass over the pair space: `shown` is exactly `analyzePairOutcomes`'s
 * list (the fallback-applied findings, then the interaction filter, then the
 * cap); `candidates` is every compared pair that passes the interaction
 * filter at every tier (low included) — uncapped and without the low-only
 * fallback — and `checked` is how many pairs had at least MIN_PAIR_OCCURRENCES
 * meals. The chance check (chance.ts) uses `candidates`/`checked` for the
 * count and `shown` to know which pairs the 24 h section already lists.
 */
export function pairAnalysis(
  entries: readonly LogEntry[],
  windowMs: number = DEFAULT_WINDOW_MS,
): { checked: number; candidates: OutcomeFinding[]; shown: OutcomeFinding[] } {
  const raw = outcomeRateCandidates(entries, pairKeysOf(entries), {
    minOccurrences: MIN_PAIR_OCCURRENCES,
    windowMs,
  });
  const passes = interactionFilter(entries, windowMs);
  return {
    checked: raw.checked,
    candidates: raw.candidates.filter(passes),
    // The fallback is applied BEFORE the interaction filter, as it always was.
    shown: displayOutcomeFindings(raw.candidates).filter(passes).slice(0, MAX_PAIR_FINDINGS),
  };
}

/** Candidates-only view of `pairAnalysis` (see there). */
export function pairCandidates(
  entries: readonly LogEntry[],
  windowMs: number = DEFAULT_WINDOW_MS,
): { checked: number; candidates: OutcomeFinding[] } {
  const { checked, candidates } = pairAnalysis(entries, windowMs);
  return { checked, candidates };
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
  const { candidates } = nutrientCandidates(entries);
  return candidates
    .filter((f) => f.confidence !== 'low')
    .sort((a, b) => b.highRate - b.lowRate - (a.highRate - a.lowRate));
}

/**
 * Every nutrient whose high-value meals beat the low-value meals by at least
 * NUTRIENT_RATE_MARGIN, at every tier — including the `low` tier that
 * `analyzeNutrientOutcomes` suppresses — in NUTRITION_FIELDS order, unsorted.
 * `checked` is how many nutrients passed the sample and group-size gates. Used
 * by the chance check (chance.ts).
 */
export function nutrientCandidates(entries: readonly LogEntry[]): {
  checked: number;
  candidates: NutrientOutcomeFinding[];
} {
  const food = entries.filter(isFood);
  const candidates: NutrientOutcomeFinding[] = [];
  let checked = 0;

  for (const nutrient of NUTRITION_FIELDS) {
    const samples = food.filter((e) => e[nutrient] != null);
    if (samples.length < MIN_NUTRIENT_SAMPLES) continue;

    const threshold = median(samples.map((e) => e[nutrient] as number));
    const high = samples.filter((e) => (e[nutrient] as number) >= threshold);
    const low = samples.filter((e) => (e[nutrient] as number) < threshold);
    if (high.length < MIN_GROUP_SIZE || low.length < MIN_GROUP_SIZE) continue;
    checked++;

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

    candidates.push({
      nutrient,
      thresholdValue: round1(threshold),
      highRate,
      lowRate,
      sampleSize: high.length,
      confidence,
    });
  }

  return { checked, candidates };
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

export interface SlowerPatterns {
  ingredientFindings: OutcomeFinding[];
  foodFindings: OutcomeFinding[];
  pairFindings: OutcomeFinding[];
}

/**
 * "Slower patterns (within 48 h)" (#21): ingredient / food / combination
 * findings that reach MEDIUM or HIGH confidence when outcomes are counted up
 * to SLOW_WINDOW_MS after eating AND that do not appear in the 24 h results
 * (`twentyFourHour`, any tier — a slower pattern never duplicates a 24 h one).
 *
 * Guard rails, deliberately narrow: with daily meals and scattered rough days
 * a long window pushes the baseline toward 100 %, and trying several windows
 * per food finds spurious "triggers" by chance. So exactly ONE extra window is
 * tried, low-confidence results are never shown, and the per-finding timing
 * profile (outcomeRateForKey) is context only — it never creates findings.
 * Nutrient findings are not part of this (they stay at 24 h).
 */
export function analyzeSlowerPatterns(
  entries: readonly LogEntry[],
  twentyFourHour: Insights,
): SlowerPatterns {
  const novel = (found: OutcomeFinding[], shown: readonly OutcomeFinding[]): OutcomeFinding[] => {
    const shownKeys = new Set(shown.map((f) => f.key));
    return found.filter((f) => f.confidence !== 'low' && !shownKeys.has(f.key));
  };
  return {
    ingredientFindings: novel(
      analyzeIngredientOutcomes(entries, SLOW_WINDOW_MS),
      twentyFourHour.ingredientFindings,
    ),
    foodFindings: novel(analyzeFoodOutcomes(entries, SLOW_WINDOW_MS), twentyFourHour.foodFindings),
    pairFindings: novel(analyzePairOutcomes(entries, SLOW_WINDOW_MS), twentyFourHour.pairFindings),
  };
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
