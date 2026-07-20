// Pure form model for the meal review screen (HANDOFF.md Phase 2.3). Collects the
// meal-level fields once (name, type, meal slot, when, sentiment, notes) and
// combines them with the aggregate nutrition + unioned tags computed from the
// builder-store components to produce the single BuiltLogEntry the repository
// persists as one logEntry row + N mealComponent rows.

import type { LogEntryType, MealSlot } from '@/db/schema';
import type { SentimentValue } from '@/features/sentiment/scale';
import { formatDateInput, formatTimeInput, parseDateTime } from '@/lib/datetime';
import {
  aggregateComponents,
  defaultMealName,
  mealIngredientsText,
  type MealComponentDraft,
  unionComponentTags,
} from '@/lib/mealAggregate';
import { serializeTags } from '@/lib/ingredients';
import { validateNotes } from '@/lib/validation';
import type { BuiltLogEntry } from './formModel';

export interface MealReviewFormState {
  type: LogEntryType;
  name: string;
  mealSlot: MealSlot | null;
  dateInput: string; // YYYY-MM-DD
  timeInput: string; // HH:MM
  sentiment: SentimentValue | null;
  notes: string;
}

export interface MealReviewErrors {
  name?: string;
  loggedAt?: string;
  notes?: string;
}

export interface MealReviewBuildResult {
  valid: boolean;
  entry?: BuiltLogEntry;
  errors: MealReviewErrors;
}

/** Default meal-level state — name prefilled from the components, "now" for date/time. */
export function defaultMealReviewState(components: readonly MealComponentDraft[]): MealReviewFormState {
  const now = Date.now();
  return {
    type: 'meal',
    name: defaultMealName(components),
    mealSlot: null,
    dateInput: formatDateInput(now),
    timeInput: formatTimeInput(now),
    sentiment: null,
    notes: '',
  };
}

/**
 * Validate the meal-level fields and build the single aggregate entry. The
 * barcode/servingG fields don't apply to a multi-component meal (they're
 * per-component); ingredientsText is the single component's full ingredient
 * text (single-component meal) or the component names joined ", " (multi).
 * See `mealIngredientsText`.
 */
export function buildMealEntry(
  state: MealReviewFormState,
  components: readonly MealComponentDraft[],
): MealReviewBuildResult {
  const errors: MealReviewErrors = {};

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

  const valid = !errors.name && !errors.loggedAt && !errors.notes;
  if (!valid) {
    return { valid: false, errors };
  }

  const trimmedNotes = state.notes.trim();
  const aggregate = aggregateComponents(components);
  const tags = unionComponentTags(components);
  const ingredientsText = mealIngredientsText(components);

  const entry: BuiltLogEntry = {
    type: state.type,
    name,
    mealSlot: state.mealSlot,
    barcode: components.length === 1 ? (components[0].barcode ?? null) : null,
    loggedAt: parsedDate.ms as number,
    sentiment: state.sentiment,
    notes: trimmedNotes.length > 0 ? trimmedNotes : null,
    calories: aggregate.calories,
    fatG: aggregate.fatG,
    saturatedFatG: aggregate.saturatedFatG,
    carbsG: aggregate.carbsG,
    proteinG: aggregate.proteinG,
    fiberG: aggregate.fiberG,
    sugarG: aggregate.sugarG,
    sodiumMg: aggregate.sodiumMg,
    servingG: components.length === 1 ? (components[0].servingG ?? null) : null,
    ingredientsText,
    tagsJson: tags.length > 0 ? serializeTags(tags) : null,
  };

  return { valid: true, entry, errors };
}
