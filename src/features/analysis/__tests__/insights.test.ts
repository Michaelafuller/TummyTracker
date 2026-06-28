import type { LogEntry } from '@/db/schema';
import {
  analyzeFoodSentiment,
  analyzeNutrientSentiment,
  computeInsights,
  summarize,
} from '../insights';

let seq = 0;
function makeEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: `e${seq++}`,
    type: 'meal',
    mealSlot: null,
    name: 'Food',
    barcode: null,
    loggedAt: 0,
    sentiment: null,
    bristolScale: null,
    notes: null,
    calories: null,
    fatG: null,
    saturatedFatG: null,
    carbsG: null,
    proteinG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('analyzeNutrientSentiment', () => {
  it('flags a nutrient whose high group averages lower sentiment', () => {
    // fat values 5,10,40,50 → median 25; high {40,50}=>{2,1} avg 1.5; low {5,10}=>{5,4} avg 4.5
    const entries = [
      makeEntry({ name: 'a', fatG: 5, sentiment: 5 }),
      makeEntry({ name: 'b', fatG: 10, sentiment: 4 }),
      makeEntry({ name: 'c', fatG: 40, sentiment: 2 }),
      makeEntry({ name: 'd', fatG: 50, sentiment: 1 }),
    ];
    const findings = analyzeNutrientSentiment(entries);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      nutrient: 'fatG',
      thresholdValue: 25,
      highAvgSentiment: 1.5,
      lowAvgSentiment: 4.5,
      sampleSize: 2,
    });
  });

  it('says nothing without enough samples', () => {
    const entries = [
      makeEntry({ fatG: 5, sentiment: 5 }),
      makeEntry({ fatG: 50, sentiment: 1 }),
    ];
    expect(analyzeNutrientSentiment(entries)).toHaveLength(0);
  });

  it('ignores entries missing the nutrient or a rating, and BMs', () => {
    const entries = [
      makeEntry({ fatG: 5, sentiment: 5 }),
      makeEntry({ fatG: 10, sentiment: null }), // unrated
      makeEntry({ fatG: null, sentiment: 1 }), // no nutrient
      makeEntry({ type: 'bowel_movement', fatG: 40, sentiment: 1 }), // not food
      makeEntry({ fatG: 40, sentiment: 2 }),
    ];
    // Only 2 valid fat samples remain → below threshold, no finding.
    expect(analyzeNutrientSentiment(entries)).toHaveLength(0);
  });
});

describe('analyzeFoodSentiment', () => {
  it('flags recurring foods rated poorly, case-insensitively', () => {
    const entries = [
      makeEntry({ name: 'Chicken Salad', sentiment: 2 }),
      makeEntry({ name: 'chicken salad', sentiment: 2 }),
      makeEntry({ name: 'CHICKEN SALAD', sentiment: 3 }),
      makeEntry({ name: 'Toast', sentiment: 5 }),
      makeEntry({ name: 'Toast', sentiment: 4 }),
      makeEntry({ name: 'Toast', sentiment: 5 }),
    ];
    const findings = analyzeFoodSentiment(entries);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({ name: 'Chicken Salad', avgSentiment: 2.3, occurrences: 3 });
  });

  it('requires a minimum number of occurrences', () => {
    const entries = [
      makeEntry({ name: 'Curry', sentiment: 1 }),
      makeEntry({ name: 'Curry', sentiment: 2 }),
    ];
    expect(analyzeFoodSentiment(entries)).toHaveLength(0);
  });
});

describe('summarize', () => {
  it('counts entries by kind and averages ratings', () => {
    const entries = [
      makeEntry({ sentiment: 4 }),
      makeEntry({ type: 'snack', sentiment: 2 }),
      makeEntry({ type: 'bowel_movement', sentiment: null }),
      makeEntry({ sentiment: null }),
    ];
    expect(summarize(entries)).toEqual({
      totalEntries: 4,
      foodEntries: 3,
      bmEntries: 1,
      ratedEntries: 2,
      averageSentiment: 3,
    });
  });

  it('reports null average sentiment when nothing is rated', () => {
    expect(summarize([makeEntry({})]).averageSentiment).toBeNull();
  });
});

describe('computeInsights', () => {
  it('bundles summary and both analyses', () => {
    const insights = computeInsights([makeEntry({ sentiment: 3 })]);
    expect(insights.summary.totalEntries).toBe(1);
    expect(insights.nutrientFindings).toEqual([]);
    expect(insights.foodFindings).toEqual([]);
  });
});
