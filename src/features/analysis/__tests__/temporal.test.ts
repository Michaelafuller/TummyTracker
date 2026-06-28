import type { LogEntry } from '@/db/schema';
import {
  analyzeTemporalTriggers,
  DEFAULT_MIN_MEALS,
  DEFAULT_WINDOW_MS,
  isOutcome,
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

  it('flags symptoms with severity >= 3', () => {
    expect(isOutcome(makeEntry({ type: 'symptom', severity: 3 }))).toBe(true);
    expect(isOutcome(makeEntry({ type: 'symptom', severity: 5 }))).toBe(true);
    expect(isOutcome(makeEntry({ type: 'symptom', severity: 2 }))).toBe(false);
    expect(isOutcome(makeEntry({ type: 'symptom', severity: null }))).toBe(false);
  });

  it('flags food entries with sentiment <= 2', () => {
    expect(isOutcome(makeEntry({ type: 'meal', sentiment: 1 }))).toBe(true);
    expect(isOutcome(makeEntry({ type: 'snack', sentiment: 2 }))).toBe(true);
    expect(isOutcome(makeEntry({ type: 'meal', sentiment: 3 }))).toBe(false);
    expect(isOutcome(makeEntry({ type: 'meal', sentiment: null }))).toBe(false);
  });
});

describe('analyzeTemporalTriggers', () => {
  it('surfaces a tag whose hit rate exceeds the baseline', () => {
    // 3 lactose meals each followed by a bad symptom within 2h → hitRate 100%
    // 3 control meals (different tag) with no following outcomes → lower base rate
    const lactoseMeals = [
      makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: T }),
      makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: T + 4 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: T + 8 * HOUR }),
    ];
    const controlMeals = [
      makeEntry({ type: 'meal', tagsJson: '["rice"]', loggedAt: T + 2 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["rice"]', loggedAt: T + 6 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["rice"]', loggedAt: T + 10 * HOUR }),
    ];
    const outcomes = [
      makeEntry({ type: 'symptom', severity: 4, loggedAt: T + HOUR }),      // follows lactose[0]
      makeEntry({ type: 'symptom', severity: 3, loggedAt: T + 5 * HOUR }),  // follows lactose[1]
      makeEntry({ type: 'symptom', severity: 3, loggedAt: T + 9 * HOUR }),  // follows lactose[2]
    ];

    const findings = analyzeTemporalTriggers([...lactoseMeals, ...controlMeals, ...outcomes], {
      windowMs: 2 * HOUR,
      minMeals: 3,
    });

    expect(findings).toHaveLength(1);
    // lactose: hits=3/3=1.0; baseRate=3/6=0.5 → excess
    expect(findings[0]).toMatchObject({
      tag: 'lactose',
      meals: 3,
      hits: 3,
      hitRate: 1,
      baseRate: 0.5,
    });
  });

  it('returns nothing when hit rate equals or is below base rate', () => {
    // All 3 tagged meals have the "wheat" tag, all are followed by an outcome.
    // Since ALL tagged meals are wheat, hitRate == baseRate == 1.0 → no excess.
    const meals = [
      makeEntry({ type: 'meal', tagsJson: '["wheat"]', loggedAt: T }),
      makeEntry({ type: 'meal', tagsJson: '["wheat"]', loggedAt: T + 4 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["wheat"]', loggedAt: T + 8 * HOUR }),
    ];
    const outcomes = [
      makeEntry({ type: 'symptom', severity: 3, loggedAt: T + HOUR }),
      makeEntry({ type: 'symptom', severity: 3, loggedAt: T + 5 * HOUR }),
      makeEntry({ type: 'symptom', severity: 3, loggedAt: T + 9 * HOUR }),
    ];

    const findings = analyzeTemporalTriggers([...meals, ...outcomes], {
      windowMs: 2 * HOUR,
      minMeals: 3,
    });

    // wheat hitRate (1.0) equals baseRate (1.0) — filtered out
    expect(findings).toHaveLength(0);
  });

  it('returns nothing when tag appears fewer than minMeals times', () => {
    const meals = [
      makeEntry({ type: 'meal', tagsJson: '["gluten"]', loggedAt: T }),
      makeEntry({ type: 'meal', tagsJson: '["gluten"]', loggedAt: T + 2 * HOUR }),
    ];
    const outcome = makeEntry({ type: 'symptom', severity: 5, loggedAt: T + HOUR });

    const findings = analyzeTemporalTriggers([...meals, outcome], {
      windowMs: DEFAULT_WINDOW_MS,
      minMeals: 3,
    });

    expect(findings).toHaveLength(0);
  });

  it('ignores outcomes that fall outside the window', () => {
    // lactose meal at T, outcome at T+25h — just beyond the 24h window
    const lactoseMeals = [
      makeEntry({ type: 'meal', tagsJson: '["onion"]', loggedAt: T }),
      makeEntry({ type: 'meal', tagsJson: '["onion"]', loggedAt: T + 48 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["onion"]', loggedAt: T + 96 * HOUR }),
    ];
    const outcome = makeEntry({ type: 'symptom', severity: 4, loggedAt: T + 25 * HOUR });

    const findings = analyzeTemporalTriggers([...lactoseMeals, outcome], {
      windowMs: DEFAULT_WINDOW_MS,
      minMeals: 3,
    });

    // outcome at T+25h is after meal[0]+24h and before meal[1], so no meal has a hit
    expect(findings).toHaveLength(0);
  });

  it('ignores entries with no tags', () => {
    const noTagMeal = makeEntry({ type: 'meal', tagsJson: null, loggedAt: T });
    const emptyTagMeal = makeEntry({ type: 'meal', tagsJson: '[]', loggedAt: T + HOUR });
    const outcome = makeEntry({ type: 'symptom', severity: 4, loggedAt: T + 2 * HOUR });

    const findings = analyzeTemporalTriggers([noTagMeal, emptyTagMeal, outcome], {
      minMeals: DEFAULT_MIN_MEALS,
    });

    expect(findings).toHaveLength(0);
  });

  it('sorts findings by hitRate - baseRate descending', () => {
    // tag "a": 3/3 hits (100%); tag "b": 1/3 hits (33%); baseRate = 4/6 ≈ 0.67
    // a excess = 0.33; b excess = negative → only a appears
    const aMeals = [
      makeEntry({ type: 'meal', tagsJson: '["a"]', loggedAt: T }),
      makeEntry({ type: 'meal', tagsJson: '["a"]', loggedAt: T + 2 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["a"]', loggedAt: T + 4 * HOUR }),
    ];
    const bMeals = [
      makeEntry({ type: 'meal', tagsJson: '["b"]', loggedAt: T + 10 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["b"]', loggedAt: T + 12 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["b"]', loggedAt: T + 14 * HOUR }),
    ];
    const outcomes = [
      makeEntry({ type: 'symptom', severity: 3, loggedAt: T + HOUR }),
      makeEntry({ type: 'symptom', severity: 3, loggedAt: T + 3 * HOUR }),
      makeEntry({ type: 'symptom', severity: 3, loggedAt: T + 5 * HOUR }),
      makeEntry({ type: 'symptom', severity: 3, loggedAt: T + 11 * HOUR }),
    ];

    const findings = analyzeTemporalTriggers([...aMeals, ...bMeals, ...outcomes], {
      windowMs: 2 * HOUR,
      minMeals: 3,
    });

    // baseRate = 4/6 ≈ 0.67; a hitRate = 1.0 > 0.67 (appears); b hitRate = 1/3 < 0.67 (excluded)
    expect(findings).toHaveLength(1);
    expect(findings[0].tag).toBe('a');
  });
});
