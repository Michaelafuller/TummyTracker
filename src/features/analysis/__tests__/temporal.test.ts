import type { LogEntry } from '@/db/schema';
import { parseTagsJson } from '@/lib/ingredients';
import {
  analyzeOutcomeRates,
  DEFAULT_WINDOW_MS,
  isOutcome,
  MAX_LOW_CONFIDENCE_FINDINGS,
  mealsFollowedByOutcome,
  tagHitRates,
} from '../temporal';

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
const T = 0; // base timestamp

describe('isOutcome', () => {
  it('flags bad Bristol types (1, 2, 6, 7)', () => {
    expect(isOutcome(makeEntry({ type: 'bowel_movement', bristolScale: 1 }))).toBe(true);
    expect(isOutcome(makeEntry({ type: 'bowel_movement', bristolScale: 7 }))).toBe(true);
    expect(isOutcome(makeEntry({ type: 'bowel_movement', bristolScale: 4 }))).toBe(false);
    expect(isOutcome(makeEntry({ type: 'bowel_movement', bristolScale: null }))).toBe(false);
  });

  it('flags a BM that felt bad (sentiment <= 2) even with a good Bristol reading', () => {
    expect(isOutcome(makeEntry({ type: 'bowel_movement', bristolScale: 4, sentiment: 2 }))).toBe(true);
    expect(isOutcome(makeEntry({ type: 'bowel_movement', bristolScale: 4, sentiment: 1 }))).toBe(true);
    expect(isOutcome(makeEntry({ type: 'bowel_movement', bristolScale: 4, sentiment: 4 }))).toBe(false);
    expect(isOutcome(makeEntry({ type: 'bowel_movement', bristolScale: 4, sentiment: null }))).toBe(false);
  });

  it('a bad-Bristol BM is still an outcome regardless of feel rating', () => {
    expect(isOutcome(makeEntry({ type: 'bowel_movement', bristolScale: 1, sentiment: 5 }))).toBe(true);
    expect(isOutcome(makeEntry({ type: 'bowel_movement', bristolScale: 7, sentiment: null }))).toBe(true);
  });

  it('flags symptoms with severity >= 3', () => {
    expect(isOutcome(makeEntry({ type: 'symptom', severity: 3 }))).toBe(true);
    expect(isOutcome(makeEntry({ type: 'symptom', severity: 5 }))).toBe(true);
    expect(isOutcome(makeEntry({ type: 'symptom', severity: 2 }))).toBe(false);
    expect(isOutcome(makeEntry({ type: 'symptom', severity: null }))).toBe(false);
  });

  it('never flags a food entry as an outcome, even with a poor sentiment', () => {
    // Owner decision (Milestone B1): per-meal sentiment is no longer an
    // analysis signal. Only BM/symptom outcomes count.
    expect(isOutcome(makeEntry({ type: 'meal', sentiment: 1 }))).toBe(false);
    expect(isOutcome(makeEntry({ type: 'snack', sentiment: 2 }))).toBe(false);
    expect(isOutcome(makeEntry({ type: 'meal', sentiment: 3 }))).toBe(false);
    expect(isOutcome(makeEntry({ type: 'meal', sentiment: null }))).toBe(false);
  });
});

describe('analyzeOutcomeRates', () => {
  const byName = (meal: LogEntry) => [{ key: meal.name.trim().toLowerCase(), label: meal.name }];

  it('groups by the keysOf-provided key and keeps the first-seen label', () => {
    // Same fixture shape as analyzeIngredientOutcomes's "low" test (see
    // analysis/__tests__/insights.test.ts), but grouped by (case-insensitive)
    // name instead of tag.
    const milkMeals = [
      makeEntry({ type: 'meal', name: 'Milk', loggedAt: T }),
      makeEntry({ type: 'meal', name: 'MILK', loggedAt: T + 4 * HOUR }),
      makeEntry({ type: 'meal', name: 'milk', loggedAt: T + 8 * HOUR }),
    ];
    const controlMeals = [
      makeEntry({ type: 'meal', name: 'Rice', loggedAt: T + 2 * HOUR }),
      makeEntry({ type: 'meal', name: 'Rice', loggedAt: T + 6 * HOUR }),
      makeEntry({ type: 'meal', name: 'Rice', loggedAt: T + 10 * HOUR }),
    ];
    const outcomes = [
      makeEntry({ type: 'symptom', severity: 4, loggedAt: T + HOUR }),
      makeEntry({ type: 'symptom', severity: 3, loggedAt: T + 5 * HOUR }),
      makeEntry({ type: 'symptom', severity: 3, loggedAt: T + 9 * HOUR }),
    ];

    const findings = analyzeOutcomeRates([...milkMeals, ...controlMeals, ...outcomes], byName, {
      windowMs: 2 * HOUR,
      minOccurrences: 3,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      key: 'milk',
      label: 'Milk', // first-seen casing wins, even though later meals were "MILK"/"milk"
      occurrences: 3,
      hits: 3,
      hitRate: 1,
      baseRate: 0.5,
      confidence: 'low',
    });
  });

  it('lets one meal contribute to multiple groups when keysOf returns multiple keys', () => {
    const keysOf = (meal: LogEntry) =>
      parseTagsJson(meal.tagsJson).map((tag) => ({ key: tag, label: tag.toUpperCase() }));

    const trigMeals = [
      makeEntry({ type: 'meal', tagsJson: '["lactose","dairy"]', loggedAt: T }),
      makeEntry({ type: 'meal', tagsJson: '["lactose","dairy"]', loggedAt: T + 4 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["lactose","dairy"]', loggedAt: T + 8 * HOUR }),
    ];
    const controlMeals = [
      makeEntry({ type: 'meal', tagsJson: '["rice"]', loggedAt: T + 2 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["rice"]', loggedAt: T + 6 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["rice"]', loggedAt: T + 10 * HOUR }),
    ];
    const outcomes = [
      makeEntry({ type: 'symptom', severity: 4, loggedAt: T + HOUR }),
      makeEntry({ type: 'symptom', severity: 3, loggedAt: T + 5 * HOUR }),
      makeEntry({ type: 'symptom', severity: 3, loggedAt: T + 9 * HOUR }),
    ];

    const findings = analyzeOutcomeRates([...trigMeals, ...controlMeals, ...outcomes], keysOf, {
      windowMs: 2 * HOUR,
      minOccurrences: 3,
    });

    expect(findings.map((f) => f.key).sort()).toEqual(['dairy', 'lactose']);
    for (const f of findings) {
      expect(f).toMatchObject({ occurrences: 3, hits: 3, hitRate: 1, baseRate: 0.5, confidence: 'low' });
      expect(f.label).toBe(f.key.toUpperCase());
    }
  });

  it('gates a group under minOccurrences', () => {
    const meals = [
      makeEntry({ type: 'meal', name: 'Egg', loggedAt: T }),
      makeEntry({ type: 'meal', name: 'Egg', loggedAt: T + 2 * HOUR }),
    ];
    const outcome = makeEntry({ type: 'symptom', severity: 5, loggedAt: T + HOUR });

    const findings = analyzeOutcomeRates([...meals, outcome], byName, {
      windowMs: DEFAULT_WINDOW_MS,
      minOccurrences: 3,
    });

    expect(findings).toHaveLength(0);
  });

  it('assigns "high" confidence when the Wilson lower bound clears the base rate', () => {
    // Same shape as analyzeIngredientOutcomes's "high" test, grouped by name.
    const GAP = 20 * HOUR;
    const triggerMeals = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ type: 'meal', name: 'Trigger', loggedAt: T + i * GAP }),
    );
    const controlMeals = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ type: 'meal', name: 'Control', loggedAt: T + 1000 * HOUR + i * GAP }),
    );
    const outcomes = [
      ...Array.from({ length: 9 }, (_, i) =>
        makeEntry({ type: 'symptom', severity: 4, loggedAt: T + i * GAP + HOUR }),
      ),
      makeEntry({ type: 'symptom', severity: 4, loggedAt: T + 1000 * HOUR + HOUR }),
    ];

    const findings = analyzeOutcomeRates([...triggerMeals, ...controlMeals, ...outcomes], byName, {
      windowMs: 2 * HOUR,
      minOccurrences: 3,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      key: 'trigger',
      label: 'Trigger',
      occurrences: 10,
      hits: 9,
      hitRate: 0.9,
      baseRate: 0.5,
      confidence: 'high',
    });
  });

  it('caps low-confidence-only results at MAX_LOW_CONFIDENCE_FINDINGS', () => {
    const names = ['A', 'B', 'C', 'D', 'E'];
    const entries: LogEntry[] = [];
    for (const name of names) {
      for (let i = 0; i < 3; i++) {
        const loggedAt = T + (names.indexOf(name) * 3 + i) * 10 * HOUR;
        entries.push(makeEntry({ type: 'meal', name, loggedAt }));
        entries.push(makeEntry({ type: 'symptom', severity: 4, loggedAt: loggedAt + HOUR }));
      }
    }
    // A control group with meals never followed by an outcome, so baseRate < 1.0
    // and the groups above show excess risk.
    for (let i = 0; i < 3; i++) {
      entries.push(makeEntry({ type: 'meal', name: 'Control', loggedAt: T + 1000 * HOUR + i * 10 * HOUR }));
    }

    const findings = analyzeOutcomeRates(entries, byName, { windowMs: 2 * HOUR, minOccurrences: 3 });

    expect(findings.length).toBeLessThanOrEqual(MAX_LOW_CONFIDENCE_FINDINGS);
    expect(findings.every((f) => f.confidence === 'low')).toBe(true);
  });

  it('returns nothing when there are no eligible meals (keysOf returns [] for everything)', () => {
    const meals = [makeEntry({ type: 'meal', name: 'Rice', loggedAt: T })];
    const findings = analyzeOutcomeRates(meals, () => []);
    expect(findings).toHaveLength(0);
  });
});

describe('mealsFollowedByOutcome', () => {
  it('marks a meal true when an outcome follows it within windowMs, false otherwise', () => {
    const meals = [
      makeEntry({ type: 'meal', name: 'Hit', loggedAt: T }),
      makeEntry({ type: 'meal', name: 'Miss', loggedAt: T + 10 * HOUR }),
    ];
    const outcome = makeEntry({ type: 'symptom', severity: 4, loggedAt: T + HOUR });

    const map = mealsFollowedByOutcome([...meals, outcome], meals, 2 * HOUR);

    expect(map.get(meals[0].id)).toBe(true);
    expect(map.get(meals[1].id)).toBe(false);
  });

  it('excludes an outcome at or before the meal, and one beyond the window', () => {
    const meal = makeEntry({ type: 'meal', name: 'Meal', loggedAt: T + 5 * HOUR });
    const before = makeEntry({ type: 'symptom', severity: 4, loggedAt: T + 5 * HOUR }); // same instant, not "after"
    const beyond = makeEntry({ type: 'symptom', severity: 4, loggedAt: T + 5 * HOUR + 3 * HOUR }); // past 2h window

    const map = mealsFollowedByOutcome([meal, before, beyond], [meal], 2 * HOUR);

    expect(map.get(meal.id)).toBe(false);
  });

  it('includes an outcome exactly at the window boundary (inclusive)', () => {
    const meal = makeEntry({ type: 'meal', name: 'Meal', loggedAt: T });
    const boundary = makeEntry({ type: 'symptom', severity: 4, loggedAt: T + 2 * HOUR });

    const map = mealsFollowedByOutcome([meal, boundary], [meal], 2 * HOUR);

    expect(map.get(meal.id)).toBe(true);
  });

  it('defaults windowMs to DEFAULT_WINDOW_MS', () => {
    const meal = makeEntry({ type: 'meal', name: 'Meal', loggedAt: T });
    const justInside = makeEntry({ type: 'symptom', severity: 4, loggedAt: T + DEFAULT_WINDOW_MS });
    const map = mealsFollowedByOutcome([meal, justInside], [meal]);
    expect(map.get(meal.id)).toBe(true);
  });
});

describe('tagHitRates', () => {
  it('returns raw (ungated, unrounded) per-tag hit rates', () => {
    const meals = [
      makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: T }),
      makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: T + 4 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: T + 8 * HOUR }),
    ];
    // Only 2 of the 3 lactose meals are followed by an outcome within the window.
    const outcomes = [
      makeEntry({ type: 'symptom', severity: 4, loggedAt: T + HOUR }),
      makeEntry({ type: 'symptom', severity: 3, loggedAt: T + 5 * HOUR }),
    ];

    const rates = tagHitRates([...meals, ...outcomes], 2 * HOUR);

    expect(rates.size).toBe(1);
    expect(rates.get('lactose')).toBeCloseTo(2 / 3, 10);
  });

  it('applies no minimum-occurrence or excess-over-baseline gate', () => {
    // A single meal with a single hit -> rate 1, even though this would never
    // clear DEFAULT_MIN_MEALS in analyzeOutcomeRates.
    const meal = makeEntry({ type: 'meal', tagsJson: '["rare-tag"]', loggedAt: T });
    const outcome = makeEntry({ type: 'symptom', severity: 3, loggedAt: T + HOUR });

    const rates = tagHitRates([meal, outcome]);

    expect(rates.get('rare-tag')).toBe(1);
  });

  it('returns an empty map when there are no tag-eligible meals', () => {
    expect(tagHitRates([]).size).toBe(0);
    expect(tagHitRates([makeEntry({ type: 'meal', tagsJson: null, loggedAt: T })]).size).toBe(0);
    expect(tagHitRates([makeEntry({ type: 'meal', tagsJson: '[]', loggedAt: T })]).size).toBe(0);
  });
});
