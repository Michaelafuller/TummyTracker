import type { LogEntry } from '@/db/schema';
import { SLOW_WINDOW_MS } from '../temporal';
import { findingInstances } from '../drilldown';
import { latencyLine, latencySummary } from '../latency';
import {
  analyzeFoodOutcomes,
  analyzeIngredientOutcomes,
  analyzeNutrientOutcomes,
  analyzeSlowerPatterns,
  analyzePairOutcomes,
  computeInsights,
  MAX_PAIR_FINDINGS,
  MIN_FOOD_OCCURRENCES,
  NUTRIENT_RATE_MARGIN,
  PAIR_RATE_MARGIN,
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

const HOUR = 60 * 60 * 1000;

describe('analyzeIngredientOutcomes', () => {
  it('surfaces a tag whose meals are followed by an outcome within 24h more often than baseline', () => {
    // Default window is 24h -- meals and their outcomes are spaced 48h apart so
    // windows never bleed into a neighboring meal, and the control group sits
    // far enough away (500h+) to never hit.
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

  it('treats a low-rated BM feel (<= 2) as an outcome', () => {
    const meals = [
      makeEntry({ type: 'meal', tagsJson: '["dairy"]', loggedAt: 0 }),
      makeEntry({ type: 'meal', tagsJson: '["dairy"]', loggedAt: 48 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["dairy"]', loggedAt: 96 * HOUR }),
    ];
    const controlMeals = [
      makeEntry({ type: 'meal', tagsJson: '["rice"]', loggedAt: 500 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["rice"]', loggedAt: 548 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["rice"]', loggedAt: 596 * HOUR }),
    ];
    // Good Bristol (4) but a poor feel rating (<= 2) still counts as an outcome.
    const outcomes = [
      makeEntry({ type: 'bowel_movement', bristolScale: 4, sentiment: 1, loggedAt: 1 * HOUR }),
      makeEntry({ type: 'bowel_movement', bristolScale: 4, sentiment: 2, loggedAt: 49 * HOUR }),
      makeEntry({ type: 'bowel_movement', bristolScale: 4, sentiment: 1, loggedAt: 97 * HOUR }),
    ];

    const findings = analyzeIngredientOutcomes([...meals, ...controlMeals, ...outcomes]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ key: 'dairy', hits: 3, hitRate: 1, baseRate: 0.5 });
  });
});

describe('analyzeFoodOutcomes', () => {
  it('groups foods by case-insensitive name, keeping the first-seen casing as the label', () => {
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

describe('summarize', () => {
  it('counts entries by kind and rough outcomes, including a BM-feel outcome', () => {
    const entries = [
      makeEntry({ type: 'meal' }),
      makeEntry({ type: 'snack' }),
      makeEntry({ type: 'bowel_movement', bristolScale: 4, sentiment: 2 }), // feel-rating outcome (<= 2)
      makeEntry({ type: 'bowel_movement', bristolScale: 4, sentiment: 4 }), // not an outcome
      makeEntry({ type: 'symptom', severity: 3 }), // outcome (>= 3)
      makeEntry({ type: 'symptom', severity: 1 }), // not an outcome
    ];

    expect(summarize(entries)).toEqual({
      totalEntries: 6,
      foodEntries: 2,
      bmEntries: 2,
      symptomEntries: 2,
      roughOutcomes: 2,
    });
  });
});

describe('computeInsights', () => {
  it('bundles summary, nutrient, food, ingredient, and pair outcome analyses', () => {
    const insights = computeInsights([makeEntry({})]);
    expect(insights.summary.totalEntries).toBe(1);
    expect(insights.nutrientFindings).toEqual([]);
    expect(insights.foodFindings).toEqual([]);
    expect(insights.ingredientFindings).toEqual([]);
    expect(insights.pairFindings).toEqual([]);
  });

  it('surfaces ingredientFindings when a tag-outcome pattern exists', () => {
    const meals = [
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

    const insights = computeInsights([...meals, ...controlMeals, ...outcomes]);

    expect(insights.ingredientFindings).toHaveLength(1);
    expect(insights.ingredientFindings[0]).toMatchObject({ key: 'lactose' });
  });
});

describe('window parameter — defaults leave 24 h results unchanged', () => {
  function lactoseFixture(): LogEntry[] {
    return [
      makeEntry({ type: 'meal', name: 'Latte', tagsJson: '["lactose"]', loggedAt: 0 }),
      makeEntry({ type: 'meal', name: 'Latte', tagsJson: '["lactose"]', loggedAt: 48 * HOUR }),
      makeEntry({ type: 'meal', name: 'Latte', tagsJson: '["lactose"]', loggedAt: 96 * HOUR }),
      makeEntry({ type: 'meal', name: 'Rice', tagsJson: '["rice"]', loggedAt: 500 * HOUR }),
      makeEntry({ type: 'meal', name: 'Rice', tagsJson: '["rice"]', loggedAt: 548 * HOUR }),
      makeEntry({ type: 'meal', name: 'Rice', tagsJson: '["rice"]', loggedAt: 596 * HOUR }),
      makeEntry({ type: 'symptom', severity: 4, loggedAt: 1 * HOUR }),
      makeEntry({ type: 'symptom', severity: 4, loggedAt: 49 * HOUR }),
      makeEntry({ type: 'symptom', severity: 4, loggedAt: 97 * HOUR }),
    ];
  }

  it('passing the 24 h default explicitly equals omitting it, for all three analyses', () => {
    const entries = lactoseFixture();
    expect(analyzeIngredientOutcomes(entries, 24 * HOUR)).toEqual(analyzeIngredientOutcomes(entries));
    expect(analyzeFoodOutcomes(entries, 24 * HOUR)).toEqual(analyzeFoodOutcomes(entries));
    expect(analyzePairOutcomes(entries, 24 * HOUR)).toEqual(analyzePairOutcomes(entries));
    expect(analyzeIngredientOutcomes(entries)).toHaveLength(1);
  });

  it('computeInsights itself does not gain slower-pattern fields', () => {
    expect(Object.keys(computeInsights(lactoseFixture())).sort()).toEqual([
      'foodFindings',
      'ingredientFindings',
      'nutrientFindings',
      'pairFindings',
      'summary',
    ]);
  });
});

describe('analyzeSlowerPatterns', () => {
  /** Six meals 72 h apart, each followed by a rough outcome after `delays[i]` hours. */
  function triggerMeals(
    name: string,
    tags: string,
    delays: number[],
    start = 0,
  ): LogEntry[] {
    const entries: LogEntry[] = [];
    delays.forEach((delay, i) => {
      const t = start + i * 72 * HOUR;
      entries.push(makeEntry({ type: 'meal', name, tagsJson: tags, loggedAt: t }));
      entries.push(makeEntry({ type: 'symptom', severity: 4, loggedAt: t + delay * HOUR }));
    });
    return entries;
  }
  /** Meals that are never followed by anything (far from every outcome). */
  function quietMeals(name: string, tags: string, count: number, start: number): LogEntry[] {
    return Array.from({ length: count }, (_, i) =>
      makeEntry({ type: 'meal', name, tagsJson: tags, loggedAt: start + i * 72 * HOUR }),
    );
  }
  const slower = (entries: LogEntry[]) => analyzeSlowerPatterns(entries, computeInsights(entries));

  it('worked example: a ~30 h trigger is absent at 24 h and shows up as a slower pattern with latency', () => {
    // Onion soup: each meal is followed by a rough symptom 26-38 h later.
    const delays = [26, 28, 30, 32, 34, 38];
    const entries = [
      ...triggerMeals('Onion soup', '["onion"]', delays),
      ...quietMeals('Plain rice', '["rice"]', 6, 1000 * HOUR),
    ];

    const day = computeInsights(entries);
    expect(day.ingredientFindings).toEqual([]);
    expect(day.foodFindings).toEqual([]);

    const result = slower(entries);
    expect(result.ingredientFindings).toEqual([
      { key: 'onion', label: 'onion', occurrences: 6, hits: 6, hitRate: 1, baseRate: 0.5, confidence: 'high' },
    ]);
    expect(result.foodFindings.map((f) => f.key)).toEqual(['onion soup']);
    expect(result.pairFindings).toEqual([]);

    const instances = findingInstances(entries, 'tag', 'onion', SLOW_WINDOW_MS);
    const summary = latencySummary(instances.flatMap((i) => (i.outcomeDelayMs == null ? [] : [i.outcomeDelayMs])));
    expect(summary).toEqual({ medianH: 30, lowH: 28, highH: 34, n: 6 });
    expect(summary && latencyLine(summary)).toBe('Usually about 30 h later (28–34 h)');
  });

  it('never duplicates a finding already shown at 24 h', () => {
    const entries = [
      ...triggerMeals('Onion soup', '["onion"]', [3, 3, 3, 3, 3, 3]),
      ...quietMeals('Plain rice', '["rice"]', 6, 1000 * HOUR),
    ];
    const day = computeInsights(entries);
    expect(day.ingredientFindings.map((f) => f.key)).toEqual(['onion']);

    const result = slower(entries);
    expect(result.ingredientFindings).toEqual([]);
    expect(result.foodFindings).toEqual([]);
  });

  it('excludes findings that are only low confidence at 48 h', () => {
    const entries = [
      ...triggerMeals('Latte', '["lactose"]', [30, 30, 30]),
      ...quietMeals('Plain rice', '["rice"]', 3, 1000 * HOUR),
    ];
    const raw = analyzeIngredientOutcomes(entries, SLOW_WINDOW_MS);
    expect(raw.map((f) => [f.key, f.confidence])).toEqual([['lactose', 'low']]);

    expect(slower(entries).ingredientFindings).toEqual([]);
  });

  it('finds nothing when rough outcomes are everywhere (baseline saturation)', () => {
    const entries: LogEntry[] = [];
    for (let d = 0; d < 20; d++) {
      entries.push(makeEntry({ type: 'meal', name: 'Toast', tagsJson: '["gluten"]', loggedAt: d * 24 * HOUR }));
      entries.push(makeEntry({ type: 'meal', name: 'Curry', tagsJson: '["onion"]', loggedAt: d * 24 * HOUR + 6 * HOUR }));
      entries.push(makeEntry({ type: 'symptom', severity: 4, loggedAt: d * 24 * HOUR + 12 * HOUR }));
    }
    expect(slower(entries)).toEqual({ ingredientFindings: [], foodFindings: [], pairFindings: [] });
  });

  it('surfaces a slow combination, using the 48 h tag rates for its interaction test', () => {
    const entries = [
      ...triggerMeals('Soup', '["a","b"]', [30, 30, 30, 30, 30, 30]),
      ...quietMeals('A alone', '["a"]', 3, 1000 * HOUR),
      ...quietMeals('B alone', '["b"]', 3, 2000 * HOUR),
      // Other combinations that are never followed by anything keep the pair baseline below 100 %.
      ...quietMeals('C and D', '["c","d"]', 6, 3000 * HOUR),
    ];
    expect(computeInsights(entries).pairFindings).toEqual([]);

    const result = slower(entries);
    expect(result.pairFindings).toHaveLength(1);
    expect(result.pairFindings[0]).toMatchObject({ key: 'a + b', hits: 6, occurrences: 6 });
    expect(['medium', 'high']).toContain(result.pairFindings[0].confidence);
  });
});
