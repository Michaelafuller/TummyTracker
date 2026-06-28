import { mapOffResponse, offProductToFormState } from '../openFoodFacts';
import found from './fixtures/off-found.json';
import notfound from './fixtures/off-notfound.json';

describe('mapOffResponse', () => {
  it('maps a found product with nutrition, ingredients, and tags', () => {
    const product = mapOffResponse('3017620422003', found);
    expect(product.found).toBe(true);
    expect(product.name).toBe('Nutella');
    expect(product.ingredientsText).toContain('Sugar');
    expect(product.tags).toContain('milk');
    expect(product.tags).toContain('nuts');
    expect(product.tags).toContain('e322');
    expect(product.tags).toContain('sugar');
    expect(product.nutrition).toEqual({
      calories: 539,
      fatG: 30.9,
      saturatedFatG: 10.6,
      carbsG: 57.5,
      proteinG: 6.3,
      fiberG: 0,
      sugarG: 56.3,
      sodiumMg: 43, // 0.0428 g → 42.8 mg → rounded
    });
  });

  it('reports not-found products with empty nutrition and no tags', () => {
    const product = mapOffResponse('0000000000000', notfound);
    expect(product.found).toBe(false);
    expect(product.name).toBeNull();
    expect(product.ingredientsText).toBeNull();
    expect(product.tags).toEqual([]);
    expect(Object.values(product.nutrition).every((v) => v === null)).toBe(true);
  });

  it('falls back to salt/2.5 when sodium is absent', () => {
    const json = { status: 1, product: { product_name: 'Salty', nutriments: { salt_100g: 2.5 } } };
    const product = mapOffResponse('1', json);
    expect(product.nutrition.sodiumMg).toBe(1000); // (2.5 / 2.5) g → 1000 mg
  });

  it('maps saturated fat from saturated-fat_100g', () => {
    const json = { status: 1, product: { product_name: 'Butter', nutriments: { 'saturated-fat_100g': 50.3 } } };
    expect(mapOffResponse('1', json).nutrition.saturatedFatG).toBe(50.3);
  });

  it('returns null for saturatedFatG when the field is absent', () => {
    const json = { status: 1, product: { product_name: 'Apple', nutriments: {} } };
    expect(mapOffResponse('1', json).nutrition.saturatedFatG).toBeNull();
  });

  it('is defensive against missing/garbage fields', () => {
    expect(mapOffResponse('1', null).found).toBe(false);
    expect(mapOffResponse('1', { status: 1 }).nutrition.fatG).toBeNull();
    const garbage = { status: 1, product: { product_name: '', nutriments: { fat_100g: 'oops' } } };
    const product = mapOffResponse('1', garbage);
    expect(product.name).toBeNull();
    expect(product.nutrition.fatG).toBeNull();
  });
});

describe('offProductToFormState', () => {
  it('produces form prefill with nutrition, barcode, ingredients text, and tags JSON', () => {
    const state = offProductToFormState(mapOffResponse('3017620422003', found));
    expect(state.name).toBe('Nutella');
    expect(state.barcode).toBe('3017620422003');
    expect(state.nutrition?.calories).toBe('539');
    expect(state.nutrition?.fatG).toBe('30.9');
    expect(state.nutrition?.fiberG).toBe('0');
    expect(state.ingredientsText).toContain('Sugar');
    expect(typeof state.tagsJson).toBe('string');
    const tags = JSON.parse(state.tagsJson as string) as string[];
    expect(tags).toContain('milk');
    expect(tags).toContain('sugar');
  });

  it('leaves nutrition and ingredients blank when values are missing', () => {
    const state = offProductToFormState(mapOffResponse('0000000000000', notfound));
    expect(state.nutrition?.calories).toBe('');
    expect(state.name).toBe('');
    expect(state.ingredientsText).toBe('');
    expect(state.tagsJson).toBe('[]');
  });
});
