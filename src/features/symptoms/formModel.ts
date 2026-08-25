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
  /** Tap order; empty = none (falls back to one generic "Symptom" entry). */
  symptomTypes: SymptomTypeValue[];
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
  entries?: BuiltSymptomEntry[];
  errors: SymptomFormErrors;
}

/** Derive a readable entry name from the selected symptom type, falling back to "Symptom". */
export function symptomEntryName(symptomType: SymptomTypeValue | null): string {
  return symptomType != null ? symptomTypeLabel(symptomType) : 'Symptom';
}

/**
 * Fans out one BuiltSymptomEntry per selected symptom type (HANDOFF
 * multi-symptom logging) — all sharing loggedAt/severity/notes, each keeping
 * its own symptomType and per-type name. An empty selection preserves today's
 * optional-type behavior: one generic entry with symptomType null.
 */
export function buildSymptomEntries(state: SymptomFormState): SymptomBuildResult {
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

  const loggedAt = parsedDate.ms as number;
  const trimmedNotes = state.notes.trim();
  const notes = trimmedNotes.length > 0 ? trimmedNotes : null;
  const types: (SymptomTypeValue | null)[] =
    state.symptomTypes.length > 0 ? state.symptomTypes : [null];

  const entries: BuiltSymptomEntry[] = types.map((symptomType) => ({
    type: 'symptom',
    name: symptomEntryName(symptomType),
    mealSlot: null,
    barcode: null,
    loggedAt,
    symptomType,
    severity: state.severity,
    notes,
  }));

  return { valid: true, errors, entries };
}

export function symptomEntryToFormState(entry: LogEntry): SymptomFormState {
  return {
    dateInput: formatDateInput(entry.loggedAt),
    timeInput: formatTimeInput(entry.loggedAt),
    symptomTypes: isSymptomTypeValue(entry.symptomType) ? [entry.symptomType] : [],
    severity: isSeverityValue(entry.severity) ? entry.severity : null,
    notes: entry.notes ?? '',
  };
}
