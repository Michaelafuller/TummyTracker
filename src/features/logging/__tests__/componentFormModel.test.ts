import type { MealComponent } from '@/db/schema';
import {
  buildComponentDraft,
  defaultComponentFormState,
  emptyComponentNutritionInputs,
  mealComponentToFormState,
  type ComponentFormState,
} from '../componentFormModel';

function savedComponent(overrides: Partial<MealComponent> = {}): MealComponent {
  return {
    id: 'c1',
    entryId: 'e1',
    name: 'Peas',
    barcode: null,
    servings: 2,
    servingG: 150,
    calories: 100,
    fatG: 1,
    saturatedFatG: 0.5,
    carbsG: 10,
    proteinG: 5,
    fiberG: 2,
    sugarG: 3,
    sodiumMg: 50,
    ingredientsText: 'peas',
    tagsJson: '["pea"]',
    sortOrder: 0,
    createdAt: 1,
    ...overrides,
  };
}

function baseState(overrides: Partial<ComponentFormState> = {}): ComponentFormState {
  return {
    ...defaultComponentFormState(),
    name: 'Peas',
    ...overrides,
  };
}

describe('buildComponentDraft', () => {
  it('builds a valid draft from good input', () => {
    const result = buildComponentDraft(
      baseState({ servings: '2', nutrition: { ...emptyComponentNutritionInputs(), calories: '100' } }),
      0,
    );
    expect(result.valid).toBe(true);
    expect(result.draft).toMatchObject({ name: 'Peas', servings: 2, calories: 100, sortOrder: 0 });
  });

  it('trims the name and rejects an empty one', () => {
    expect(buildComponentDraft(baseState({ name: '   ' }), 0).errors.name).toBeDefined();
    const ok = buildComponentDraft(baseState({ name: '  Rice  ' }), 0);
    expect(ok.draft?.name).toBe('Rice');
  });

  it('defaults servings to 1 and accepts it', () => {
    const result = buildComponentDraft(baseState(), 0);
    expect(result.valid).toBe(true);
    expect(result.draft?.servings).toBe(1);
  });

  it('rejects zero or negative servings', () => {
    expect(buildComponentDraft(baseState({ servings: '0' }), 0).errors.servings).toBeDefined();
    expect(buildComponentDraft(baseState({ servings: '-1' }), 0).errors.servings).toBeDefined();
  });

  it('rejects non-numeric servings', () => {
    expect(buildComponentDraft(baseState({ servings: 'abc' }), 0).errors.servings).toBeDefined();
  });

  it('rejects negative nutrition values', () => {
    const result = buildComponentDraft(
      baseState({ nutrition: { ...emptyComponentNutritionInputs(), fatG: '-5' } }),
      0,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.nutrition.fatG).toBeDefined();
  });

  it('sets servingG to null when empty or zero', () => {
    expect(buildComponentDraft(baseState({ servingG: '' }), 0).draft?.servingG).toBeNull();
    expect(buildComponentDraft(baseState({ servingG: '0' }), 0).draft?.servingG).toBeNull();
  });

  it('persists a positive servingG', () => {
    expect(buildComponentDraft(baseState({ servingG: '150' }), 0).draft?.servingG).toBe(150);
  });

  it('stamps the given sortOrder', () => {
    expect(buildComponentDraft(baseState(), 3).draft?.sortOrder).toBe(3);
  });

  it('nulls out empty ingredientsText and computes tags from it when tagsJson is empty', () => {
    const result = buildComponentDraft(baseState({ ingredientsText: 'wheat, milk' }), 0);
    expect(result.draft?.ingredientsText).toBe('wheat, milk');
    expect(result.draft?.tagsJson).toContain('wheat');
    expect(result.draft?.tagsJson).toContain('milk');
  });

  it('merges tags tokenized from ingredientsText into pre-computed OFF tagsJson (existing tags first)', () => {
    const result = buildComponentDraft(
      baseState({ ingredientsText: 'wheat, milk', tagsJson: '["off-tag"]' }),
      0,
    );
    const tags = JSON.parse(result.draft?.tagsJson ?? '[]') as string[];
    expect(tags).toEqual(['off-tag', 'wheat', 'milk']);
  });

  it('keeps OFF tagsJson unchanged when ingredientsText contributes nothing new', () => {
    const result = buildComponentDraft(
      baseState({ ingredientsText: 'wheat', tagsJson: '["wheat"]' }),
      0,
    );
    expect(result.draft?.tagsJson).toBe('["wheat"]');
  });

  it('carries the barcode through unchanged', () => {
    const result = buildComponentDraft(baseState({ barcode: '0123456789012' }), 0);
    expect(result.draft?.barcode).toBe('0123456789012');
  });
});

describe('mealComponentToFormState', () => {
  it('round-trips a saved row through buildComponentDraft, reproducing its values', () => {
    const row = savedComponent();
    const state = defaultComponentFormState(mealComponentToFormState(row));
    const result = buildComponentDraft(state, row.sortOrder);
    expect(result.valid).toBe(true);
    expect(result.draft).toMatchObject({
      name: 'Peas',
      servings: 2,
      servingG: 150,
      calories: 100,
      fatG: 1,
      saturatedFatG: 0.5,
      carbsG: 10,
      proteinG: 5,
      fiberG: 2,
      sugarG: 3,
      sodiumMg: 50,
      sortOrder: 0,
    });
  });

  it('preserves an OFF tag additively even when ingredientsText would not retokenize it', () => {
    const row = savedComponent({ tagsJson: '["off-tag"]', ingredientsText: 'peas' });
    const state = defaultComponentFormState(mealComponentToFormState(row));
    const result = buildComponentDraft(state, row.sortOrder);
    const tags = JSON.parse(result.draft?.tagsJson ?? '[]') as string[];
    expect(tags).toContain('off-tag');
  });

  it('sets nutritionBase to null so editing servingG does not rescale the grid', () => {
    expect(mealComponentToFormState(savedComponent()).nutritionBase).toBeNull();
  });

  it('converts null numeric/text fields to empty strings, not "null"', () => {
    const row = savedComponent({
      servingG: null,
      calories: null,
      tagsJson: null,
      ingredientsText: null,
      barcode: null,
    });
    const state = mealComponentToFormState(row);
    expect(state.servingG).toBe('');
    expect(state.nutrition?.calories).toBe('');
    expect(state.tagsJson).toBe('');
    expect(state.ingredientsText).toBe('');
    expect(state.barcode).toBeNull();
  });

  it('stringifies servings', () => {
    expect(mealComponentToFormState(savedComponent({ servings: 0.5 })).servings).toBe('0.5');
  });
});

describe('defaultComponentFormState', () => {
  it('produces blank defaults with servings "1"', () => {
    const state = defaultComponentFormState();
    expect(state.name).toBe('');
    expect(state.servings).toBe('1');
    expect(state.barcode).toBeNull();
  });

  it('merges provided overrides', () => {
    const state = defaultComponentFormState({ name: 'Soup', barcode: '123' });
    expect(state.name).toBe('Soup');
    expect(state.barcode).toBe('123');
  });
});
