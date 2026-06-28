// Pure correlation/insight functions (BUILD_PLAN.md Phase 3). Simple, explainable
// signals first — counts, averages, thresholds — over the user's own logs. These
// are observations, never medical advice; the UI states that plainly.
//
// React-free and fixture-testable: this is where Phase 3's verification leverage is.

import type { LogEntry } from '@/db/schema';
import { FOOD_TYPES } from '@/db/schema';
import { isSentimentValue } from '@/features/sentiment/scale';
import { parseTagsJson } from '@/lib/ingredients';
import { NUTRITION_FIELDS, type NutritionField } from '@/lib/validation';

export const MIN_NUTRIENT_SAMPLES = 4;
export const MIN_GROUP_SIZE = 2;
export const SENTIMENT_MARGIN = 0.5;
export const MIN_FOOD_OCCURRENCES = 3;
export const MIN_TAG_OCCURRENCES = 3;
export const LOW_SENTIMENT_MAX = 2.5;

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

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

export interface NutrientFinding {
  nutrient: NutritionField;
  /** Median value that splits the "high" and "low" groups. */
  thresholdValue: number;
  highAvgSentiment: number;
  lowAvgSentiment: number;
  /** Number of entries in the high group (the supporting sample size). */
  sampleSize: number;
}

/**
 * For each nutrient, split rated food entries at the median value and report
 * nutrients whose high group averages a meaningfully lower sentiment than the low
 * group. Needs enough samples in both groups to say anything.
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

    const highAvg = mean(high.map((s) => s.sentiment));
    const lowAvg = mean(low.map((s) => s.sentiment));
    if (highAvg <= lowAvg - SENTIMENT_MARGIN) {
      findings.push({
        nutrient,
        thresholdValue: round1(threshold),
        highAvgSentiment: round1(highAvg),
        lowAvgSentiment: round1(lowAvg),
        sampleSize: high.length,
      });
    }
  }

  return findings.sort((a, b) => a.highAvgSentiment - b.highAvgSentiment);
}

export interface FoodFinding {
  name: string;
  avgSentiment: number;
  occurrences: number;
}

/**
 * Recurring foods (by name, case-insensitive) that you tend to rate poorly —
 * average sentiment at or below LOW_SENTIMENT_MAX over at least a few logs.
 */
export function analyzeFoodSentiment(entries: readonly LogEntry[]): FoodFinding[] {
  const byName = new Map<string, { name: string; sentiments: number[] }>();

  for (const entry of entries) {
    const sentiment = ratedSentiment(entry);
    if (!isFood(entry) || sentiment == null) continue;
    const key = entry.name.trim().toLowerCase();
    if (key.length === 0) continue;
    const group = byName.get(key) ?? { name: entry.name.trim(), sentiments: [] };
    group.sentiments.push(sentiment);
    byName.set(key, group);
  }

  const findings: FoodFinding[] = [];
  for (const group of byName.values()) {
    if (group.sentiments.length < MIN_FOOD_OCCURRENCES) continue;
    const avg = mean(group.sentiments);
    if (avg <= LOW_SENTIMENT_MAX) {
      findings.push({ name: group.name, avgSentiment: round1(avg), occurrences: group.sentiments.length });
    }
  }

  return findings.sort((a, b) => a.avgSentiment - b.avgSentiment || b.occurrences - a.occurrences);
}

export interface TagFinding {
  tag: string;
  avgSentiment: number;
  occurrences: number;
}

/**
 * Ingredient/allergen/additive tags that appear in food entries which you tend to
 * rate poorly. Groups rated food entries by normalized tag (from tagsJson), gates
 * on MIN_TAG_OCCURRENCES, and surfaces tags where the average sentiment is at or
 * below LOW_SENTIMENT_MAX. Same shape and philosophy as analyzeFoodSentiment.
 */
export function analyzeIngredientSentiment(entries: readonly LogEntry[]): TagFinding[] {
  const byTag = new Map<string, { sentiments: number[] }>();

  for (const entry of entries) {
    const sentiment = ratedSentiment(entry);
    if (!isFood(entry) || sentiment == null) continue;
    for (const tag of parseTagsJson(entry.tagsJson)) {
      const group = byTag.get(tag) ?? { sentiments: [] };
      group.sentiments.push(sentiment);
      byTag.set(tag, group);
    }
  }

  const findings: TagFinding[] = [];
  for (const [tag, group] of byTag.entries()) {
    if (group.sentiments.length < MIN_TAG_OCCURRENCES) continue;
    const avg = mean(group.sentiments);
    if (avg <= LOW_SENTIMENT_MAX) {
      findings.push({ tag, avgSentiment: round1(avg), occurrences: group.sentiments.length });
    }
  }

  return findings.sort((a, b) => a.avgSentiment - b.avgSentiment || b.occurrences - a.occurrences);
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
}

export function computeInsights(entries: readonly LogEntry[]): Insights {
  return {
    summary: summarize(entries),
    nutrientFindings: analyzeNutrientSentiment(entries),
    foodFindings: analyzeFoodSentiment(entries),
    ingredientFindings: analyzeIngredientSentiment(entries),
  };
}
