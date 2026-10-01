import type { LogEntry, MealComponent } from '@/db/schema';
import { findingInstances } from '../drilldown';
import {
  DOSE_RATE_MARGIN,
  MIN_DOSE_GROUP,
  doseLine,
  doseRows,
  doseSplit,
  formatServings,
  groupComponentsByEntry,
  mealAmount,
  type DoseSplit,
} from '../doseResponse';
import { MIN_GROUP_SIZE } from '../insights';

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

function makeComponent(entryId: string, overrides: Partial<MealComponent>): MealComponent {
  return {
    id: `c${seq++}`,
    entryId,
    name: 'Item',
    barcode: null,
    servings: 1,
    servingG: null,
    calories: null,
    fatG: null,
    saturatedFatG: null,
    carbsG: null,
    proteinG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    ingredientsText: null,
    tagsJson: null,
    sortOrder: 0,
    createdAt: 0,
    ...overrides,
  };
}

const HOUR = 60 * 60 * 1000;
const T = 1000 * HOUR;

beforeEach(() => {
  seq = 0;
});

describe('constants', () => {
  it('reuses the nutrient-split group floor', () => {
    expect(MIN_DOSE_GROUP).toBe(MIN_GROUP_SIZE);
    expect(DOSE_RATE_MARGIN).toBe(0.2);
  });
});

describe('mealAmount', () => {
  const entry = makeEntry({ id: 'm', tagsJson: '["onion","dairy"]' });

  it('food: no components counts as 1 serving', () => {
    expect(mealAmount(entry, [], 'food', 'Food')).toBe(1);
  });

  it('food: sums the servings of every component, fractions included', () => {
    const components = [
      makeComponent('m', { servings: 1.5 }),
      makeComponent('m', { servings: 2 }),
      makeComponent('m', { servings: 0.5 }),
    ];
    expect(mealAmount(entry, components, 'food', 'Food')).toBe(4);
  });

  it('a missing servings value counts as 1', () => {
    // reason: simulates a legacy row where the stored value is null at runtime
    const nullServings = makeComponent('m', { servings: null as unknown as number });
    expect(mealAmount(entry, [nullServings, makeComponent('m', { servings: 2 })], 'food', 'Food')).toBe(3);
  });

  it('tag: sums only the components whose own tags include the tag', () => {
    const components = [
      makeComponent('m', { servings: 2, tagsJson: '["onion"]' }),
      makeComponent('m', { servings: 1.5, tagsJson: '["onion","garlic"]' }),
      makeComponent('m', { servings: 4, tagsJson: '["rice"]' }),
      makeComponent('m', { servings: 3, tagsJson: null }),
    ];
    expect(mealAmount(entry, components, 'tag', 'onion')).toBe(3.5);
  });

  it('tag: matches the exact tag, no prefix bleed', () => {
    const components = [makeComponent('m', { servings: 3, tagsJson: '["onion powder"]' })];
    expect(mealAmount(entry, components, 'tag', 'onion')).toBe(1);
  });

  it('tag: no components counts as 1', () => {
    expect(mealAmount(entry, [], 'tag', 'onion')).toBe(1);
  });

  it('tag: components exist but none carries the tag (legacy rows) counts as 1', () => {
    const components = [makeComponent('m', { servings: 5, tagsJson: '["rice"]' })];
    expect(mealAmount(entry, components, 'tag', 'onion')).toBe(1);
  });
});

describe('groupComponentsByEntry', () => {
  it('groups rows by their parent entry id', () => {
    const grouped = groupComponentsByEntry([
      makeComponent('a', {}),
      makeComponent('b', {}),
      makeComponent('a', {}),
    ]);
    expect(grouped.get('a')).toHaveLength(2);
    expect(grouped.get('b')).toHaveLength(1);
    expect(grouped.get('z')).toBeUndefined();
  });
});

type Pair = [amount: number, followedByOutcome: boolean];

/** Instances with the given [amount, followedByOutcome] pairs; the amount rides in `calories`. */
function instancesOf(pairs: Pair[]) {
  return pairs.map(([amount, followedByOutcome]) => ({
    entry: makeEntry({ calories: amount }),
    followedByOutcome,
  }));
}
const amountOf = (entry: LogEntry) => entry.calories ?? 1;

const times = (n: number, pair: Pair): Pair[] => Array.from({ length: n }, () => pair);

describe('doseSplit', () => {
  it('is null when every meal has the same amount', () => {
    expect(doseSplit(instancesOf(times(10, [1, true])), amountOf)).toBeNull();
  });

  it('is null when a side has fewer than MIN_DOSE_GROUP meals', () => {
    const pairs = [...times(7, [1, false]), ...times(3, [2, true])];
    expect(doseSplit(instancesOf(pairs), amountOf)).toBeNull();
  });

  it('is null with too few meals overall', () => {
    expect(doseSplit(instancesOf(times(3, [1, true])), amountOf)).toBeNull();
    expect(doseSplit([], amountOf)).toBeNull();
  });

  it('splits at the median (odd count): smaller is <= threshold, larger is > threshold', () => {
    // 13 meals, sorted[6] = 2
    const pairs = [...times(5, [1, false]), ...times(4, [2, false]), ...times(4, [3, true])];
    const split = doseSplit(instancesOf(pairs), amountOf);
    expect(split).not.toBeNull();
    expect(split!.threshold).toBe(2);
    expect(split!.smaller).toEqual({ meals: 9, hits: 0, rate: 0 });
    expect(split!.larger).toEqual({ meals: 4, hits: 4, rate: 1 });
    expect(split!.clearIncrease).toBe(true);
  });

  it('snaps an even-count median (1.5 here) to an amount actually eaten (1), same split', () => {
    const pairs = [...times(4, [1, false]), ...times(4, [2, true])];
    const split = doseSplit(instancesOf(pairs), amountOf);
    expect(split!.threshold).toBe(1);
    expect(split!.smaller.meals).toBe(4);
    expect(split!.larger.meals).toBe(4);
  });

  it('steps the threshold down when the median equals the largest amount', () => {
    // 1 x4, 2 x5 -> median 2 == max, so the threshold becomes 1
    const pairs = [...times(4, [1, false]), ...times(5, [2, true])];
    const split = doseSplit(instancesOf(pairs), amountOf);
    expect(split!.threshold).toBe(1);
    expect(split!.smaller.meals).toBe(4);
    expect(split!.larger.meals).toBe(5);
  });

  it('counts a meal at exactly the threshold as smaller', () => {
    // sorted: 1 x4, 1.5 x2, 2 x4 -> middle values 1.5 and 1.5
    const pairs = [...times(4, [1, false]), ...times(2, [1.5, true]), ...times(4, [2, true])];
    const split = doseSplit(instancesOf(pairs), amountOf);
    expect(split!.threshold).toBe(1.5);
    expect(split!.smaller.meals).toBe(6);
    expect(split!.larger.meals).toBe(4);
  });

  it('computes each side rate from hits / meals', () => {
    const pairs: Pair[] = [...times(5, [1, false]), [1, true], ...times(4, [2, true]), [2, false]];
    const split = doseSplit(instancesOf(pairs), amountOf)!;
    expect(split.threshold).toBe(1);
    expect(split.smaller).toEqual({ meals: 6, hits: 1, rate: 1 / 6 });
    expect(split.larger).toEqual({ meals: 5, hits: 4, rate: 4 / 5 });
  });

  it('flags a clear increase at exactly the margin, not below it', () => {
    // smaller 2 of 5 (0.4), larger 3 of 5 (0.6): the gap is exactly 0.2 (0.6 - 0.4 is inexact in floats)
    const atMargin = [
      ...times(2, [1, true]),
      ...times(3, [1, false]),
      ...times(3, [2, true]),
      ...times(2, [2, false]),
    ];
    expect(doseSplit(instancesOf(atMargin), amountOf)!.clearIncrease).toBe(true);

    // smaller 3 of 6 (0.5), larger 3 of 5 (0.6): gap 0.1
    const below = [
      ...times(3, [1, true]),
      ...times(3, [1, false]),
      ...times(3, [2, true]),
      ...times(2, [2, false]),
    ];
    expect(doseSplit(instancesOf(below), amountOf)!.clearIncrease).toBe(false);
  });

  it('does not flag a decrease', () => {
    const pairs = [...times(5, [1, true]), ...times(5, [2, false])];
    const split = doseSplit(instancesOf(pairs), amountOf)!;
    expect(split.larger.rate).toBeLessThan(split.smaller.rate);
    expect(split.clearIncrease).toBe(false);
  });
});

describe('formatServings', () => {
  it('uses singular for exactly 1 and trims decimals', () => {
    expect(formatServings(1)).toBe('1 serving');
    expect(formatServings(2)).toBe('2 servings');
    expect(formatServings(1.5)).toBe('1.5 servings');
    expect(formatServings(0.5)).toBe('0.5 servings');
  });
});

describe('doseLine and doseRows', () => {
  const split = (threshold: number): DoseSplit => ({
    threshold,
    smaller: { meals: 6, hits: 1, rate: 1 / 6 },
    larger: { meals: 5, hits: 4, rate: 4 / 5 },
    clearIncrease: true,
  });

  it('food wording, singular threshold', () => {
    expect(doseLine(split(1), 'food')).toBe('More than 1 serving: 4 of 5 (80%) · 1 or less: 1 of 6 (17%)');
  });

  it('ingredient wording adds "of foods with it"', () => {
    expect(doseLine(split(1), 'tag')).toBe(
      'More than 1 serving of foods with it: 4 of 5 (80%) · 1 or less: 1 of 6 (17%)',
    );
  });

  it('plural and decimal thresholds', () => {
    expect(doseLine(split(2), 'food')).toBe('More than 2 servings: 4 of 5 (80%) · 2 or less: 1 of 6 (17%)');
    expect(doseLine(split(1.5), 'food')).toBe('More than 1.5 servings: 4 of 5 (80%) · 1.5 or less: 1 of 6 (17%)');
    expect(doseLine(split(0.5), 'tag')).toBe(
      'More than 0.5 servings of foods with it: 4 of 5 (80%) · 0.5 or less: 1 of 6 (17%)',
    );
  });

  it('doseRows states the numbers with no verdict', () => {
    expect(doseRows(split(1))).toEqual({
      larger: 'More than 1 serving: 4 of 5 meals followed by a rough outcome (80%)',
      smaller: '1 serving or less: 1 of 6 meals followed by a rough outcome (17%)',
    });
  });

  it('doseRows singularises a one-meal group', () => {
    const one: DoseSplit = { ...split(1.5), smaller: { meals: 1, hits: 1, rate: 1 } };
    expect(doseRows(one).smaller).toBe('1.5 servings or less: 1 of 1 meal followed by a rough outcome (100%)');
  });
});

describe('worked example: fixture -> split -> card line', () => {
  it('Pasta: bigger portions were followed by a rough outcome more often', () => {
    // 11 Pasta meals 48 h apart. Six at 1 serving (one followed by a symptom),
    // five at 2 servings (four followed by a symptom 1 h later).
    const entries: LogEntry[] = [];
    const components: MealComponent[] = [];
    const amounts = [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2];
    const followed = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0];
    amounts.forEach((servings, i) => {
      const meal = makeEntry({ id: `pasta${i}`, name: 'Pasta', loggedAt: T + i * 48 * HOUR });
      entries.push(meal);
      components.push(makeComponent(meal.id, { servings }));
      if (followed[i]) {
        entries.push(
          makeEntry({
            id: `sym${i}`,
            type: 'symptom',
            name: 'Cramps',
            severity: 4,
            loggedAt: meal.loggedAt + HOUR,
          }),
        );
      }
    });

    const byEntry = groupComponentsByEntry(components);
    const instances = findingInstances(entries, 'food', 'Pasta');
    const split = doseSplit(instances, (entry) => mealAmount(entry, byEntry.get(entry.id) ?? [], 'food', 'Pasta'));

    expect(split).toEqual({
      threshold: 1,
      smaller: { meals: 6, hits: 1, rate: 1 / 6 },
      larger: { meals: 5, hits: 4, rate: 4 / 5 },
      clearIncrease: true,
    });
    expect(doseLine(split!, 'food')).toBe('More than 1 serving: 4 of 5 (80%) · 1 or less: 1 of 6 (17%)');
  });
});
