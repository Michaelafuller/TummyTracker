import {
  MAX_NOTES_LENGTH,
  NUTRITION_FIELDS,
  validateNotes,
  validateNutrition,
} from '../validation';

describe('validateNotes', () => {
  it('accepts empty, null, and undefined notes', () => {
    expect(validateNotes('').valid).toBe(true);
    expect(validateNotes(null).valid).toBe(true);
    expect(validateNotes(undefined).valid).toBe(true);
  });

  it('accepts notes exactly at the limit', () => {
    expect(validateNotes('a'.repeat(MAX_NOTES_LENGTH)).valid).toBe(true);
  });

  it('rejects notes over the limit and reports the length', () => {
    const result = validateNotes('a'.repeat(MAX_NOTES_LENGTH + 1));
    expect(result.valid).toBe(false);
    expect(result.error).toContain(String(MAX_NOTES_LENGTH + 1));
  });
});

describe('validateNutrition', () => {
  it('accepts an empty object (all fields optional)', () => {
    expect(validateNutrition({})).toEqual({ valid: true, errors: {} });
  });

  it('accepts absent (null/undefined) and zero values', () => {
    const result = validateNutrition({ calories: null, fatG: undefined, sugarG: 0 });
    expect(result.valid).toBe(true);
  });

  it('accepts a full set of valid numbers', () => {
    const full = Object.fromEntries(NUTRITION_FIELDS.map((f) => [f, 1.5]));
    expect(validateNutrition(full).valid).toBe(true);
  });

  it('rejects negative values per field', () => {
    const result = validateNutrition({ calories: -1, fatG: 3 });
    expect(result.valid).toBe(false);
    expect(result.errors.calories).toBeDefined();
    expect(result.errors.fatG).toBeUndefined();
  });

  it('rejects NaN and Infinity', () => {
    const result = validateNutrition({ proteinG: NaN, carbsG: Infinity });
    expect(result.valid).toBe(false);
    expect(result.errors.proteinG).toBeDefined();
    expect(result.errors.carbsG).toBeDefined();
  });
});
