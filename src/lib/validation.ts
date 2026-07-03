// Pure validation helpers (CLAUDE.md §8). No React, no I/O — trivially unit-testable.

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const VALID: ValidationResult = { valid: true };

export const MAX_NOTES_LENGTH = 500;

/**
 * Notes are optional and capped at 500 characters (CLAUDE.md §6). Empty/null is fine.
 * Length is measured on the raw string (the UI shows a live counter against the same cap).
 */
export function validateNotes(notes: string | null | undefined): ValidationResult {
  if (notes == null || notes.length === 0) return VALID;
  if (notes.length > MAX_NOTES_LENGTH) {
    return {
      valid: false,
      error: `Notes must be ${MAX_NOTES_LENGTH} characters or fewer (got ${notes.length}).`,
    };
  }
  return VALID;
}

/** The eight optional nutrition fields. All are non-negative finite numbers when present. */
export const NUTRITION_FIELDS = [
  'calories',
  'fatG',
  'saturatedFatG',
  'carbsG',
  'proteinG',
  'fiberG',
  'sugarG',
  'sodiumMg',
] as const;

export type NutritionField = (typeof NUTRITION_FIELDS)[number];

export type NutritionInput = Partial<Record<NutritionField, number | null | undefined>>;

export interface NutritionValidationResult {
  valid: boolean;
  /** Per-field error messages, keyed by field name. Empty when valid. */
  errors: Partial<Record<NutritionField, string>>;
}

/**
 * A nutrition value is valid when it is absent (null/undefined) or a finite number >= 0.
 * NaN, Infinity, and negatives are rejected. Returns per-field errors so the form can
 * highlight the exact offending input.
 */
export function validateNutrition(input: NutritionInput): NutritionValidationResult {
  const errors: Partial<Record<NutritionField, string>> = {};

  for (const field of NUTRITION_FIELDS) {
    const value = input[field];
    if (value == null) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors[field] = `${field} must be a number.`;
    } else if (value < 0) {
      errors[field] = `${field} cannot be negative.`;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
