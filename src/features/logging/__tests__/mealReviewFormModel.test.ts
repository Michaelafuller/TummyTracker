import type { MealComponentDraft } from '@/lib/mealAggregate';
import { buildMealEntry, defaultMealReviewState, type MealReviewFormState } from '../mealReviewFormModel';

function draft(name: string, overrides: Partial<MealComponentDraft> = {}): MealComponentDraft {
  return {
    name,
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

function baseState(overrides: Partial<MealReviewFormState> = {}): MealReviewFormState {
  return {
    type: 'meal',
    name: 'Lunch',
    mealSlot: 'lunch',
    dateInput: '2026-06-27',
    timeInput: '12:30',
    sentiment: 4,
    notes: '',
    ...overrides,
  };
}

describe('defaultMealReviewState', () => {
  it('prefills name from defaultMealName and defaults type to meal', () => {
    const state = defaultMealReviewState([draft('Peas'), draft('Rice')]);
    expect(state.name).toBe('Peas + 1 more');
    expect(state.type).toBe('meal');
    expect(state.mealSlot).toBeNull();
    expect(state.sentiment).toBeNull();
  });
});

describe('buildMealEntry', () => {
  it('builds a valid aggregate entry from meal-level fields + components', () => {
    const components = [
      draft('Peas', { calories: 100, tagsJson: '["pea"]' }),
      draft('Rice', { calories: 200 }),
    ];
    const result = buildMealEntry(baseState(), components);
    expect(result.valid).toBe(true);
    expect(result.entry).toMatchObject({
      type: 'meal',
      name: 'Lunch',
      mealSlot: 'lunch',
      sentiment: 4,
      calories: 300,
      ingredientsText: 'Peas, Rice',
    });
    const tags = JSON.parse(result.entry?.tagsJson as string) as string[];
    expect(tags).toEqual(['pea', 'peas', 'rice']);
  });

  it('rejects an empty name', () => {
    const result = buildMealEntry(baseState({ name: '  ' }), [draft('Peas')]);
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
  });

  it('rejects an invalid date', () => {
    const result = buildMealEntry(baseState({ dateInput: '2026-02-30' }), [draft('Peas')]);
    expect(result.valid).toBe(false);
    expect(result.errors.loggedAt).toBeDefined();
  });

  it('rejects notes over the max length', () => {
    const result = buildMealEntry(baseState({ notes: 'x'.repeat(501) }), [draft('Peas')]);
    expect(result.valid).toBe(false);
    expect(result.errors.notes).toBeDefined();
  });

  it('carries barcode/servingG through for a single-component meal', () => {
    const components = [draft('Nutella', { barcode: '123', servingG: 40 })];
    const result = buildMealEntry(baseState(), components);
    expect(result.entry?.barcode).toBe('123');
    expect(result.entry?.servingG).toBe(40);
  });

  it('nulls barcode/servingG for a multi-component meal', () => {
    const components = [draft('Peas', { barcode: '111' }), draft('Rice', { barcode: '222' })];
    const result = buildMealEntry(baseState(), components);
    expect(result.entry?.barcode).toBeNull();
    expect(result.entry?.servingG).toBeNull();
  });

  it('sets tagsJson to null when the union is empty', () => {
    const result = buildMealEntry(baseState(), []);
    expect(result.entry?.tagsJson).toBeNull();
    expect(result.entry?.ingredientsText).toBeNull();
  });

  it('trims notes and nulls them out when blank', () => {
    expect(buildMealEntry(baseState({ notes: '   ' }), [draft('Peas')]).entry?.notes).toBeNull();
    expect(buildMealEntry(baseState({ notes: ' tasty ' }), [draft('Peas')]).entry?.notes).toBe('tasty');
  });

  it('allows a null sentiment (set later)', () => {
    const result = buildMealEntry(baseState({ sentiment: null }), [draft('Peas')]);
    expect(result.valid).toBe(true);
    expect(result.entry?.sentiment).toBeNull();
  });
});
