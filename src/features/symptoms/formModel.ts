// Pure form model for symptom quick-add (HANDOFF.md flagship trio).
// Mirrors features/bm/formModel.ts — no nutrition, no meal slot, no barcode.

import type { LogEntry } from '@/db/schema';
import { formatDateInput, formatTimeInput, parseDateTime } from '@/lib/datetime';
import { validateNotes } from '@/lib/validation';
import { isSeverityValue, type SeverityValue } from './severity';
import { isSymptomTypeValue, symptomTypeLabel, type SymptomTypeValue } from './symptomTypes';

export interface SymptomFormState {
  dateInput: string;
  timeInput: string;
  symptomType: SymptomTypeValue | null;
  severity: SeverityValue | null;
  notes: string;
}

export interface BuiltSymptomEntry {
  type: 'symptom';
  name: string;
  mealSlot: null;
  barcode: null;
  loggedAt: number;
  symptomType: SymptomTypeValue | null;
  severity: SeverityValue | null;
  notes: string | null;
}

export interface SymptomFormErrors {
  loggedAt?: string;
  notes?: string;
}

export interface SymptomBuildResult {
  valid: boolean;
  entry?: BuiltSymptomEntry;
  errors: SymptomFormErrors;
}

/** Derive a readable entry name from the selected symptom type, falling back to "Symptom". */
export function symptomEntryName(symptomType: SymptomTypeValue | null): string {
  return symptomType != null ? symptomTypeLabel(symptomType) : 'Symptom';
}

export function buildSymptomEntry(state: SymptomFormState): SymptomBuildResult {
  const errors: SymptomFormErrors = {};

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
      type: 'symptom',
      name: symptomEntryName(state.symptomType),
      mealSlot: null,
      barcode: null,
      loggedAt: parsedDate.ms as number,
      symptomType: state.symptomType,
      severity: state.severity,
      notes: trimmedNotes.length > 0 ? trimmedNotes : null,
    },
  };
}

export function symptomEntryToFormState(entry: LogEntry): SymptomFormState {
  return {
    dateInput: formatDateInput(entry.loggedAt),
    timeInput: formatTimeInput(entry.loggedAt),
    symptomType: isSymptomTypeValue(entry.symptomType) ? entry.symptomType : null,
    severity: isSeverityValue(entry.severity) ? entry.severity : null,
    notes: entry.notes ?? '',
  };
}
