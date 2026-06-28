import { extractTags, normalizeTag, parseTagsJson, serializeTags } from '../ingredients';

describe('normalizeTag', () => {
  it('strips language prefix', () => {
    expect(normalizeTag('en:milk')).toBe('milk');
    expect(normalizeTag('fr:lait')).toBe('lait');
  });

  it('lowercases and trims', () => {
    expect(normalizeTag('  MILK  ')).toBe('milk');
    expect(normalizeTag('en:SUGAR')).toBe('sugar');
  });

  it('leaves tags without a prefix unchanged', () => {
    expect(normalizeTag('e322')).toBe('e322');
  });
});

describe('extractTags', () => {
  it('normalizes and deduplicates allergen and additive tags', () => {
    const tags = extractTags({
      ingredientsText: null,
      allergensTags: ['en:milk', 'en:nuts'],
      additivesTags: ['en:e322'],
    });
    expect(tags).toEqual(['milk', 'nuts', 'e322']);
  });

  it('tokenizes ingredient text on commas, stripping parentheticals', () => {
    const tags = extractTags({
      ingredientsText: 'Sugar, Palm oil, Hazelnuts 13%, Skimmed milk powder 8.7%',
      allergensTags: [],
      additivesTags: [],
    });
    expect(tags).toContain('sugar');
    expect(tags).toContain('palm oil');
    expect(tags).toContain('hazelnuts');
    expect(tags).toContain('skimmed milk powder');
  });

  it('places allergens before ingredient-text tokens', () => {
    const tags = extractTags({
      ingredientsText: 'wheat flour',
      allergensTags: ['en:gluten'],
      additivesTags: [],
    });
    expect(tags[0]).toBe('gluten');
  });

  it('deduplicates across all three sources', () => {
    const tags = extractTags({
      ingredientsText: 'milk, sugar',
      allergensTags: ['en:milk'],
      additivesTags: [],
    });
    const milkCount = tags.filter((t) => t === 'milk').length;
    expect(milkCount).toBe(1);
  });

  it('drops tokens shorter than 2 chars and stopwords', () => {
    const tags = extractTags({
      ingredientsText: 'a, and, or, salt',
      allergensTags: [],
      additivesTags: [],
    });
    expect(tags).not.toContain('a');
    expect(tags).not.toContain('and');
    expect(tags).not.toContain('or');
    expect(tags).toContain('salt');
  });

  it('returns empty array when all inputs are empty', () => {
    expect(extractTags({ ingredientsText: null, allergensTags: [], additivesTags: [] })).toEqual([]);
    expect(extractTags({ ingredientsText: '', allergensTags: null, additivesTags: undefined })).toEqual([]);
  });

  it('handles non-array allergens/additives defensively', () => {
    const tags = extractTags({ ingredientsText: null, allergensTags: 'not-an-array', additivesTags: 42 });
    expect(tags).toEqual([]);
  });
});

describe('parseTagsJson / serializeTags round-trip', () => {
  it('round-trips a tag array', () => {
    const original = ['milk', 'gluten', 'e322'];
    expect(parseTagsJson(serializeTags(original))).toEqual(original);
  });

  it('returns empty array for null, undefined, empty string, and bad JSON', () => {
    expect(parseTagsJson(null)).toEqual([]);
    expect(parseTagsJson(undefined)).toEqual([]);
    expect(parseTagsJson('')).toEqual([]);
    expect(parseTagsJson('not json')).toEqual([]);
    expect(parseTagsJson('{"not":"array"}')).toEqual([]);
  });

  it('filters non-string entries from a parsed array', () => {
    expect(parseTagsJson('[1, "milk", null, "gluten"]')).toEqual(['milk', 'gluten']);
  });
});
