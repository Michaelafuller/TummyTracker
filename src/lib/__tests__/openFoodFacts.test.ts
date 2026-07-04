import {
  mapOffResponse,
  mapOffSearchResponse,
  offProductToComponentFormState,
  offProductToFormState,
} from '../openFoodFacts';
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
    expect(product.categoriesTags).toEqual(['en:spreads', 'en:hazelnut-spreads']);
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
    expect(product.categoriesTags).toEqual([]);
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

  it('reads serving_quantity from the product', () => {
    const json = { status: 1, product: { product_name: 'Bar', serving_quantity: 40, nutriments: {} } };
    expect(mapOffResponse('1', json).servingG).toBe(40);
  });

  it('returns servingG null when serving_quantity is absent', () => {
    const json = { status: 1, product: { product_name: 'Loose', nutriments: {} } };
    expect(mapOffResponse('1', json).servingG).toBeNull();
  });
});

describe('mapOffSearchResponse', () => {
  it('maps each product node and caps at 5, most-scanned order preserved when scores tie', () => {
    // All 7 fixtures are unbranded, uncategorized, and the same name length relative
    // to the query, so genericityScore ties across the board — the stable sort falls
    // back to OFF's own most-scanned order (the array's original order).
    const json = {
      products: Array.from({ length: 7 }, (_, i) => ({
        code: `${i}`,
        product_name: `Product ${i}`,
        nutriments: { 'energy-kcal_100g': 100 + i },
      })),
    };
    const results = mapOffSearchResponse(json, 'product');
    expect(results).toHaveLength(5);
    expect(results[0].name).toBe('Product 0');
    expect(results[0].barcode).toBe('0');
  });

  it('drops products with no product_name', () => {
    const json = {
      products: [
        { code: '1', product_name: 'Has a name', nutriments: {} },
        { code: '2', nutriments: {} },
        { code: '3', product_name: '', nutriments: {} },
      ],
    };
    const results = mapOffSearchResponse(json, 'has a name');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Has a name');
  });

  it('extracts the first brand from a comma-separated brands field', () => {
    const json = {
      products: [{ code: '1', product_name: 'Chips', brands: 'Chiquita, Something Else', nutriments: {} }],
    };
    expect(mapOffSearchResponse(json, 'chips')[0].brand).toBe('Chiquita');
  });

  it('reports barcode null when the product node has no code', () => {
    const json = { products: [{ product_name: 'Homemade-ish', nutriments: {} }] };
    expect(mapOffSearchResponse(json, 'homemade-ish')[0].barcode).toBeNull();
  });

  it('is defensive against a missing/garbage products array', () => {
    expect(mapOffSearchResponse(null, 'x')).toEqual([]);
    expect(mapOffSearchResponse({}, 'x')).toEqual([]);
    expect(mapOffSearchResponse({ products: 'not-an-array' }, 'x')).toEqual([]);
  });

  it('extracts categoriesTags defensively', () => {
    const withTags = {
      products: [{ code: '1', product_name: 'Banana', categories_tags: ['en:fruits', 'en:bananas'] }],
    };
    expect(mapOffSearchResponse(withTags, 'banana')[0].categoriesTags).toEqual(['en:fruits', 'en:bananas']);

    const garbageTags = {
      products: [{ code: '2', product_name: 'Weird', categories_tags: 'not-an-array' }],
    };
    expect(mapOffSearchResponse(garbageTags, 'weird')[0].categoriesTags).toEqual([]);

    const mixedTags = {
      products: [{ code: '3', product_name: 'Mixed', categories_tags: ['en:fruits', 42, null] }],
    };
    expect(mapOffSearchResponse(mixedTags, 'mixed')[0].categoriesTags).toEqual(['en:fruits']);

    const noTags = {
      products: [{ code: '4', product_name: 'No Tags' }],
    };
    expect(mapOffSearchResponse(noTags, 'no tags')[0].categoriesTags).toEqual([]);
  });

  it('ranks an unbranded generic match above a branded product for the same query', () => {
    const json = {
      products: [
        // Branded, listed first (higher unique_scans_n) — should be outranked.
        { code: '1', product_name: 'Chiquita Banana Chips', brands: 'Chiquita', nutriments: {} },
        // Unbranded, generic, listed second — should rank first after re-ranking.
        { code: '2', product_name: 'Banana', nutriments: {}, categories_tags: ['en:fruits'] },
      ],
    };
    const results = mapOffSearchResponse(json, 'banana');
    expect(results[0].name).toBe('Banana');
    expect(results[0].brand).toBeNull();
    expect(results[1].name).toBe('Chiquita Banana Chips');
  });

  it('breaks ties toward produce-category hints over processed-category hints', () => {
    const json = {
      products: [
        // Both unbranded, both name-length-neutral relative to the query — the
        // category hint is the only differentiator.
        { code: '1', product_name: 'Snack Mix', nutriments: {}, categories_tags: ['en:snacks'] },
        { code: '2', product_name: 'Fresh Mix', nutriments: {}, categories_tags: ['en:vegetables'] },
      ],
    };
    const results = mapOffSearchResponse(json, 'mix');
    expect(results[0].name).toBe('Fresh Mix');
    expect(results[1].name).toBe('Snack Mix');
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

  it('scales nutrition by serving_quantity and exposes the per-100g base', () => {
    const json = {
      status: 1,
      product: {
        product_name: 'Bar',
        serving_quantity: 40,
        nutriments: { 'energy-kcal_100g': 500, 'fat_100g': 20 },
      },
    };
    const state = offProductToFormState(mapOffResponse('1', json));
    // 40g serving: 500 × 0.4 = 200 kcal, 20 × 0.4 = 8 g fat
    expect(state.nutrition?.calories).toBe('200');
    expect(state.nutrition?.fatG).toBe('8');
    expect(state.servingG).toBe('40');
    expect(state.nutritionBase?.calories).toBe(500);
    expect(state.nutritionBase?.fatG).toBe(20);
  });

  it('defaults servingG to 100 when serving_quantity is absent (no scaling)', () => {
    const state = offProductToFormState(mapOffResponse('3017620422003', found));
    expect(state.servingG).toBe('100');
    expect(state.nutrition?.calories).toBe('539'); // unchanged from per-100g
  });
});

describe('offProductToComponentFormState', () => {
  it('produces component prefill with nutrition, barcode, ingredients text, and tags JSON', () => {
    const state = offProductToComponentFormState(mapOffResponse('3017620422003', found));
    expect(state.name).toBe('Nutella');
    expect(state.barcode).toBe('3017620422003');
    expect(state.nutrition?.calories).toBe('539');
    expect(state.ingredientsText).toContain('Sugar');
    const tags = JSON.parse(state.tagsJson as string) as string[];
    expect(tags).toContain('milk');
  });

  it('scales nutrition by serving_quantity and exposes the per-100g base', () => {
    const json = {
      status: 1,
      product: {
        product_name: 'Bar',
        serving_quantity: 40,
        nutriments: { 'energy-kcal_100g': 500, 'fat_100g': 20 },
      },
    };
    const state = offProductToComponentFormState(mapOffResponse('1', json));
    expect(state.nutrition?.calories).toBe('200');
    expect(state.servingG).toBe('40');
    expect(state.nutritionBase?.calories).toBe(500);
  });
});
