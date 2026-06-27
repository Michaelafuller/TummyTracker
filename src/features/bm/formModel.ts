// Pure form model for the bowel-movement quick-add (BUILD_PLAN.md Phase 2).
// BMs reuse sentiment + notes and add an optional Bristol scale; they carry no
// nutrition or meal slot. As with the meal form, keeping this React-free makes it
// unit-testable.

import type { LogEntry } from '@/db/schema';
import type { SentimentValue } from '@/features/sentiment/scale';
import { isSentimentValue } from '@/features/sentiment/scale';
import { formatDateInput, formatTimeInput, parseDateTime } from '@/lib/datetime';
import { validateNotes } from '@/lib/validation';
import { type BristolValue, isBristolValue } from './bristol';

export const BM_ENTRY_NAME = 'Bowel movement';

export interface BmFormState {
  dateInput: string;
  timeInput: string;
  bristol: BristolValue | null;
  sentiment: SentimentValue | null;
  notes: string;
}

export interface BuiltBmEntry {
  type: 'bowel_movement';
  name: string;
  mealSlot: null;
  barcode: null;
  loggedAt: number;
  sentiment: SentimentValue | null;
  bristolScale: BristolValue | null;
  notes: string | null;
}

export interface BmFormErrors {
  loggedAt?: string;
  notes?: string;
}

export interface BmBuildResult {
  valid: boolean;
  entry?: BuiltBmEntry;
  errors: BmFormErrors;
}

export function buildBmEntry(state: BmFormState): BmBuildResult {
  const errors: BmFormErrors = {};

  const parsedDate = parseDateTime(state.dateInput, state.timeInput);
  if (parsedDate.ms == null) {
    errors.loggedAt = parsedDate.error ?? 'Invalid date or time.';
  }

  const notesResult = validateNotes(state.notes);
  if (!notesResult.valid) {
    errors.notes = notesResult.error;
  }

  if (errors.loggedAt || errors.notes) {
    return { valid: false, errors };
  }

  const trimmedNotes = state.notes.trim();
  return {
    valid: true,
    errors,
    entry: {
      type: 'bowel_movement',
      name: BM_ENTRY_NAME,
      mealSlot: null,
      barcode: null,
      loggedAt: parsedDate.ms as number,
      sentiment: state.sentiment,
      bristolScale: state.bristol,
      notes: trimmedNotes.length > 0 ? trimmedNotes : null,
    },
  };
}

export function bmEntryToFormState(entry: LogEntry): BmFormState {
  return {
    dateInput: formatDateInput(entry.loggedAt),
    timeInput: formatTimeInput(entry.loggedAt),
    bristol: isBristolValue(entry.bristolScale) ? entry.bristolScale : null,
    sentiment: isSentimentValue(entry.sentiment) ? entry.sentiment : null,
    notes: entry.notes ?? '',
  };
}
