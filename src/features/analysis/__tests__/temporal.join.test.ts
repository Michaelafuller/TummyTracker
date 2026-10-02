import type { LogEntry } from '@/db/schema';
import { isOutcome, mealsFollowedByOutcome } from '../temporal';

let seq = 0;
function makeEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: `j${seq++}`,
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
const WINDOW = 24 * HOUR;

/** Seeded PRNG (mulberry32) — tests never use Math.random. */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The pre-optimisation rule, verbatim: O(meals x outcomes). */
function naive(
  entries: readonly LogEntry[],
  meals: readonly LogEntry[],
  windowMs: number,
): Map<string, boolean> {
  const outcomes = entries.filter(isOutcome);
  return new Map(
    meals.map((m) => [
      m.id,
      outcomes.some((o) => o.loggedAt > m.loggedAt && o.loggedAt <= m.loggedAt + windowMs),
    ]),
  );
}

const bm = (loggedAt: number) => makeEntry({ type: 'bowel_movement', bristolScale: 7, loggedAt });
const meal = (loggedAt: number) => makeEntry({ loggedAt });

describe('mealsFollowedByOutcome (binary-search join)', () => {
  it('matches the naive reference on seeded random journals', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const rand = prng(seed);
      const entries: LogEntry[] = [];
      const count = 20 + Math.floor(rand() * 80);
      for (let i = 0; i < count; i++) {
        // Coarse times so ties and exact-boundary hits actually occur.
        const t = Math.floor(rand() * 60) * 6 * HOUR;
        entries.push(rand() < 0.3 ? bm(t) : meal(t));
      }
      const meals = entries.filter((e) => e.type === 'meal');
      for (const windowMs of [WINDOW, 48 * HOUR, 6 * HOUR]) {
        expect(mealsFollowedByOutcome(entries, meals, windowMs)).toEqual(
          naive(entries, meals, windowMs),
        );
      }
    }
  });

  it('counts an outcome at exactly +windowMs', () => {
    const m = meal(1000);
    const result = mealsFollowedByOutcome([m, bm(1000 + WINDOW)], [m], WINDOW);
    expect(result.get(m.id)).toBe(true);
  });

  it('does not count an outcome at +windowMs + 1', () => {
    const m = meal(1000);
    const result = mealsFollowedByOutcome([m, bm(1000 + WINDOW + 1)], [m], WINDOW);
    expect(result.get(m.id)).toBe(false);
  });

  it('does not count an outcome at the same ms as the meal', () => {
    const m = meal(5000);
    expect(mealsFollowedByOutcome([m, bm(5000)], [m], WINDOW).get(m.id)).toBe(false);
  });

  it('counts an outcome 1 ms after the meal', () => {
    const m = meal(5000);
    expect(mealsFollowedByOutcome([m, bm(5001)], [m], WINDOW).get(m.id)).toBe(true);
  });

  it('handles several outcomes, only one in the window', () => {
    const m = meal(10 * HOUR);
    const entries = [m, bm(0), bm(10 * HOUR), bm(40 * HOUR), bm(60 * HOUR)];
    expect(mealsFollowedByOutcome(entries, [m], WINDOW).get(m.id)).toBe(false);
    const withHit = [...entries, bm(20 * HOUR)];
    expect(mealsFollowedByOutcome(withHit, [m], WINDOW).get(m.id)).toBe(true);
  });

  it('is false for every meal when there are no outcomes, and empty for no meals', () => {
    const meals = [meal(0), meal(HOUR)];
    const result = mealsFollowedByOutcome(meals, meals, WINDOW);
    expect([...result.values()]).toEqual([false, false]);
    expect(mealsFollowedByOutcome(meals, [], WINDOW).size).toBe(0);
  });
});
