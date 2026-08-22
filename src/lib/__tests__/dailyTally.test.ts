import type { LogEntry } from '@/db/schema';
import { nutrientContributions, tallyDailyNutrition } from '../dailyTally';
import { dayBounds, formatDateInput } from '../datetime';

let seq = 0;

const BASE: Omit<LogEntry, 'id' | 'type' | 'loggedAt'> = {
  mealSlot: null,
  name: 'Food',
  barcode: null,
  sentiment: null,
  bristolScale: null,
  symptomType: null,
  severity: null,
  notes: null,
  ingredientsText: null,
  tagsJson: null,
  servingG: null,
  calories: null,
  fatG: null,
  saturatedFatG: null,
  carbsG: null,
  proteinG: null,
  fiberG: null,
  sugarG: null,
  sodiumMg: null,
  componentCount: null,
  createdAt: 0,
  updatedAt: 0,
};

function entry(overrides: Partial<LogEntry> & { type: LogEntry['type']; loggedAt: number }): LogEntry {
  return { ...BASE, id: `e${seq++}`, ...overrides };
}

describe('dayBounds', () => {
  it('start is local midnight and start <= input < end', () => {
    const input = new Date(2026, 5, 27, 13, 45, 30).getTime();
    const { start, end } = dayBounds(input);
    expect(start).toBeLessThanOrEqual(input);
    expect(input).toBeLessThan(end);
    const startDate = new Date(start);
    expect(startDate.getHours()).toBe(0);
    expect(startDate.getMinutes()).toBe(0);
    expect(startDate.getSeconds()).toBe(0);
    expect(startDate.getMilliseconds()).toBe(0);
    expect(formatDateInput(start)).toBe('2026-06-27');
  });

  it('end is the following local midnight', () => {
    const input = new Date(2026, 0, 3, 0, 0, 0, 1).getTime();
    const { start, end } = dayBounds(input);
    expect(formatDateInput(end)).toBe('2026-01-04');
    expect(new Date(end).getHours()).toBe(0);
    // A day is ~24h; allow for DST-shifted 23h/25h days.
    expect(end - start).toBeGreaterThan(22 * 60 * 60 * 1000);
    expect(end - start).toBeLessThan(26 * 60 * 60 * 1000);
  });
});

describe('tallyDailyNutrition', () => {
  it('returns zero entries and all-null totals for an empty entry list', () => {
    const { start, end } = dayBounds(Date.now());
    const tally = tallyDailyNutrition([], start, end);
    expect(tally.entryCount).toBe(0);
    for (const field of Object.keys(tally.nutrients) as (keyof typeof tally.nutrients)[]) {
      expect(tally.nutrients[field]).toEqual({ total: null, loggedCount: 0, missingCount: 0 });
    }
  });

  it('excludes non-food rows (bowel_movement, symptom)', () => {
    const start = 1000;
    const end = 2000;
    const entries = [
      entry({ type: 'meal', loggedAt: 1500, calories: 100 }),
      entry({ type: 'bowel_movement', loggedAt: 1500, bristolScale: 4 }),
      entry({ type: 'symptom', loggedAt: 1500, symptomType: 'bloating', severity: 3 }),
    ];
    const tally = tallyDailyNutrition(entries, start, end);
    expect(tally.entryCount).toBe(1);
    expect(tally.nutrients.calories.total).toBe(100);
  });

  it('includes an entry at exactly start, excludes one at exactly end', () => {
    const start = 1000;
    const end = 2000;
    const entries = [
      entry({ type: 'meal', loggedAt: start, calories: 10 }),
      entry({ type: 'snack', loggedAt: end, calories: 20 }),
    ];
    const tally = tallyDailyNutrition(entries, start, end);
    expect(tally.entryCount).toBe(1);
    expect(tally.nutrients.calories.total).toBe(10);
  });

  it('distinguishes a logged 0 from a missing value', () => {
    const start = 0;
    const end = 100;
    const entries = [
      entry({ type: 'meal', loggedAt: 10, fatG: 0 }),
      entry({ type: 'meal', loggedAt: 20, fatG: 5 }),
      entry({ type: 'meal', loggedAt: 30, fatG: null }),
    ];
    const tally = tallyDailyNutrition(entries, start, end);
    expect(tally.nutrients.fatG.total).toBe(5); // 0 + 5, not skipped
    expect(tally.nutrients.fatG.loggedCount).toBe(2);
    expect(tally.nutrients.fatG.missingCount).toBe(1);
  });

  it('reports total: null (not 0) when every in-range entry is missing a nutrient', () => {
    const start = 0;
    const end = 100;
    const entries = [
      entry({ type: 'meal', loggedAt: 10, proteinG: null }),
      entry({ type: 'snack', loggedAt: 20, proteinG: null }),
    ];
    const tally = tallyDailyNutrition(entries, start, end);
    expect(tally.nutrients.proteinG.total).toBeNull();
    expect(tally.nutrients.proteinG.loggedCount).toBe(0);
    expect(tally.nutrients.proteinG.missingCount).toBe(2);
  });

  it('rounds calories/sodium to 0 decimals and gram fields to 1', () => {
    const start = 0;
    const end = 100;
    const entries = [
      entry({ type: 'meal', loggedAt: 10, calories: 100.4, sodiumMg: 200.6, fatG: 1.11, proteinG: 2.25 }),
      entry({ type: 'meal', loggedAt: 20, calories: 50.4, sodiumMg: 50.1, fatG: 1.14, proteinG: 2.25 }),
    ];
    const tally = tallyDailyNutrition(entries, start, end);
    expect(tally.nutrients.calories.total).toBe(151); // 150.8 -> 151
    expect(tally.nutrients.sodiumMg.total).toBe(251); // 250.7 -> 251
    expect(tally.nutrients.fatG.total).toBe(2.3); // 2.25 -> 2.3 (round-half-up)
    expect(tally.nutrients.proteinG.total).toBe(4.5);
  });

  it('excludes entries outside the range even when they are food type', () => {
    const start = 1000;
    const end = 2000;
    const entries = [
      entry({ type: 'meal', loggedAt: 500, calories: 10 }),
      entry({ type: 'meal', loggedAt: 2500, calories: 20 }),
      entry({ type: 'meal', loggedAt: 1500, calories: 30 }),
    ];
    const tally = tallyDailyNutrition(entries, start, end);
    expect(tally.entryCount).toBe(1);
    expect(tally.nutrients.calories.total).toBe(30);
  });
});

describe('nutrientContributions', () => {
  it('sorts contributors by value desc, tiebreaking by loggedAt asc, and splits out missing in time order', () => {
    const start = 0;
    const end = 1000;
    const entries = [
      entry({ type: 'meal', loggedAt: 100, name: 'Burger', fatG: 30 }),
      entry({ type: 'meal', loggedAt: 50, name: 'Salad', fatG: 5 }),
      entry({ type: 'meal', loggedAt: 200, name: 'Chips', fatG: 30 }), // ties Burger's value
      entry({ type: 'meal', loggedAt: 300, name: 'Tea', fatG: null }),
      entry({ type: 'meal', loggedAt: 10, name: 'Water', fatG: null }),
    ];
    const result = nutrientContributions(entries, 'fatG', start, end);
    expect(result.contributors.map((c) => c.name)).toEqual(['Burger', 'Chips', 'Salad']);
    expect(result.contributors.map((c) => c.value)).toEqual([30, 30, 5]);
    expect(result.missing.map((m) => m.name)).toEqual(['Water', 'Tea']);
  });

  it('excludes non-food and out-of-range entries', () => {
    const start = 1000;
    const end = 2000;
    const entries = [
      entry({ type: 'meal', loggedAt: 1500, name: 'In range', calories: 100 }),
      entry({ type: 'bowel_movement', loggedAt: 1500, bristolScale: 4 }),
      entry({ type: 'meal', loggedAt: 500, name: 'Too early', calories: 200 }),
      entry({ type: 'meal', loggedAt: 2500, name: 'Too late', calories: 300 }),
    ];
    const result = nutrientContributions(entries, 'calories', start, end);
    expect(result.contributors).toHaveLength(1);
    expect(result.contributors[0].name).toBe('In range');
    expect(result.missing).toHaveLength(0);
  });

  it('a logged 0 counts as a contributor, not missing', () => {
    const start = 0;
    const end = 100;
    const entries = [entry({ type: 'meal', loggedAt: 10, name: 'Zero fat', fatG: 0 })];
    const result = nutrientContributions(entries, 'fatG', start, end);
    expect(result.contributors).toEqual([
      { id: entries[0].id, name: 'Zero fat', loggedAt: 10, mealSlot: null, value: 0 },
    ]);
    expect(result.missing).toHaveLength(0);
  });

  it('invariant: contributor values sum to the tally total, and counts add up to entryCount', () => {
    const start = 0;
    const end = 1000;
    const entries = [
      entry({ type: 'meal', loggedAt: 10, name: 'A', proteinG: 12.34 }),
      entry({ type: 'snack', loggedAt: 20, name: 'B', proteinG: 5.6 }),
      entry({ type: 'meal', loggedAt: 30, name: 'C', proteinG: null }),
      entry({ type: 'meal', loggedAt: 40, name: 'D', proteinG: 0 }),
    ];
    const tally = tallyDailyNutrition(entries, start, end);
    const result = nutrientContributions(entries, 'proteinG', start, end);
    const sum = result.contributors.reduce((acc, c) => acc + c.value, 0);
    expect(sum).toBeCloseTo(tally.nutrients.proteinG.total ?? 0);
    expect(result.contributors.length + result.missing.length).toBe(tally.entryCount);
  });
});
