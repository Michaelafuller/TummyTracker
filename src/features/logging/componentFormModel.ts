// Pure form model for a single meal-builder component (HANDOFF.md Phase 2.3).
// Mirrors formModel.ts conventions but produces a MealComponentDraft instead of
// a full BuiltLogEntry — no loggedAt/sentiment/type here, those are meal-level
// fields collected once on the review screen.

import { extractTags, mergeTags, parseTagsJson, serializeTags } from '@/lib/ingredients';
import type { MealComponentDraft } from '@/lib/mealAggregate';
import { parseOptionalNumber } from '@/lib/number';
import type { NutritionValues } from '@/lib/nutrition';
import { NUTRITION_FIELDS, type NutritionField } from '@/lib/validation';

export type NutritionInputs = Record<NutritionField, string>;

export interface ComponentFormState {
  name: string;
  barcode: string | null;
  servings: string; // e.g. "1", "0.5"
  servingG: string;
  nutrition: NutritionInputs;
  ingredientsText: string;
  tagsJson: string; // pre-computed from OFF; empty = compute on save
  /** Per-100g base nutrition from OFF scan; null for manual entries. Used to rescale when servingG changes. */
  nutritionBase: Partial<NutritionValues> | null;
}

export interface ComponentFormErrors {
  name?: string;
  servings?: string;
  nutrition: Partial<Record<NutritionField, string>>;
}

export interface ComponentBuildResult {
  valid: boolean;
  draft?: MealComponentDraft;
  errors: ComponentFormErrors;
}

export function emptyComponentNutritionInputs(): NutritionInputs {
  return NUTRITION_FIELDS.reduce((acc, field) => {
    acc[field] = '';
    return acc;
  }, {} as NutritionInputs);
}

export function defaultComponentFormState(
  initial?: Partial<ComponentFormState>,
): ComponentFormState {
  return {
    name: '',
    barcode: null,
    servings: '1',
    servingG: '',
    nutrition: emptyComponentNutritionInputs(),
    ingredientsText: '',
    tagsJson: '',
    nutritionBase: null,
    ...initial,
  };
}

/** Validate the raw component form state and build the draft when everything is valid. */
export function buildComponentDraft(
  state: ComponentFormState,
  sortOrder: number,
): ComponentBuildResult {
  const errors: ComponentFormErrors = { nutrition: {} };

  const name = state.name.trim();
  if (name.length === 0) {
    errors.name = 'Name is required.';
  }

  const parsedServings = parseOptionalNumber(state.servings);
  if (parsedServings.error) {
    errors.servings = parsedServings.error;
  } else if (parsedServings.value == null || parsedServings.value <= 0) {
    errors.servings = 'Servings must be greater than 0.';
  }

  const nutritionValues: Partial<Record<NutritionField, number | null>> = {};
  for (const field of NUTRITION_FIELDS) {
    const parsed = parseOptionalNumber(state.nutrition[field]);
    if (parsed.error) {
      errors.nutrition[field] = parsed.error;
    } else if (parsed.value != null && parsed.value < 0) {
      errors.nutrition[field] = `${field} cannot be negative.`;
    } else {
      nutritionValues[field] = parsed.value;
    }
  }

  const parsedServingG = parseOptionalNumber(state.servingG);
  const servingGValue =
    parsedServingG.value != null && parsedServingG.value > 0 ? parsedServingG.value : null;

  const valid = !errors.name && !errors.servings && Object.keys(errors.nutrition).length === 0;

  if (!valid) {
    return { valid: false, errors };
  }

  const trimmedIngredients = state.ingredientsText.trim();
  // Merge pre-computed OFF tags with anything re-tokenized from the (possibly
  // user-edited) ingredient text — never let one side win outright. See
  // formModel.ts's buildLogEntry for the additive-only rationale. For a
  // grouped meal's edit screen this is safe: the text field holds component
  // names, whose normalized forms are already in unionComponentTags, so
  // merging adds nothing spurious.
  const existingTags = parseTagsJson(state.tagsJson);
  const textTags = extractTags({ ingredientsText: trimmedIngredients, allergensTags: null, additivesTags: null });
  const mergedTags = mergeTags(existingTags, textTags);
  const finalTagsJson = mergedTags.length > 0 ? serializeTags(mergedTags) : null;

  const draft: MealComponentDraft = {
    name,
    barcode: state.barcode,
    servings: parsedServings.value as number,
    servingG: servingGValue,
    calories: nutritionValues.calories ?? null,
    fatG: nutritionValues.fatG ?? null,
    saturatedFatG: nutritionValues.saturatedFatG ?? null,
    carbsG: nutritionValues.carbsG ?? null,
    proteinG: nutritionValues.proteinG ?? null,
    fiberG: nutritionValues.fiberG ?? null,
    sugarG: nutritionValues.sugarG ?? null,
    sodiumMg: nutritionValues.sodiumMg ?? null,
    ingredientsText: trimmedIngredients.length > 0 ? trimmedIngredients : null,
    tagsJson: finalTagsJson,
    sortOrder,
  };

  return { valid: true, draft, errors };
}
