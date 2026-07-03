import { aggregateComponents, defaultMealName, type MealComponentDraft, unionComponentTags } from '../mealAggregate';

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
