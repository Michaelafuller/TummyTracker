import type { LogEntry, SavedMeal, SavedMealComponent } from '@/db/schema';
import {
  backfillTargets,
  ingredientTagsOf,
  groupSavedMeals,
  orderSavedMealsForSlot,
  savedMealNameKey,
  savedMealSlug,
  savedMealToDrafts,
  slotForHour,
  validateSavedMealName,
  type SavedMealWithComponents,
} from '../savedMeals';

function entry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: 'e',
    type: 'meal',
    mealSlot: null,
    name: 'Oatmeal',
    barcode: null,
    loggedAt: 1,
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
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function component(overrides: Partial<SavedMealComponent>): SavedMealComponent {
  return {
    id: 'c',
    savedMealId: 'm',
    name: 'Oats',
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
    createdAt: 1,
    ...overrides,
  };
}

describe('savedMealNameKey', () => {
  it('trims and lowercases', () => {
    expect(savedMealNameKey('  Chicken Rice  ')).toBe('chicken rice');
  });
});

describe('savedMealSlug', () => {
  it('lowercases and hyphenates', () => {
    expect(savedMealSlug(' Chicken Rice! ')).toBe('chicken-rice-');
    expect(savedMealSlug('Oatmeal')).toBe('oatmeal');
    expect(savedMealSlug('   ')).toBe('untitled');
  });
});

describe('savedMealToDrafts', () => {
  it('sorts by sortOrder, renumbers, and drops id / savedMealId / createdAt', () => {
    const drafts = savedMealToDrafts([
      component({ id: 'b', name: 'Milk', sortOrder: 5, servings: 2, calories: 80, tagsJson: '["milk"]' }),
      component({ id: 'a', name: 'Oats', sortOrder: 1 }),
    ]);
    expect(drafts.map((d) => d.name)).toEqual(['Oats', 'Milk']);
    expect(drafts.map((d) => d.sortOrder)).toEqual([0, 1]);
    expect(drafts[1]).toMatchObject({ servings: 2, calories: 80, tagsJson: '["milk"]' });
    for (const draft of drafts) {
      expect(draft).not.toHaveProperty('id');
      expect(draft).not.toHaveProperty('savedMealId');
      expect(draft).not.toHaveProperty('createdAt');
    }
  });

  it('does not mutate its input', () => {
    const input = [component({ name: 'B', sortOrder: 2 }), component({ name: 'A', sortOrder: 1 })];
    savedMealToDrafts(input);
    expect(input.map((c) => c.name)).toEqual(['B', 'A']);
  });

  it('returns [] for none', () => {
    expect(savedMealToDrafts([])).toEqual([]);
  });
});

describe('backfillTargets', () => {
  const key = 'oatmeal';

  it('matches by trimmed, case-insensitive name', () => {
    const entries = [
      entry({ id: '1', name: 'Oatmeal' }),
      entry({ id: '2', name: '  OATMEAL ' }),
      entry({ id: '3', name: 'Oatmeal bar' }),
    ];
    expect(backfillTargets(entries, key).map((e) => e.id)).toEqual(['1', '2']);
  });

  it('includes snacks', () => {
    expect(backfillTargets([entry({ id: 's', type: 'snack', name: 'Oatmeal' })], key)).toHaveLength(1);
  });

  it('excludes bowel movements and symptoms even with a matching name', () => {
    const entries = [
      entry({ id: 'b', type: 'bowel_movement', name: 'Oatmeal' }),
      entry({ id: 's', type: 'symptom', name: 'Oatmeal' }),
    ];
    expect(backfillTargets(entries, key)).toEqual([]);
  });

  it('excludes an entry that already has any tag', () => {
    const entries = [
      entry({ id: 'tagged', tagsJson: '["oats"]' }),
      entry({ id: 'empty-array', tagsJson: '[]' }),
      entry({ id: 'garbage', tagsJson: 'not json' }),
    ];
    expect(backfillTargets(entries, key).map((e) => e.id)).toEqual(['empty-array', 'garbage']);
  });

  it('returns nothing when no entry has that name', () => {
    expect(backfillTargets([entry({ name: 'Toast' })], key)).toEqual([]);
  });

  // Review 2026-09-30: every builder-logged meal's tags include its items' names.
  it('treats tags that are only the entry name or its item names as "no ingredients"', () => {
    const names = new Map([
      ['items', ['Oats', 'Milk']],
      ['ingredient', ['Oats']],
    ]);
    const entries = [
      entry({ id: 'own-name', tagsJson: '["oatmeal"]' }),
      entry({ id: 'items', tagsJson: '["oats","milk"]' }),
      entry({ id: 'ingredient', tagsJson: '["oats","gluten"]' }),
    ];
    expect(backfillTargets(entries, key, names).map((e) => e.id)).toEqual(['own-name', 'items']);
  });
});

describe('ingredientTagsOf', () => {
  it("unions the items' own tags, never their names", () => {
    expect(
      ingredientTagsOf([
        { tagsJson: '["oats","gluten"]' },
        { tagsJson: null },
        { tagsJson: '["gluten","milk"]' },
      ]),
    ).toEqual(['oats', 'gluten', 'milk']);
    expect(ingredientTagsOf([{ tagsJson: null }, { tagsJson: '[]' }])).toEqual([]);
  });
});

describe('validateSavedMealName', () => {
  it('requires a non-blank name', () => {
    expect(validateSavedMealName('')).toBe('Name is required.');
    expect(validateSavedMealName('   ')).toBe('Name is required.');
    expect(validateSavedMealName(' Oatmeal ')).toBeNull();
  });
});

describe('groupSavedMeals', () => {
  const meal = (id: string, name: string): SavedMeal => ({
    id,
    name,
    nameKey: name.trim().toLowerCase(),
    type: 'meal',
    mealSlot: null,
    createdAt: 1,
    updatedAt: 1,
  });

  it('sorts meals A-Z case-insensitively and each meal\'s items by sortOrder', () => {
    const grouped = groupSavedMeals(
      [meal('b', 'banana smoothie'), meal('a', 'Apple pie'), meal('c', 'Cereal')],
      [
        component({ id: '1', savedMealId: 'a', name: 'second', sortOrder: 1 }),
        component({ id: '2', savedMealId: 'a', name: 'first', sortOrder: 0 }),
        component({ id: '3', savedMealId: 'c', name: 'only' }),
      ],
    );
    expect(grouped.map((g) => g.meal.name)).toEqual(['Apple pie', 'banana smoothie', 'Cereal']);
    expect(grouped[0].components.map((c) => c.name)).toEqual(['first', 'second']);
    expect(grouped[1].components).toEqual([]);
    expect(grouped[2].components.map((c) => c.name)).toEqual(['only']);
  });

  it('ignores components of unknown meals and does not mutate its input', () => {
    const meals = [meal('b', 'B'), meal('a', 'A')];
    const grouped = groupSavedMeals(meals, [component({ savedMealId: 'ghost' })]);
    expect(grouped.map((g) => g.components.length)).toEqual([0, 0]);
    expect(meals.map((m) => m.id)).toEqual(['b', 'a']);
  });
});

describe('slotForHour (GitHub #26)', () => {
  it.each([
    [0, null],
    [4, null],
    [5, 'breakfast'],
    [10, 'breakfast'],
    [11, 'lunch'],
    [15, 'lunch'],
    [16, 'dinner'],
    [21, 'dinner'],
    [22, null],
    [23, null],
  ])('hour %i -> %s', (hour, slot) => {
    expect(slotForHour(hour)).toBe(slot);
  });

  it('maps the minute boundaries via the integer hour (04:59 none, 05:00 breakfast, 10:59 breakfast, 11:00 lunch, 15:59 lunch, 16:00 dinner, 21:59 dinner, 22:00 none)', () => {
    const hourOf = (h: number, m: number) => new Date(2026, 8, 30, h, m).getHours();
    expect([hourOf(4, 59), hourOf(5, 0), hourOf(10, 59), hourOf(11, 0)].map(slotForHour)).toEqual([
      null,
      'breakfast',
      'breakfast',
      'lunch',
    ]);
    expect([hourOf(15, 59), hourOf(16, 0), hourOf(21, 59), hourOf(22, 0)].map(slotForHour)).toEqual([
      'lunch',
      'dinner',
      'dinner',
      null,
    ]);
  });
});

describe('orderSavedMealsForSlot (GitHub #26)', () => {
  const item = (name: string, mealSlot: SavedMeal['mealSlot']): SavedMealWithComponents => ({
    meal: { id: name, name, nameKey: name.toLowerCase(), type: 'meal', mealSlot, createdAt: 1, updatedAt: 1 },
    components: [],
  });
  const items = [
    item('Apple', 'dinner'),
    item('Bagel', 'breakfast'),
    item('Cereal', 'breakfast'),
    item('Daal', null),
    item('Eggs', 'lunch'),
  ];

  it('puts meals saved with the slot first (A-Z), then the rest (A-Z)', () => {
    expect(orderSavedMealsForSlot(items, 'breakfast').map((i) => i.meal.name)).toEqual([
      'Bagel',
      'Cereal',
      'Apple',
      'Daal',
      'Eggs',
    ]);
    expect(orderSavedMealsForSlot(items, 'dinner').map((i) => i.meal.name)).toEqual([
      'Apple',
      'Bagel',
      'Cereal',
      'Daal',
      'Eggs',
    ]);
  });

  it('leaves the list unchanged with no slot, and does not mutate its input', () => {
    const before = items.map((i) => i.meal.name);
    expect(orderSavedMealsForSlot(items, null).map((i) => i.meal.name)).toEqual(before);
    orderSavedMealsForSlot(items, 'lunch');
    expect(items.map((i) => i.meal.name)).toEqual(before);
  });

  it('still sorts A-Z within each group when the input was not sorted', () => {
    const shuffled = [items[4], items[2], items[0], items[1]];
    expect(orderSavedMealsForSlot(shuffled, 'breakfast').map((i) => i.meal.name)).toEqual([
      'Bagel',
      'Cereal',
      'Apple',
      'Eggs',
    ]);
  });
});
