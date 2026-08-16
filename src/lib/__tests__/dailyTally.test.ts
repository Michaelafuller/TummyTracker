import type { LogEntry } from '@/db/schema';
import { tallyDailyNutrition } from '../dailyTally';
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
