import type { LogEntry } from '@/db/schema';
import {
  analyzeIngredientSentiment,
  analyzeFoodSentiment,
  analyzeNutrientSentiment,
  analyzeTagPairs,
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
    symptomType: null,
    severity: null,
    notes: null,
    calories: null,
    fatG: null,
    saturatedFatG: null,
    carbsG: null,
    proteinG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    servingG: null,
    ingredientsText: null,
    tagsJson: null,
    componentCount: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('analyzeNutrientSentiment', () => {
  it('flags a nutrient whose high group averages meaningfully lower sentiment (medium+ confidence only)', () => {
    // 12 samples, median-split 6/6. Low-fat group sentiments [5,5,4,4,5,4] avg 4.5;
    // high-fat group sentiments [2,1,2,1,2,1] avg 1.5. delta=-3, se≈0.3162 -> n=6,
    // |effect|>=1.5se (medium) but n<10 so not high. Hand-verified via scratch script.
    const lowFat = [5, 8, 10, 12, 14, 16];
    const lowSentiments = [5, 5, 4, 4, 5, 4];
    const highFat = [40, 42, 45, 48, 50, 55];
    const highSentiments = [2, 1, 2, 1, 2, 1];
    const entries = [
      ...lowFat.map((fatG, i) => makeEntry({ name: `low${i}`, fatG, sentiment: lowSentiments[i] })),
      ...highFat.map((fatG, i) => makeEntry({ name: `high${i}`, fatG, sentiment: highSentiments[i] })),
    ];
    const findings = analyzeNutrientSentiment(entries);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      nutrient: 'fatG',
      thresholdValue: 28,
      highAvgSentiment: 1.5,
      lowAvgSentiment: 4.5,
      sampleSize: 6,
      confidence: 'medium',
    });
  });

  it('says nothing without enough samples', () => {
    const entries = [
      makeEntry({ fatG: 5, sentiment: 5 }),
      makeEntry({ fatG: 50, sentiment: 1 }),
    ];
    expect(analyzeNutrientSentiment(entries)).toHaveLength(0);
  });

  it('suppresses a finding at exactly MIN_NUTRIENT_SAMPLES with only a 4/4 split (low confidence)', () => {
    // 8 samples, 4/4 split. n=4 per side is below the medium-confidence minimum (5),
    // so even a strong effect stays "low" and must be suppressed entirely.
    const entries = [
      makeEntry({ fatG: 5, sentiment: 5 }),
      makeEntry({ fatG: 8, sentiment: 5 }),
      makeEntry({ fatG: 10, sentiment: 4 }),
      makeEntry({ fatG: 12, sentiment: 4 }),
      makeEntry({ fatG: 40, sentiment: 2 }),
      makeEntry({ fatG: 45, sentiment: 2 }),
      makeEntry({ fatG: 50, sentiment: 1 }),
      makeEntry({ fatG: 55, sentiment: 1 }),
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
    // Only 2 valid fat samples remain — below MIN_NUTRIENT_SAMPLES, no finding.
    expect(analyzeNutrientSentiment(entries)).toHaveLength(0);
  });
});

describe('analyzeFoodSentiment', () => {
  it('flags a recurring food whose sentiment sits meaningfully below the baseline of other foods', () => {
    // Chicken Salad: sentiments [2,2,3] avg 2.333; baseline = all OTHER rated food
    // (Toast x3, sentiments [5,4,5]) avg 4.667. delta = -2.333 (<= DELTA_MARGIN -0.7).
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
    expect(findings[0]).toEqual({
      name: 'Chicken Salad',
      avgSentiment: 2.3,
      baselineAvg: 4.7,
      delta: -2.3,
      occurrences: 3,
      confidence: 'low', // n=3 is below the medium-confidence minimum (5)
      sentimentCounts: [0, 2, 1, 0, 0],
    });
  });

  it('requires a minimum number of occurrences', () => {
    const entries = [
      makeEntry({ name: 'Curry', sentiment: 1 }),
      makeEntry({ name: 'Curry', sentiment: 2 }),
    ];
    expect(analyzeFoodSentiment(entries)).toHaveLength(0);
  });

  it('does not flag a food whose delta does not clear DELTA_MARGIN', () => {
    // Toast avg 4, baseline (Waffle) avg 4.5 — delta -0.5, above the -0.7 margin.
    const entries = [
      makeEntry({ name: 'Toast', sentiment: 4 }),
      makeEntry({ name: 'Toast', sentiment: 4 }),
      makeEntry({ name: 'Toast', sentiment: 4 }),
      makeEntry({ name: 'Waffle', sentiment: 4 }),
      makeEntry({ name: 'Waffle', sentiment: 5 }),
    ];
    expect(analyzeFoodSentiment(entries)).toHaveLength(0);
  });

  it('does not flag a food when there are no other rated food entries to form a baseline', () => {
    const entries = [
      makeEntry({ name: 'Curry', sentiment: 1 }),
      makeEntry({ name: 'Curry', sentiment: 1 }),
      makeEntry({ name: 'Curry', sentiment: 1 }),
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
      symptomEntries: 0,
      ratedEntries: 2,
      averageSentiment: 3,
    });
  });

  it('reports null average sentiment when nothing is rated', () => {
    expect(summarize([makeEntry({})]).averageSentiment).toBeNull();
  });
});

describe('computeInsights', () => {
  it('bundles summary, nutrient, food, ingredient, pair, and temporal analyses', () => {
    const insights = computeInsights([makeEntry({ sentiment: 3 })]);
    expect(insights.summary.totalEntries).toBe(1);
    expect(insights.nutrientFindings).toEqual([]);
    expect(insights.foodFindings).toEqual([]);
    expect(insights.ingredientFindings).toEqual([]);
    expect(insights.pairFindings).toEqual([]);
    expect(insights.temporalFindings).toEqual([]);
  });
});

describe('analyzeIngredientSentiment', () => {
  // Arithmetic (hand-verified via scratch script): gluten in 3 entries — sentiments
  // [1,2,2] avg 1.667; baseline = 5 OTHER rated food entries [4,5,4,5,3] avg 4.2.
  // delta = -2.533, well past DELTA_MARGIN (-0.7).
  it('surfaces a tag when it appears >= MIN_TAG_OCCURRENCES times and its delta clears DELTA_MARGIN', () => {
    const entries = [
      makeEntry({ sentiment: 1, tagsJson: '["gluten"]' }),
      makeEntry({ sentiment: 2, tagsJson: '["gluten"]' }),
      makeEntry({ sentiment: 2, tagsJson: '["gluten"]' }),
      makeEntry({ sentiment: 4 }),
      makeEntry({ sentiment: 5 }),
      makeEntry({ sentiment: 4 }),
      makeEntry({ sentiment: 5 }),
      makeEntry({ sentiment: 3 }),
    ];
    const findings = analyzeIngredientSentiment(entries);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      tag: 'gluten',
      avgSentiment: 1.7,
      baselineAvg: 4.2,
      delta: -2.5,
      occurrences: 3,
      confidence: 'low', // n=3 below the medium-confidence minimum
      sentimentCounts: [1, 2, 0, 0, 0],
    });
  });

  it('returns nothing when a tag appears fewer than MIN_TAG_OCCURRENCES times', () => {
    const entries = [
      makeEntry({ sentiment: 1, tagsJson: '["gluten"]' }),
      makeEntry({ sentiment: 2, tagsJson: '["gluten"]' }),
    ];
    expect(analyzeIngredientSentiment(entries)).toHaveLength(0);
  });

  it('returns nothing when delta does not clear DELTA_MARGIN', () => {
    // gluten avg 4.33, baseline (Toast) avg 4.5 — delta -0.17, above -0.7.
    const entries = [
      makeEntry({ sentiment: 4, tagsJson: '["gluten"]' }),
      makeEntry({ sentiment: 5, tagsJson: '["gluten"]' }),
      makeEntry({ sentiment: 4, tagsJson: '["gluten"]' }),
      makeEntry({ sentiment: 4 }),
      makeEntry({ sentiment: 5 }),
    ];
    expect(analyzeIngredientSentiment(entries)).toHaveLength(0);
  });

  it('ignores unrated entries and bowel movement entries', () => {
    const entries = [
      makeEntry({ sentiment: null, tagsJson: '["gluten"]' }),
      makeEntry({ type: 'bowel_movement', sentiment: 1, tagsJson: '["gluten"]' }),
      makeEntry({ sentiment: 1, tagsJson: '["gluten"]' }),
    ];
    // Only one rated food entry with "gluten" — below the minimum
    expect(analyzeIngredientSentiment(entries)).toHaveLength(0);
  });

  it('sorts results by delta ascending (most negative first) then occurrences descending', () => {
    // dairy: [1,1,1,2] avg 1.25; gluten: [1,2,2] avg 1.667; shared baseline pool
    // includes each other's entries plus a few high-sentiment control entries so
    // both deltas clear DELTA_MARGIN and dairy's (more negative) delta sorts first.
    const gluten = [1, 2, 2].map((s) => makeEntry({ sentiment: s, tagsJson: '["gluten"]' }));
    const dairy = [1, 1, 1, 2].map((s) => makeEntry({ sentiment: s, tagsJson: '["dairy"]' }));
    const control = [5, 5, 5, 4, 4].map((s) => makeEntry({ sentiment: s }));
    const findings = analyzeIngredientSentiment([...gluten, ...dairy, ...control]);
    expect(findings.map((f) => f.tag)).toEqual(['dairy', 'gluten']);
  });
});

describe('analyzeTagPairs', () => {
  it('surfaces a pair whose combined delta is a genuine interaction beyond either single tag', () => {
    // milk+onion pair meals: sentiments [1,1,1] (avg 1); milk-alone and onion-alone
    // meals (no overlap): sentiments [3,3,3] each; neutral control meals: [4,4,4].
    // Hand-verified via scratch script: pairDelta=-2.333, milkDelta=onionDelta=-1.5;
    // pairDelta clears both single deltas by >= 0.4 (interaction), n=3 -> low confidence.
    const pairMeals = [1, 1, 1].map((s) =>
      makeEntry({ name: 'Milk onion soup', sentiment: s, tagsJson: '["milk","onion"]' }),
    );
    const milkAlone = [3, 3, 3].map((s) => makeEntry({ name: 'Milk toast', sentiment: s, tagsJson: '["milk"]' }));
    const onionAlone = [3, 3, 3].map((s) =>
      makeEntry({ name: 'Onion rings', sentiment: s, tagsJson: '["onion"]' }),
    );
    const neutral = [4, 4, 4].map((s) => makeEntry({ name: 'Rice', sentiment: s }));

    const findings = analyzeTagPairs([...pairMeals, ...milkAlone, ...onionAlone, ...neutral]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      tags: ['milk', 'onion'],
      avgSentiment: 1,
      baselineAvg: 3.3,
      delta: -2.3,
      occurrences: 3,
      confidence: 'low',
      sentimentCounts: [3, 0, 0, 0, 0],
    });
  });

  it('does not surface a pair when the combined delta is no worse than either single-tag delta', () => {
    // Both tags are independently just as bad as together — no interaction.
    const pairMeals = [1, 1, 1].map((s) =>
      makeEntry({ name: 'Milk onion soup', sentiment: s, tagsJson: '["milk","onion"]' }),
    );
    const milkAlone = [1, 1, 1].map((s) => makeEntry({ name: 'Milk toast', sentiment: s, tagsJson: '["milk"]' }));
    const onionAlone = [1, 1, 1].map((s) =>
      makeEntry({ name: 'Onion rings', sentiment: s, tagsJson: '["onion"]' }),
    );
    const neutral = [5, 5, 5].map((s) => makeEntry({ name: 'Rice', sentiment: s }));

    expect(analyzeTagPairs([...pairMeals, ...milkAlone, ...onionAlone, ...neutral])).toHaveLength(0);
  });

  it('requires the pair to co-occur in at least MIN_PAIR_OCCURRENCES meals', () => {
    const pairMeals = [1, 1].map((s) =>
      makeEntry({ name: 'Milk onion soup', sentiment: s, tagsJson: '["milk","onion"]' }),
    );
    const neutral = [5, 5, 5].map((s) => makeEntry({ name: 'Rice', sentiment: s }));
    expect(analyzeTagPairs([...pairMeals, ...neutral])).toHaveLength(0);
  });

  it('caps output at MAX_PAIR_FINDINGS', () => {
    // Six distinct interacting pairs, each with a strong isolated interaction.
    const entries = [];
    for (let i = 0; i < 6; i++) {
      const tagA = `a${i}`;
      const tagB = `b${i}`;
      for (const s of [1, 1, 1]) {
        entries.push(makeEntry({ name: `pair${i}`, sentiment: s, tagsJson: `["${tagA}","${tagB}"]` }));
      }
      for (const s of [3, 3, 3]) {
        entries.push(makeEntry({ name: `aAlone${i}`, sentiment: s, tagsJson: `["${tagA}"]` }));
      }
      for (const s of [3, 3, 3]) {
        entries.push(makeEntry({ name: `bAlone${i}`, sentiment: s, tagsJson: `["${tagB}"]` }));
      }
    }
    for (const s of [4, 4, 4, 4]) {
      entries.push(makeEntry({ name: 'Neutral', sentiment: s }));
    }
    const findings = analyzeTagPairs(entries);
    expect(findings.length).toBeLessThanOrEqual(5);
  });
});
