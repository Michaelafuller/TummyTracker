// Pure form model for the manual-entry form. Takes the raw string state of the
// form and produces either a validated entry payload or per-field errors. Keeping
// this logic React-free is where the test leverage lives (CLAUDE.md §2/§8).

import type { LogEntry, LogEntryType, MealSlot } from '@/db/schema';
import { isSentimentValue, type SentimentValue } from '@/features/sentiment/scale';
import { formatDateInput, formatTimeInput, parseDateTime } from '@/lib/datetime';
import { extractTags, mergeTags, parseTagsJson, serializeTags } from '@/lib/ingredients';
import { parseOptionalNumber } from '@/lib/number';
import type { NutritionValues } from '@/lib/nutrition';
import { NUTRITION_FIELDS, type NutritionField, validateNotes } from '@/lib/validation';

export type NutritionInputs = Record<NutritionField, string>;

export interface LogEntryFormState {
  type: LogEntryType;
  name: string;
  mealSlot: MealSlot | null;
  dateInput: string; // YYYY-MM-DD
  timeInput: string; // HH:MM
  sentiment: SentimentValue | null;
  notes: string;
  nutrition: NutritionInputs;
  barcode: string | null;
  ingredientsText: string;
  tagsJson: string; // pre-computed from OFF (allergens + additives + text); empty = compute on save
  servingG: string; // serving size in grams; empty = not set
  /** Per-100g base nutrition from OFF scan; null for manual entries. Used to rescale when servingG changes. */
  nutritionBase: Partial<NutritionValues> | null;
}

/** The validated, ready-to-persist shape (no id/timestamps — the repo adds those). */
export interface BuiltLogEntry {
  type: LogEntryType;
  name: string;
  mealSlot: MealSlot | null;
  barcode: string | null;
  loggedAt: number;
  sentiment: SentimentValue | null;
  notes: string | null;
  calories: number | null;
  fatG: number | null;
  saturatedFatG: number | null;
  carbsG: number | null;
  proteinG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  servingG: number | null;
  ingredientsText: string | null;
  tagsJson: string | null;
}

export interface FormErrors {
  name?: string;
  loggedAt?: string;
  notes?: string;
  nutrition: Partial<Record<NutritionField, string>>;
}

export interface BuildResult {
  valid: boolean;
  entry?: BuiltLogEntry;
  errors: FormErrors;
}

export function emptyNutritionInputs(): NutritionInputs {
  return NUTRITION_FIELDS.reduce((acc, field) => {
    acc[field] = '';
    return acc;
  }, {} as NutritionInputs);
}

/** Hydrate the form state from a persisted entry (used by the edit screen). */
export function logEntryToFormState(entry: LogEntry): LogEntryFormState {
  const nutrition = NUTRITION_FIELDS.reduce((acc, field) => {
    const value = entry[field];
    acc[field] = value == null ? '' : String(value);
    return acc;
  }, {} as NutritionInputs);

  return {
    type: entry.type,
    name: entry.name,
    mealSlot: entry.mealSlot,
    dateInput: formatDateInput(entry.loggedAt),
    timeInput: formatTimeInput(entry.loggedAt),
    sentiment: isSentimentValue(entry.sentiment) ? entry.sentiment : null,
    notes: entry.notes ?? '',
    nutrition,
    barcode: entry.barcode,
    ingredientsText: entry.ingredientsText ?? '',
    tagsJson: entry.tagsJson ?? '',
    servingG: entry.servingG != null ? String(entry.servingG) : '',
    nutritionBase: null, // per-100g base not stored; rescaling unavailable in edit path
  };
}

/** Validate the raw form state and build the entry payload when everything is valid. */
export function buildLogEntry(state: LogEntryFormState): BuildResult {
  const errors: FormErrors = { nutrition: {} };

  const name = state.name.trim();
  if (name.length === 0) {
    errors.name = 'Name is required.';
  }

  const parsedDate = parseDateTime(state.dateInput, state.timeInput);
  if (parsedDate.ms == null) {
    errors.loggedAt = parsedDate.error ?? 'Invalid date or time.';
  }

  const notesResult = validateNotes(state.notes);
  if (!notesResult.valid) {
    errors.notes = notesResult.error;
  }

  // Parse each nutrition field; collect parse errors and the numeric values.
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

  // Parse optional serving size; must be positive when provided.
  const parsedServing = parseOptionalNumber(state.servingG);
  const servingGValue =
    parsedServing.value != null && parsedServing.value > 0 ? parsedServing.value : null;

  const valid =
    !errors.name &&
    !errors.loggedAt &&
    !errors.notes &&
    Object.keys(errors.nutrition).length === 0;

  if (!valid) {
    return { valid: false, errors };
  }

  const trimmedNotes = state.notes.trim();
  const trimmedIngredients = state.ingredientsText.trim();

  // Merge pre-computed OFF tags with anything re-tokenized from the (possibly
  // user-edited) ingredient text — never let one side win outright. Additive
  // only: a word removed from the text does not remove its tag, because we
  // can't tell a removed ingredient from a shortened note, and a false
  // negative in capture is worse than a stale tag. Existing tags keep their
  // lead position (allergens/additives stay highest-signal-first).
  const existingTags = parseTagsJson(state.tagsJson);
  const textTags = extractTags({ ingredientsText: trimmedIngredients, allergensTags: null, additivesTags: null });
  const mergedTags = mergeTags(existingTags, textTags);
  const finalTagsJson = mergedTags.length > 0 ? serializeTags(mergedTags) : null;

  const entry: BuiltLogEntry = {
    type: state.type,
    name,
    mealSlot: state.mealSlot,
    barcode: state.barcode,
    loggedAt: parsedDate.ms as number,
    sentiment: state.sentiment,
    notes: trimmedNotes.length > 0 ? trimmedNotes : null,
    calories: nutritionValues.calories ?? null,
    fatG: nutritionValues.fatG ?? null,
    saturatedFatG: nutritionValues.saturatedFatG ?? null,
    carbsG: nutritionValues.carbsG ?? null,
    proteinG: nutritionValues.proteinG ?? null,
    fiberG: nutritionValues.fiberG ?? null,
    sugarG: nutritionValues.sugarG ?? null,
    sodiumMg: nutritionValues.sodiumMg ?? null,
    servingG: servingGValue,
    ingredientsText: trimmedIngredients.length > 0 ? trimmedIngredients : null,
    tagsJson: finalTagsJson,
  };

  return { valid: true, entry, errors };
}
