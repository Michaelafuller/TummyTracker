import type { NutritionField } from './validation';

/** Per-field numeric values (used as a per-100g base for serving-size scaling). */
export type NutritionValues = Record<NutritionField, number | null>;

function roundNutrition(value: number | null, decimals: number): number | null {
  if (value == null) return null;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * Scale a per-100g nutrition base to a given serving size.
 * Calories and sodium are rounded to 0 dp; all other grams to 1 dp.
 * Null values pass through as null.
 */
export function scaleNutrition(
  per100g: Partial<NutritionValues>,
  servingG: number,
): NutritionValues {
  const f = servingG / 100;
  const s = (v: number | null | undefined, dp: number) =>
    roundNutrition(v != null ? v * f : null, dp);
  return {
    calories: s(per100g.calories, 0),
    fatG: s(per100g.fatG, 1),
    saturatedFatG: s(per100g.saturatedFatG, 1),
    carbsG: s(per100g.carbsG, 1),
    proteinG: s(per100g.proteinG, 1),
    fiberG: s(per100g.fiberG, 1),
    sugarG: s(per100g.sugarG, 1),
    sodiumMg: s(per100g.sodiumMg, 0),
  };
}

/** Display labels (with units) for the nutrition fields. */
export const NUTRITION_LABELS: Record<NutritionField, string> = {
  calories: 'Calories',
  fatG: 'Fat (g)',
  saturatedFatG: 'Sat. fat (g)',
  carbsG: 'Carbs (g)',
  proteinG: 'Protein (g)',
  fiberG: 'Fiber (g)',
  sugarG: 'Sugar (g)',
  sodiumMg: 'Sodium (mg)',
};

/** Lower-case noun phrase for use mid-sentence, e.g. "meals high in fat". */
export const NUTRITION_NOUNS: Record<NutritionField, string> = {
  calories: 'calories',
  fatG: 'fat',
  saturatedFatG: 'saturated fat',
  carbsG: 'carbs',
  proteinG: 'protein',
  fiberG: 'fiber',
  sugarG: 'sugar',
  sodiumMg: 'sodium',
};
