import type { LogEntry } from '@/db/schema';
import { parseTagsJson } from '@/lib/ingredients';
import {
  analyzeOutcomeRates,
  analyzeTemporalTriggers,
  DEFAULT_MIN_MEALS,
  DEFAULT_WINDOW_MS,
  isOutcome,
  MAX_LOW_CONFIDENCE_FINDINGS,
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
    // lactose: hits=3/3=1.0; baseRate=3/6=0.5 → excess.
    // Wilson lower bound for 3/3 ≈ 0.438 (hand-verified), below baseRate 0.5 → not
    // "high". meals=3 < MEDIUM_CONFIDENCE_MIN_MEALS (5) → not "medium" either → "low".
    expect(findings[0]).toMatchObject({
      tag: 'lactose',
      meals: 3,
      hits: 3,
      hitRate: 1,
      baseRate: 0.5,
      confidence: 'low',
    });
  });

  it('labels a finding "high" confidence when the Wilson lower bound clears the base rate', () => {
    // 9/10 lactose meals hit; 1/10 control meals hit -> baseRate = 10/20 = 0.5.
    // Meal blocks are spaced 20h apart (windowMs 2h) so windows never cross
    // between meals of the same tag or between tags.
    // Wilson lower bound for 9/10 ≈ 0.596 (hand-verified) clears baseRate 0.5 → high.
    const GAP = 20 * HOUR;
    const lactoseMeals = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: T + i * GAP }),
    );
    const controlMeals = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ type: 'meal', tagsJson: '["rice"]', loggedAt: T + 1000 * HOUR + i * GAP }),
    );
    const outcomes = [
      ...Array.from({ length: 9 }, (_, i) => makeEntry({ type: 'symptom', severity: 4, loggedAt: T + i * GAP + HOUR })),
      makeEntry({ type: 'symptom', severity: 4, loggedAt: T + 1000 * HOUR + HOUR }), // 1 of 10 control hits
    ];

    const findings = analyzeTemporalTriggers([...lactoseMeals, ...controlMeals, ...outcomes], {
      windowMs: 2 * HOUR,
      minMeals: 3,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      tag: 'lactose',
      meals: 10,
      hits: 9,
      hitRate: 0.9,
      baseRate: 0.5,
      confidence: 'high',
    });
  });

  it('labels a finding "medium" confidence when the raw rate clears the margin but Wilson does not, with enough meals', () => {
    // 3/5 lactose meals hit (hitRate 0.6), baseRate 0.4 (4/10 total tagged meals hit).
    // hitRate(0.6) >= baseRate(0.4) + 0.15 (0.55) and meals=5 >= 5 → medium candidate.
    // Wilson lower bound for 3/5 ≈ 0.231 (hand-verified), well below baseRate 0.4 → not high.
    const lactoseMeals = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: T + i * 10 * HOUR }),
    );
    const controlMeals = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ type: 'meal', tagsJson: '["rice"]', loggedAt: T + i * 10 * HOUR + 5 * HOUR }),
    );
    // 3 of 5 lactose meals hit; 1 of 5 rice meals hits -> total 4/10 = 0.4 baseRate.
    const outcomes = [
      makeEntry({ type: 'symptom', severity: 4, loggedAt: T + 0 * 10 * HOUR + HOUR }),
      makeEntry({ type: 'symptom', severity: 4, loggedAt: T + 1 * 10 * HOUR + HOUR }),
      makeEntry({ type: 'symptom', severity: 4, loggedAt: T + 2 * 10 * HOUR + HOUR }),
      makeEntry({ type: 'symptom', severity: 4, loggedAt: T + 0 * 10 * HOUR + 6 * HOUR }),
    ];

    const findings = analyzeTemporalTriggers([...lactoseMeals, ...controlMeals, ...outcomes], {
      windowMs: 2 * HOUR,
      minMeals: 3,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      tag: 'lactose',
      meals: 5,
      hits: 3,
      hitRate: 0.6,
      baseRate: 0.4,
      confidence: 'medium',
    });
  });

  it('caps low-confidence-only results at MAX_LOW_CONFIDENCE_FINDINGS', () => {
    // Five independent tags, each with just 3 meals (too few for medium/high),
    // each showing excess risk over a shared low baseline. All findings are "low".
    const entries: LogEntry[] = [];
    const tags = ['a', 'b', 'c', 'd', 'e'];
    for (const tag of tags) {
      for (let i = 0; i < 3; i++) {
        const loggedAt = T + (tags.indexOf(tag) * 3 + i) * 10 * HOUR;
        entries.push(makeEntry({ type: 'meal', tagsJson: `["${tag}"]`, loggedAt }));
        entries.push(makeEntry({ type: 'symptom', severity: 4, loggedAt: loggedAt + HOUR }));
      }
    }
    // A control tag with meals that are never followed by an outcome, to keep
    // baseRate below 1.0 so the tagged meals above show "excess" risk.
    for (let i = 0; i < 3; i++) {
      entries.push(makeEntry({ type: 'meal', tagsJson: '["control"]', loggedAt: T + 1000 * HOUR + i * 10 * HOUR }));
    }

    const findings = analyzeTemporalTriggers(entries, { windowMs: 2 * HOUR, minMeals: 3 });

    expect(findings.length).toBeLessThanOrEqual(MAX_LOW_CONFIDENCE_FINDINGS);
    expect(findings.every((f) => f.confidence === 'low')).toBe(true);
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

describe('analyzeOutcomeRates', () => {
  const byName = (meal: LogEntry) => [{ key: meal.name.trim().toLowerCase(), label: meal.name }];

  it('groups by the keysOf-provided key and keeps the first-seen label', () => {
    // Same fixture shape as the analyzeTemporalTriggers "low" test above, but
    // grouped by (case-insensitive) name instead of tag.
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
    // Same shape as the analyzeTemporalTriggers "high" test above, grouped by name.
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
    // clear DEFAULT_MIN_MEALS in analyzeTemporalTriggers/analyzeOutcomeRates.
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
