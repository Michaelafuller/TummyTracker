import {
  buildComponentDraft,
  defaultComponentFormState,
  emptyComponentNutritionInputs,
  type ComponentFormState,
} from '../componentFormModel';

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

  it('prefers pre-computed OFF tagsJson over deriving from ingredientsText', () => {
    const result = buildComponentDraft(
      baseState({ ingredientsText: 'wheat, milk', tagsJson: '["off-tag"]' }),
      0,
    );
    expect(result.draft?.tagsJson).toBe('["off-tag"]');
  });

  it('carries the barcode through unchanged', () => {
    const result = buildComponentDraft(baseState({ barcode: '0123456789012' }), 0);
    expect(result.draft?.barcode).toBe('0123456789012');
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
