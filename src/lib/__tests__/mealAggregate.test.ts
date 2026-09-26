import type { LogEntry } from '@/db/schema';
import {
  aggregateComponents,
  defaultMealName,
  entryToComponentDrafts,
  mealIngredientsText,
  reaggregateEntryPatch,
  type MealComponent,
  type MealComponentDraft,
  unionComponentTags,
} from '../mealAggregate';

function draft(overrides: Partial<MealComponentDraft> & { name: string }): MealComponentDraft {
  return {
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
    ...overrides,
  };
}

function savedComponent(overrides: Partial<MealComponent> & { name: string }): MealComponent {
  return {
    id: 'c1',
    entryId: 'e1',
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

describe('aggregateComponents', () => {
  it('sums value × servings per field across components', () => {
    const components = [
      draft({ name: 'Peas', calories: 100, fatG: 1, servings: 2 }),
      draft({ name: 'Rice', calories: 200, fatG: 0.5, servings: 1 }),
    ];
    const result = aggregateComponents(components);
    expect(result.calories).toBe(400); // 100*2 + 200*1
    expect(result.fatG).toBe(2.5); // 1*2 + 0.5*1
  });

  it('leaves a field null when every component is missing it', () => {
    const components = [draft({ name: 'Peas' }), draft({ name: 'Rice' })];
    const result = aggregateComponents(components);
    expect(result.calories).toBeNull();
    expect(result.sodiumMg).toBeNull();
  });

  it('does not fabricate zero for a field only some components have', () => {
    const components = [draft({ name: 'Peas', calories: 100 }), draft({ name: 'Rice', calories: null })];
    const result = aggregateComponents(components);
    // Rice's missing calories contribute 0, not a null-poisoned aggregate.
    expect(result.calories).toBe(100);
  });

  it('rounds to 1 decimal place', () => {
    const components = [draft({ name: 'A', fatG: 1.111, servings: 3 })];
    expect(aggregateComponents(components).fatG).toBe(3.3);
  });

  it('handles an empty component list (all fields null)', () => {
    const result = aggregateComponents([]);
    for (const value of Object.values(result)) {
      expect(value).toBeNull();
    }
  });

  it('handles a single component with servings != 1', () => {
    const components = [draft({ name: 'Soup', calories: 150, servings: 0.5 })];
    expect(aggregateComponents(components).calories).toBe(75);
  });
});

describe('unionComponentTags', () => {
  it('unions parsed tags plus each normalized component name', () => {
    const components = [
      draft({ name: 'Cheddar Cheese', tagsJson: '["milk"]' }),
      draft({ name: 'Onion', tagsJson: null }),
    ];
    const tags = unionComponentTags(components);
    expect(tags).toEqual(['milk', 'cheddar cheese', 'onion']);
  });

  it('dedupes and preserves first-seen order', () => {
    const components = [
      draft({ name: 'Milk', tagsJson: '["milk","dairy"]' }),
      draft({ name: 'milk', tagsJson: '["dairy"]' }),
    ];
    expect(unionComponentTags(components)).toEqual(['milk', 'dairy']);
  });

  it('returns an empty array for no components', () => {
    expect(unionComponentTags([])).toEqual([]);
  });

  it('normalizes the component name (lowercase, trimmed, language-prefix stripped)', () => {
    const components = [draft({ name: '  Chicken Broth  ', tagsJson: null })];
    expect(unionComponentTags(components)).toEqual(['chicken broth']);
  });
});

describe('mealIngredientsText', () => {
  it('returns null for no components', () => {
    expect(mealIngredientsText([])).toBeNull();
  });

  it('keeps the full ingredient text for a single component that has one', () => {
    const components = [draft({ name: 'Tofu', ingredientsText: 'Tofu (water, soybeans, calcium sulfate)' })];
    expect(mealIngredientsText(components)).toBe('Tofu (water, soybeans, calcium sulfate)');
  });

  it('falls back to the name for a single component without ingredient text', () => {
    const components = [draft({ name: 'Tofu', ingredientsText: null })];
    expect(mealIngredientsText(components)).toBe('Tofu');
  });

  it('falls back to the name for a single component with blank ingredient text', () => {
    const components = [draft({ name: 'Tofu', ingredientsText: '   ' })];
    expect(mealIngredientsText(components)).toBe('Tofu');
  });

  it('condenses to the joined component names for multiple components', () => {
    const components = [
      draft({ name: 'Tofu', ingredientsText: 'Tofu (water, soybeans)' }),
      draft({ name: 'Eggs', ingredientsText: 'Eggs' }),
    ];
    expect(mealIngredientsText(components)).toBe('Tofu, Eggs');
  });
});

describe('reaggregateEntryPatch', () => {
  it('recomputes nutrition fresh so an edit that lowers a value lowers the total (not additive)', () => {
    const before = reaggregateEntryPatch([savedComponent({ name: 'Peas', fatG: 10 })], null);
    const after = reaggregateEntryPatch([savedComponent({ name: 'Peas', fatG: 3 })], null);
    expect(before.nutrition.fatG).toBe(10);
    expect(after.nutrition.fatG).toBe(3);
  });

  it('still applies the servings multiplier when aggregating', () => {
    const patch = reaggregateEntryPatch([savedComponent({ name: 'Peas', calories: 100, servings: 2 })], null);
    expect(patch.nutrition.calories).toBe(200);
  });

  it('additively merges tags — a tag the edited component no longer carries survives', () => {
    const components = [savedComponent({ name: 'Peas', tagsJson: null })];
    const existingEntryTagsJson = JSON.stringify(['shellfish']);
    const patch = reaggregateEntryPatch(components, existingEntryTagsJson);
    const tags = JSON.parse(patch.tagsJson as string) as string[];
    expect(tags).toEqual(['shellfish', 'peas']);
  });

  it('returns null tagsJson when there is nothing to union', () => {
    const patch = reaggregateEntryPatch([], null);
    expect(patch.tagsJson).toBeNull();
  });
});

function logEntry(overrides: Partial<LogEntry> & { name: string }): LogEntry {
  return {
    id: 'e1',
    type: 'meal',
    mealSlot: null,
    barcode: null,
    loggedAt: 1000,
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

describe('entryToComponentDrafts', () => {
  it('turns a multi-component entry into drafts ordered by sortOrder, with ids stripped', () => {
    const entry = logEntry({ name: 'Peas + 1 more', componentCount: 2 });
    const rows: MealComponent[] = [
      savedComponent({ id: 'c2', name: 'Rice', sortOrder: 1, calories: 200 }),
      savedComponent({ id: 'c1', name: 'Peas', sortOrder: 0, calories: 100 }),
    ];
    const drafts = entryToComponentDrafts(entry, rows);
    expect(drafts.map((d) => d.name)).toEqual(['Peas', 'Rice']);
    for (const d of drafts) {
      expect(d).not.toHaveProperty('id');
      expect(d).not.toHaveProperty('entryId');
      expect(d).not.toHaveProperty('createdAt');
    }
  });

  it('turns a flat entry (no component rows) into one draft with servings 1, carrying nutrition/tags/ingredients', () => {
    const entry = logEntry({
      name: 'Oatmeal',
      barcode: '111',
      servingG: 250,
      calories: 150,
      fatG: 3,
      ingredientsText: 'Oats, water',
      tagsJson: '["oats"]',
    });
    const [draft] = entryToComponentDrafts(entry, []);
    expect(draft.name).toBe('Oatmeal');
    expect(draft.barcode).toBe('111');
    expect(draft.servings).toBe(1);
    expect(draft.servingG).toBe(250);
    expect(draft.calories).toBe(150);
    expect(draft.fatG).toBe(3);
    expect(draft.ingredientsText).toBe('Oats, water');
    expect(draft.tagsJson).toBe('["oats"]');
    expect(draft.sortOrder).toBe(0);
  });

  it('falls back to the flat draft when componentCount is set but there are zero actual rows', () => {
    const entry = logEntry({ name: 'Legacy meal', componentCount: 3, calories: 400 });
    const drafts = entryToComponentDrafts(entry, []);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].name).toBe('Legacy meal');
    expect(drafts[0].servings).toBe(1);
  });

  it('round-trips: aggregateComponents(entryToComponentDrafts(entry, rows)) matches the entry nutrition (multi-component)', () => {
    const rows: MealComponent[] = [
      savedComponent({ id: 'c1', name: 'Peas', sortOrder: 0, calories: 100, servings: 2 }),
      savedComponent({ id: 'c2', name: 'Rice', sortOrder: 1, calories: 200, servings: 1 }),
    ];
    const entryNutrition = aggregateComponents(rows);
    const entry = logEntry({ name: 'Peas + 1 more', componentCount: 2, ...entryNutrition });
    const drafts = entryToComponentDrafts(entry, rows);
    expect(aggregateComponents(drafts)).toEqual(entryNutrition);
  });

  it('round-trips: aggregateComponents(entryToComponentDrafts(entry, [])) matches the entry nutrition (flat entry)', () => {
    const entry = logEntry({ name: 'Oatmeal', calories: 150, fatG: 3, carbsG: 27 });
    const drafts = entryToComponentDrafts(entry, []);
    const result = aggregateComponents(drafts);
    expect(result.calories).toBe(entry.calories);
    expect(result.fatG).toBe(entry.fatG);
    expect(result.carbsG).toBe(entry.carbsG);
    expect(result.proteinG).toBeNull();
  });
});

describe('defaultMealName', () => {
  it('returns the empty string for no components', () => {
    expect(defaultMealName([])).toBe('');
  });

  it('returns the first name unchanged for a single component', () => {
    expect(defaultMealName([{ name: 'Chicken salad' }])).toBe('Chicken salad');
  });

  it('appends "+ N more" for multiple components', () => {
    expect(defaultMealName([{ name: 'Peas' }, { name: 'Rice' }, { name: 'Chicken' }])).toBe('Peas + 2 more');
  });
});
