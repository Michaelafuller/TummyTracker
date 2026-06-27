import type { NutritionField } from './validation';

/** Display labels (with units) for the seven nutrition fields. */
export const NUTRITION_LABELS: Record<NutritionField, string> = {
  calories: 'Calories',
  fatG: 'Fat (g)',
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
  carbsG: 'carbs',
  proteinG: 'protein',
  fiberG: 'fiber',
  sugarG: 'sugar',
  sodiumMg: 'sodium',
};
