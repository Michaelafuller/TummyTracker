// Pure correlation/insight functions (BUILD_PLAN.md Phase 3, reworked for
// Insights v2 per HANDOFF.md Phase 3.2). Baseline-relative, confidence-labeled
// findings over the user's own logs — these are observations, never medical
// advice; the UI states that plainly.
//
// React-free and fixture-testable: this is where Phase 3's verification leverage is.

import type { LogEntry } from '@/db/schema';
import { FOOD_TYPES } from '@/db/schema';
import { isSentimentValue, SENTIMENT_VALUES, type SentimentValue } from '@/features/sentiment/scale';
import { parseTagsJson } from '@/lib/ingredients';
import { confidenceTier, mean, sd, seMeanDiff, type ConfidenceTier } from '@/lib/stats';
import { NUTRITION_FIELDS, type NutritionField } from '@/lib/validation';
import { analyzeTemporalTriggers, type TemporalFinding } from './temporal';

export type { TemporalFinding };
export type { ConfidenceTier };

/** Nutrient split needs at least this many rated samples with the field set (≥4 per side). */
export const MIN_NUTRIENT_SAMPLES = 8;
export const MIN_GROUP_SIZE = 4;
export const MIN_FOOD_OCCURRENCES = 3;
export const MIN_TAG_OCCURRENCES = 3;
/** A tag/food's mean sentiment must sit at least this far below the baseline to surface. */
export const DELTA_MARGIN = -0.7;
/** Tag-pair analysis considers only the N most frequent tags (bounds the pair space). */
export const MAX_PAIR_TAGS = 15;
/** A pair needs at least this many co-occurring rated meals. */
export const MIN_PAIR_OCCURRENCES = 3;
/** A pair's delta must be at least this much worse than BOTH single-tag deltas to count as an interaction. */
export const PAIR_INTERACTION_MARGIN = 0.4;
export const MAX_PAIR_FINDINGS = 5;

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

function ratedSentiment(entry: LogEntry): number | null {
  return isSentimentValue(entry.sentiment) ? entry.sentiment : null;
}

/** 5-bucket histogram [count of 1s, 2s, 3s, 4s, 5s] for a set of sentiment values. */
export function sentimentHistogram(sentiments: readonly SentimentValue[]): [number, number, number, number, number] {
  const counts: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const s of sentiments) {
    counts[SENTIMENT_VALUES.indexOf(s)] += 1;
  }
  return counts;
}

/** Effect (mean(group) - mean(baseline)) plus the Welch SE and confidence tier for that effect. */
function baselineComparison(group: number[], baseline: number[]): {
  groupAvg: number;
  baselineAvg: number;
  delta: number;
  confidence: ConfidenceTier;
} {
  const groupAvg = mean(group);
  const baselineAvg = mean(baseline);
  const delta = groupAvg - baselineAvg;
  const se = seMeanDiff(sd(group), group.length, sd(baseline), baseline.length);
  return { groupAvg, baselineAvg, delta, confidence: confidenceTier({ n: group.length, effect: delta, se }) };
}

export interface NutrientFinding {
  nutrient: NutritionField;
  /** Median value that splits the "high" and "low" groups. */
  thresholdValue: number;
  highAvgSentiment: number;
  lowAvgSentiment: number;
  /** Number of entries in the high group (the supporting sample size). */
  sampleSize: number;
  confidence: ConfidenceTier;
}

/**
 * For each nutrient, split rated food entries at the median value and report
 * nutrients whose high group averages a meaningfully lower sentiment than the low
 * group. Needs enough samples on both sides of the split, and — because seven
 * nutrients are tested simultaneously here (multiple-comparisons risk) — only
 * medium-or-higher confidence findings are surfaced at all.
 */
export function analyzeNutrientSentiment(entries: readonly LogEntry[]): NutrientFinding[] {
  const food = entries.filter((e) => isFood(e) && ratedSentiment(e) != null);
  const findings: NutrientFinding[] = [];

  for (const nutrient of NUTRITION_FIELDS) {
    const samples = food
      .filter((e) => e[nutrient] != null)
      .map((e) => ({ value: e[nutrient] as number, sentiment: ratedSentiment(e) as number }));

    if (samples.length < MIN_NUTRIENT_SAMPLES) continue;

    const threshold = median(samples.map((s) => s.value));
    const high = samples.filter((s) => s.value >= threshold);
    const low = samples.filter((s) => s.value < threshold);
    if (high.length < MIN_GROUP_SIZE || low.length < MIN_GROUP_SIZE) continue;

    const { groupAvg: highAvg, baselineAvg: lowAvg, delta, confidence } = baselineComparison(
      high.map((s) => s.sentiment),
      low.map((s) => s.sentiment),
    );
    if (delta > DELTA_MARGIN) continue;
    if (confidence === 'low') continue; // suppress sub-medium findings (7 simultaneous tests)

    findings.push({
      nutrient,
      thresholdValue: round1(threshold),
      highAvgSentiment: round1(highAvg),
      lowAvgSentiment: round1(lowAvg),
      sampleSize: high.length,
      confidence,
    });
  }

  return findings.sort((a, b) => a.highAvgSentiment - b.highAvgSentiment);
}

export interface FoodFinding {
  name: string;
  avgSentiment: number;
  baselineAvg: number;
  delta: number;
  occurrences: number;
  confidence: ConfidenceTier;
  sentimentCounts: [number, number, number, number, number];
}

/**
 * Recurring foods (by name, case-insensitive) whose average sentiment sits
 * meaningfully below the user's own baseline (the mean of all OTHER rated food
 * entries) — baseline-relative rather than an absolute cutoff, so it adapts to
 * both an all-low rater and a high-baseline rater.
 */
export function analyzeFoodSentiment(entries: readonly LogEntry[]): FoodFinding[] {
  const byName = new Map<string, { name: string; sentiments: SentimentValue[] }>();

  for (const entry of entries) {
    const sentiment = ratedSentiment(entry);
    if (!isFood(entry) || sentiment == null) continue;
    const key = entry.name.trim().toLowerCase();
    if (key.length === 0) continue;
    const group = byName.get(key) ?? { name: entry.name.trim(), sentiments: [] };
    group.sentiments.push(sentiment as SentimentValue);
    byName.set(key, group);
  }

  const allRatedFood: SentimentValue[] = [];
  for (const group of byName.values()) allRatedFood.push(...group.sentiments);

  const findings: FoodFinding[] = [];
  for (const group of byName.values()) {
    if (group.sentiments.length < MIN_FOOD_OCCURRENCES) continue;
    const other = otherSentiments(allRatedFood, group.sentiments);
    if (other.length === 0) continue;

    const { groupAvg, baselineAvg, delta, confidence } = baselineComparison(group.sentiments, other);
    if (delta > DELTA_MARGIN) continue;

    findings.push({
      name: group.name,
      avgSentiment: round1(groupAvg),
      baselineAvg: round1(baselineAvg),
      delta: round1(delta),
      occurrences: group.sentiments.length,
      confidence,
      sentimentCounts: sentimentHistogram(group.sentiments),
    });
  }

  return findings.sort((a, b) => a.delta - b.delta || b.occurrences - a.occurrences);
}

/**
 * Removes exactly `group`'s own values from `all` (by count, not identity) to
 * produce the "all OTHER rated entries" baseline for a group drawn from the
 * same pool. Values equal to ones in `group` but beyond its count are kept.
 */
function otherSentiments(all: readonly SentimentValue[], group: readonly SentimentValue[]): number[] {
  const remaining = new Map<number, number>();
  for (const v of group) remaining.set(v, (remaining.get(v) ?? 0) + 1);
  const other: number[] = [];
  for (const v of all) {
    const left = remaining.get(v) ?? 0;
    if (left > 0) {
      remaining.set(v, left - 1);
    } else {
      other.push(v);
    }
  }
  return other;
}

export interface TagFinding {
  tag: string;
  avgSentiment: number;
  baselineAvg: number;
  delta: number;
  occurrences: number;
  confidence: ConfidenceTier;
  sentimentCounts: [number, number, number, number, number];
}

/**
 * Ingredient/allergen/additive tags whose average sentiment sits meaningfully
 * below the user's own baseline (the mean of all OTHER rated food entries).
 * Baseline-relative rather than an absolute cutoff — see analyzeFoodSentiment.
 */
export function analyzeIngredientSentiment(entries: readonly LogEntry[]): TagFinding[] {
  const byTag = new Map<string, SentimentValue[]>();
  const allRatedFood: SentimentValue[] = [];

  for (const entry of entries) {
    const sentiment = ratedSentiment(entry);
    if (!isFood(entry) || sentiment == null) continue;
    allRatedFood.push(sentiment as SentimentValue);
    for (const tag of parseTagsJson(entry.tagsJson)) {
      const group = byTag.get(tag) ?? [];
      group.push(sentiment as SentimentValue);
      byTag.set(tag, group);
    }
  }

  const findings: TagFinding[] = [];
  for (const [tag, sentiments] of byTag.entries()) {
    if (sentiments.length < MIN_TAG_OCCURRENCES) continue;
    const other = otherSentiments(allRatedFood, sentiments);
    if (other.length === 0) continue;

    const { groupAvg, baselineAvg, delta, confidence } = baselineComparison(sentiments, other);
    if (delta > DELTA_MARGIN) continue;

    findings.push({
      tag,
      avgSentiment: round1(groupAvg),
      baselineAvg: round1(baselineAvg),
      delta: round1(delta),
      occurrences: sentiments.length,
      confidence,
      sentimentCounts: sentimentHistogram(sentiments),
    });
  }

  return findings.sort((a, b) => a.delta - b.delta || b.occurrences - a.occurrences);
}

export interface PairFinding {
  tags: [string, string];
  avgSentiment: number;
  baselineAvg: number;
  delta: number;
  occurrences: number;
  confidence: ConfidenceTier;
  sentimentCounts: [number, number, number, number, number];
}

/**
 * Ingredient-combination analysis: for pairs of tags that co-occur in rated
 * meals, check whether the pair together is worse than either tag alone — an
 * interaction, not just two independently-bad ingredients sharing meals.
 * Bounds the search space to the MAX_PAIR_TAGS most frequent tags.
 */
export function analyzeTagPairs(entries: readonly LogEntry[]): PairFinding[] {
  const foodEntries = entries.filter((e) => isFood(e) && ratedSentiment(e) != null);
  const allRatedFood: SentimentValue[] = foodEntries.map((e) => ratedSentiment(e) as SentimentValue);

  const tagSentiments = new Map<string, SentimentValue[]>();
  const entryTags = new Map<string, string[]>();
  for (const entry of foodEntries) {
    const sentiment = ratedSentiment(entry) as SentimentValue;
    const tags = parseTagsJson(entry.tagsJson);
    entryTags.set(entry.id, tags);
    for (const tag of tags) {
      const group = tagSentiments.get(tag) ?? [];
      group.push(sentiment);
      tagSentiments.set(tag, group);
    }
  }

  const topTags = [...tagSentiments.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, MAX_PAIR_TAGS)
    .map(([tag]) => tag);
  const topTagSet = new Set(topTags);

  function singleTagDelta(tag: string): number {
    const group = tagSentiments.get(tag) ?? [];
    const other = otherSentiments(allRatedFood, group);
    if (other.length === 0) return 0;
    return mean(group) - mean(other);
  }

  const pairSentiments = new Map<string, { tags: [string, string]; sentiments: SentimentValue[] }>();
  for (const entry of foodEntries) {
    const sentiment = ratedSentiment(entry) as SentimentValue;
    const tags = (entryTags.get(entry.id) ?? []).filter((t) => topTagSet.has(t));
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const [a, b] = [tags[i], tags[j]].sort();
        const key = `${a} ${b}`;
        const group = pairSentiments.get(key) ?? { tags: [a, b] as [string, string], sentiments: [] };
        group.sentiments.push(sentiment);
        pairSentiments.set(key, group);
      }
    }
  }

  const findings: PairFinding[] = [];
  for (const { tags, sentiments } of pairSentiments.values()) {
    if (sentiments.length < MIN_PAIR_OCCURRENCES) continue;
    const other = otherSentiments(allRatedFood, sentiments);
    if (other.length === 0) continue;

    const { groupAvg, baselineAvg, delta, confidence } = baselineComparison(sentiments, other);
    if (delta > DELTA_MARGIN) continue;

    const [deltaA, deltaB] = [singleTagDelta(tags[0]), singleTagDelta(tags[1])];
    const isInteraction = delta <= deltaA - PAIR_INTERACTION_MARGIN && delta <= deltaB - PAIR_INTERACTION_MARGIN;
    if (!isInteraction) continue;

    findings.push({
      tags,
      avgSentiment: round1(groupAvg),
      baselineAvg: round1(baselineAvg),
      delta: round1(delta),
      occurrences: sentiments.length,
      confidence,
      sentimentCounts: sentimentHistogram(sentiments),
    });
  }

  return findings.sort((a, b) => a.delta - b.delta || b.occurrences - a.occurrences).slice(0, MAX_PAIR_FINDINGS);
}

export interface InsightsSummary {
  totalEntries: number;
  foodEntries: number;
  bmEntries: number;
  symptomEntries: number;
  ratedEntries: number;
  averageSentiment: number | null;
}

export function summarize(entries: readonly LogEntry[]): InsightsSummary {
  const ratedValues = entries
    .map((e) => ratedSentiment(e))
    .filter((s): s is number => s != null);

  return {
    totalEntries: entries.length,
    foodEntries: entries.filter(isFood).length,
    bmEntries: entries.filter((e) => e.type === 'bowel_movement').length,
    symptomEntries: entries.filter((e) => e.type === 'symptom').length,
    ratedEntries: ratedValues.length,
    averageSentiment: ratedValues.length > 0 ? round1(mean(ratedValues)) : null,
  };
}

export interface Insights {
  summary: InsightsSummary;
  nutrientFindings: NutrientFinding[];
  foodFindings: FoodFinding[];
  ingredientFindings: TagFinding[];
  pairFindings: PairFinding[];
  temporalFindings: TemporalFinding[];
}

export function computeInsights(entries: readonly LogEntry[]): Insights {
  return {
    summary: summarize(entries),
    nutrientFindings: analyzeNutrientSentiment(entries),
    foodFindings: analyzeFoodSentiment(entries),
    ingredientFindings: analyzeIngredientSentiment(entries),
    pairFindings: analyzeTagPairs(entries),
    temporalFindings: analyzeTemporalTriggers(entries),
  };
}
