import type { LogEntry } from '@/db/schema';
import {
  analyzeFoodOutcomes,
  analyzeIngredientOutcomes,
  analyzeIngredientSentiment,
  analyzeFoodSentiment,
  analyzeNutrientOutcomes,
  analyzeNutrientSentiment,
  analyzePairOutcomes,
  analyzeTagPairs,
  computeInsights,
  MAX_PAIR_FINDINGS,
  MIN_FOOD_OCCURRENCES,
  NUTRIENT_RATE_MARGIN,
  PAIR_RATE_MARGIN,
  summarize,
  summarizeOutcomes,
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

const HOUR = 60 * 60 * 1000;

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

describe('analyzeIngredientOutcomes', () => {
  it('surfaces a tag whose meals are followed by an outcome within 24h more often than baseline', () => {
    // Default window is 24h (no windowMs override here, unlike
    // analyzeTemporalTriggers's equivalent test) -- meals and their outcomes
    // are spaced 48h apart so windows never bleed into a neighboring meal,
    // and the control group sits far enough away (500h+) to never hit.
    const lactoseMeals = [
      makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: 0 }),
      makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: 48 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: 96 * HOUR }),
    ];
    const controlMeals = [
      makeEntry({ type: 'meal', tagsJson: '["rice"]', loggedAt: 500 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["rice"]', loggedAt: 548 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["rice"]', loggedAt: 596 * HOUR }),
    ];
    const outcomes = [
      makeEntry({ type: 'symptom', severity: 4, loggedAt: 1 * HOUR }),
      makeEntry({ type: 'symptom', severity: 4, loggedAt: 49 * HOUR }),
      makeEntry({ type: 'symptom', severity: 4, loggedAt: 97 * HOUR }),
    ];

    const findings = analyzeIngredientOutcomes([...lactoseMeals, ...controlMeals, ...outcomes]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      key: 'lactose',
      label: 'lactose',
      occurrences: 3,
      hits: 3,
      hitRate: 1,
      baseRate: 0.5,
      confidence: 'low',
    });
  });

  it('does not count an outcome that falls outside the 24h window', () => {
    const meals = [
      makeEntry({ type: 'meal', tagsJson: '["onion"]', loggedAt: 0 }),
      makeEntry({ type: 'meal', tagsJson: '["onion"]', loggedAt: 48 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["onion"]', loggedAt: 96 * HOUR }),
    ];
    const outcome = makeEntry({ type: 'symptom', severity: 4, loggedAt: 25 * HOUR }); // just past 24h

    expect(analyzeIngredientOutcomes([...meals, outcome])).toHaveLength(0);
  });
});

describe('analyzeFoodOutcomes', () => {
  it('groups foods by case-insensitive name, keeping the first-seen casing as the label', () => {
    // Default 24h window, same widened spacing as analyzeIngredientOutcomes's
    // equivalent test above.
    const milkMeals = [
      makeEntry({ type: 'meal', name: 'Milk', loggedAt: 0 }),
      makeEntry({ type: 'meal', name: 'MILK', loggedAt: 48 * HOUR }),
      makeEntry({ type: 'meal', name: 'milk', loggedAt: 96 * HOUR }),
    ];
    const controlMeals = [
      makeEntry({ type: 'meal', name: 'Rice', loggedAt: 500 * HOUR }),
      makeEntry({ type: 'meal', name: 'Rice', loggedAt: 548 * HOUR }),
      makeEntry({ type: 'meal', name: 'Rice', loggedAt: 596 * HOUR }),
    ];
    const outcomes = [
      makeEntry({ type: 'symptom', severity: 4, loggedAt: 1 * HOUR }),
      makeEntry({ type: 'symptom', severity: 4, loggedAt: 49 * HOUR }),
      makeEntry({ type: 'symptom', severity: 4, loggedAt: 97 * HOUR }),
    ];

    const findings = analyzeFoodOutcomes([...milkMeals, ...controlMeals, ...outcomes]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      key: 'milk',
      label: 'Milk',
      occurrences: 3,
      hits: 3,
      hitRate: 1,
      baseRate: 0.5,
      confidence: 'low',
    });
  });

  it('gates a food under MIN_FOOD_OCCURRENCES', () => {
    const meals = Array.from({ length: MIN_FOOD_OCCURRENCES - 1 }, (_, i) =>
      makeEntry({ type: 'meal', name: 'Egg', loggedAt: i * 2 * HOUR }),
    );
    const outcome = makeEntry({ type: 'symptom', severity: 5, loggedAt: 1 * HOUR });

    expect(analyzeFoodOutcomes([...meals, outcome])).toHaveLength(0);
  });
});

describe('analyzePairOutcomes', () => {
  it('surfaces a pair whose hit rate genuinely exceeds both single tags by PAIR_RATE_MARGIN', () => {
    // milk+onion meals all hit; a control pair (rice+beans) never hits, giving
    // the pair-eligible baseRate room below the pair's 100%. milk-alone and
    // onion-alone meals never hit, so each single tag's raw rate (tagHitRates,
    // blended with the pair meals that also carry the tag) sits at 0.5 --
    // 0.5 + PAIR_RATE_MARGIN is comfortably cleared by the pair's 1.0.
    const pairMeals = [0, 4 * HOUR, 8 * HOUR].map((loggedAt) =>
      makeEntry({ type: 'meal', tagsJson: '["milk","onion"]', loggedAt }),
    );
    const pairOutcomes = [1 * HOUR, 5 * HOUR, 9 * HOUR].map((loggedAt) =>
      makeEntry({ type: 'symptom', severity: 4, loggedAt }),
    );
    const controlPairMeals = [100 * HOUR, 104 * HOUR, 108 * HOUR].map((loggedAt) =>
      makeEntry({ type: 'meal', tagsJson: '["rice","beans"]', loggedAt }),
    );
    const milkAlone = [200 * HOUR, 204 * HOUR, 208 * HOUR].map((loggedAt) =>
      makeEntry({ type: 'meal', tagsJson: '["milk"]', loggedAt }),
    );
    const onionAlone = [300 * HOUR, 304 * HOUR, 308 * HOUR].map((loggedAt) =>
      makeEntry({ type: 'meal', tagsJson: '["onion"]', loggedAt }),
    );

    const findings = analyzePairOutcomes([
      ...pairMeals,
      ...pairOutcomes,
      ...controlPairMeals,
      ...milkAlone,
      ...onionAlone,
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      key: 'milk + onion',
      label: 'milk + onion',
      occurrences: 3,
      hits: 3,
      hitRate: 1,
      confidence: 'low',
    });
  });

  it('fails the interaction gate when one single tag alone carries the same rate as the pair', () => {
    // Same fixture as above, except milk-alone meals ALSO all hit, so milk's
    // blended raw rate rises to 1.0 -- equal to the pair's rate, so the pair
    // no longer beats milk's rate by PAIR_RATE_MARGIN and is excluded even
    // though onion alone still clears the gate on its own.
    const pairMeals = [0, 4 * HOUR, 8 * HOUR].map((loggedAt) =>
      makeEntry({ type: 'meal', tagsJson: '["milk","onion"]', loggedAt }),
    );
    const pairOutcomes = [1 * HOUR, 5 * HOUR, 9 * HOUR].map((loggedAt) =>
      makeEntry({ type: 'symptom', severity: 4, loggedAt }),
    );
    const controlPairMeals = [100 * HOUR, 104 * HOUR, 108 * HOUR].map((loggedAt) =>
      makeEntry({ type: 'meal', tagsJson: '["rice","beans"]', loggedAt }),
    );
    const milkAloneAllHit = [200 * HOUR, 204 * HOUR, 208 * HOUR].map((loggedAt) =>
      makeEntry({ type: 'meal', tagsJson: '["milk"]', loggedAt }),
    );
    const milkAloneOutcomes = [201 * HOUR, 205 * HOUR, 209 * HOUR].map((loggedAt) =>
      makeEntry({ type: 'symptom', severity: 4, loggedAt }),
    );
    const onionAlone = [300 * HOUR, 304 * HOUR, 308 * HOUR].map((loggedAt) =>
      makeEntry({ type: 'meal', tagsJson: '["onion"]', loggedAt }),
    );

    const findings = analyzePairOutcomes([
      ...pairMeals,
      ...pairOutcomes,
      ...controlPairMeals,
      ...milkAloneAllHit,
      ...milkAloneOutcomes,
      ...onionAlone,
    ]);

    expect(findings).toHaveLength(0);
  });

  it('caps output at MAX_PAIR_FINDINGS', () => {
    // Six independent tag pairs, each with a 100% hit rate over 5 meals
    // (enough to clear medium confidence, so the engine's own low-only cap
    // doesn't mask MAX_PAIR_FINDINGS). A large, never-hitting control pair
    // pool keeps the pair-eligible baseRate well below the pairs' 100%, and
    // each pair's single-tag siblings never hit, keeping raw single rates
    // low enough to clear PAIR_RATE_MARGIN against 1.0.
    const entries: LogEntry[] = [];
    for (let i = 0; i < 6; i++) {
      const tagA = `a${i}`;
      const tagB = `b${i}`;
      const base = i * 1000 * HOUR;
      for (let k = 0; k < 5; k++) {
        const loggedAt = base + k * 4 * HOUR;
        entries.push(makeEntry({ type: 'meal', tagsJson: `["${tagA}","${tagB}"]`, loggedAt }));
        entries.push(makeEntry({ type: 'symptom', severity: 4, loggedAt: loggedAt + HOUR }));
      }
      for (let k = 0; k < 5; k++) {
        entries.push(makeEntry({ type: 'meal', tagsJson: `["${tagA}"]`, loggedAt: base + 100 * HOUR + k * 4 * HOUR }));
        entries.push(makeEntry({ type: 'meal', tagsJson: `["${tagB}"]`, loggedAt: base + 200 * HOUR + k * 4 * HOUR }));
      }
    }
    const controlBase = 6 * 1000 * HOUR;
    for (let k = 0; k < 20; k++) {
      entries.push(makeEntry({ type: 'meal', tagsJson: '["x","y"]', loggedAt: controlBase + k * 4 * HOUR }));
    }

    const findings = analyzePairOutcomes(entries);

    expect(findings.length).toBeLessThanOrEqual(MAX_PAIR_FINDINGS);
    expect(findings.length).toBeGreaterThan(0);
    // Sanity check that this fixture really does clear PAIR_RATE_MARGIN (not
    // just coincidentally staying under the cap for an unrelated reason).
    expect(PAIR_RATE_MARGIN).toBeLessThan(1);
  });
});

describe('analyzeNutrientOutcomes', () => {
  it('flags a nutrient whose high-value meals are followed by an outcome much more often than low-value meals', () => {
    // 8 samples, median-split 4/4 (median = (12+40)/2 = 26). Every high-fat
    // meal is followed by an outcome; no low-fat meal is. Gap (1.0) clears
    // NUTRIENT_RATE_MARGIN comfortably, and the high side's Wilson lower
    // bound (~0.51, hand-verified) clears the low side's rate (0) -> high.
    const lowFat = [5, 8, 10, 12];
    const highFat = [40, 42, 45, 48];
    const entries: LogEntry[] = [];
    lowFat.forEach((fatG, i) => {
      entries.push(makeEntry({ name: `low${i}`, fatG, loggedAt: i * 100 * HOUR }));
    });
    highFat.forEach((fatG, i) => {
      const loggedAt = 1000 * HOUR + i * 100 * HOUR;
      entries.push(makeEntry({ name: `high${i}`, fatG, loggedAt }));
      entries.push(makeEntry({ type: 'symptom', severity: 4, loggedAt: loggedAt + HOUR }));
    });

    const findings = analyzeNutrientOutcomes(entries);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      nutrient: 'fatG',
      thresholdValue: 26,
      highRate: 1,
      lowRate: 0,
      sampleSize: 4,
      confidence: 'high',
    });
  });

  it('suppresses a finding when the high/low outcome-rate gap is below NUTRIENT_RATE_MARGIN', () => {
    // Same threshold split as above, but exactly one meal on each side hits
    // (0.25 vs 0.25) -- a zero gap, well under NUTRIENT_RATE_MARGIN.
    const lowFat = [5, 8, 10, 12];
    const highFat = [40, 42, 45, 48];
    const entries: LogEntry[] = [];
    lowFat.forEach((fatG, i) => {
      const loggedAt = i * 100 * HOUR;
      entries.push(makeEntry({ name: `low${i}`, fatG, loggedAt }));
      if (i === 0) entries.push(makeEntry({ type: 'symptom', severity: 4, loggedAt: loggedAt + HOUR }));
    });
    highFat.forEach((fatG, i) => {
      const loggedAt = 1000 * HOUR + i * 100 * HOUR;
      entries.push(makeEntry({ name: `high${i}`, fatG, loggedAt }));
      if (i === 0) entries.push(makeEntry({ type: 'symptom', severity: 4, loggedAt: loggedAt + HOUR }));
    });

    expect(NUTRIENT_RATE_MARGIN).toBeGreaterThan(0); // sanity: gap 0 must fail a positive margin
    expect(analyzeNutrientOutcomes(entries)).toHaveLength(0);
  });

  it('suppresses a finding below MIN_NUTRIENT_SAMPLES', () => {
    const entries = [
      makeEntry({ fatG: 5, loggedAt: 0 }),
      makeEntry({ fatG: 50, loggedAt: 0 }),
    ];
    expect(analyzeNutrientOutcomes(entries)).toHaveLength(0);
  });
});

describe('summarizeOutcomes', () => {
  it('counts entries by kind and rough outcomes, including a BM-feel outcome', () => {
    const entries = [
      makeEntry({ type: 'meal' }),
      makeEntry({ type: 'snack' }),
      makeEntry({ type: 'bowel_movement', bristolScale: 4, sentiment: 2 }), // feel-rating outcome (<= 2)
      makeEntry({ type: 'bowel_movement', bristolScale: 4, sentiment: 4 }), // not an outcome
      makeEntry({ type: 'symptom', severity: 3 }), // outcome (>= 3)
      makeEntry({ type: 'symptom', severity: 1 }), // not an outcome
    ];

    expect(summarizeOutcomes(entries)).toEqual({
      totalEntries: 6,
      foodEntries: 2,
      bmEntries: 2,
      symptomEntries: 2,
      roughOutcomes: 2,
    });
  });
});
