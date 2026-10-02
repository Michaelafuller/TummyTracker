// Pure form model for the medication entry ("I took these") screen (HANDOFF.md
// #7, #8, #9). Keeping this React-free (like features/medications/formModel.ts)
// makes the build/parse logic unit-testable without rendering anything.
//
// Nothing here ever infers a dose from a medication's frequency/schedule
// (invariant, HANDOFF.md §0) — `defaultEntryState`/`entryStateFromEvent` only
// ever pre-fill inputs from rows the caller already has, and
// `buildMedicationEntry` only ever turns what the user actually selected into
// an event + dose payload.

import type { Medication, MedicationDose, MedicationEvent } from '@/db/schema';
import { formatDateInput, formatTimeInput, parseDateTime } from '@/lib/datetime';
import { formatDoseNumber, validateReason } from '@/lib/medications';
import { validateNotes } from '@/lib/validation';

/** One medication row in the entry form — selected lines are the ones that get saved. */
export interface DoseLineState {
  medicationId: string;
  selected: boolean;
  /** Raw numeric text; '' means "no dose entered". */
  doseInput: string;
  doseUnit: string;
  /**
   * Raw reason text (GitHub #28); '' means none. Only as-needed (non-regular)
   * lines expose a field for it, but a reason already saved on an edited dose
   * is carried here either way so a save never clears it.
   */
  reasonInput: string;
}

export interface MedicationEntryFormState {
  dateInput: string;
  timeInput: string;
  /** false = "time not known" — the UI hides the time chip and takenAt lands on local noon (#10). */
  timeKnown: boolean;
  lines: DoseLineState[];
  notes: string;
}

export interface MedicationEntryErrors {
  /** "Select at least one medication." — no line is selected. */
  lines?: string;
  /** Per-medicationId dose/unit error, only for lines that are selected. */
  doseErrors?: Record<string, string>;
  /** Per-medicationId reason error (too long), only for lines that are selected. */
  reasonErrors?: Record<string, string>;
  loggedAt?: string;
  notes?: string;
}

export interface BuiltMedicationEvent {
  takenAt: number;
  timeKnown: boolean;
  notes: string | null;
}

export interface BuiltMedicationDose {
  medicationId: string;
  dose: number;
  doseUnit: string;
  /** Trimmed reason, null when none (GitHub #28). */
  reason: string | null;
}

export interface MedicationEntryBuildResult {
  valid: boolean;
  errors: MedicationEntryErrors;
  event?: BuiltMedicationEvent;
  doses?: BuiltMedicationDose[];
}

/** Pre-fills a line's dose input from a medication's own default (falls back to ''). */
function defaultDoseInput(med: Medication): string {
  return med.defaultDose != null ? formatDoseNumber(med.defaultDose) : '';
}

/**
 * The new-entry default: date/time = now, `timeKnown: true`, one unselected
 * line per active medication (#7), pre-filled with its `defaultDose`/`doseUnit`
 * (#9) — in the same order `activeMeds` is given (the Meds list order).
 */
export function defaultEntryState(activeMeds: readonly Medication[], now: number): MedicationEntryFormState {
  return {
    dateInput: formatDateInput(now),
    timeInput: formatTimeInput(now),
    timeKnown: true,
    lines: activeMeds.map((med) => ({
      medicationId: med.id,
      selected: false,
      doseInput: defaultDoseInput(med),
      doseUnit: med.doseUnit ?? '',
      reasonInput: '',
    })),
    notes: '',
  };
}

/**
 * The edit-entry default: a selected line for every medication the event
 * actually logged a dose for (including an inactive one — its dose still
 * happened, #11), each pre-filled from its own dose snapshot, followed by an
 * unselected line for every other active medication (so the user can still
 * add one on edit).
 */
export function entryStateFromEvent(
  event: MedicationEvent,
  doses: readonly MedicationDose[],
  meds: readonly Medication[],
): MedicationEntryFormState {
  const loggedMedicationIds = new Set(doses.map((dose) => dose.medicationId));

  const loggedLines: DoseLineState[] = doses.map((dose) => ({
    medicationId: dose.medicationId,
    selected: true,
    doseInput: formatDoseNumber(dose.dose),
    doseUnit: dose.doseUnit,
    reasonInput: dose.reason ?? '',
  }));

  const otherActiveLines: DoseLineState[] = meds
    .filter((med) => med.isActive && !loggedMedicationIds.has(med.id))
    .map((med) => ({
      medicationId: med.id,
      selected: false,
      doseInput: defaultDoseInput(med),
      doseUnit: med.doseUnit ?? '',
      reasonInput: '',
    }));

  return {
    dateInput: formatDateInput(event.takenAt),
    timeInput: formatTimeInput(event.takenAt),
    timeKnown: event.timeKnown,
    lines: [...loggedLines, ...otherActiveLines],
    notes: event.notes ?? '',
  };
}

/** `timeKnown: false` lands on local noon of the date (#10) — the right day in every timezone offset. */
function parseTakenAt(state: MedicationEntryFormState) {
  return state.timeKnown ? parseDateTime(state.dateInput, state.timeInput) : parseDateTime(state.dateInput, '12:00');
}

/**
 * Validates and builds the event + dose payload from the form state. At
 * least one line must be selected; every selected line's dose must parse as
 * a number > 0 (partial doses like 0.5 are fine) and have a non-empty unit;
 * the date (+ time when `timeKnown`) must be valid; notes reuse the shared
 * 500-char rule; a reason (optional) is trimmed, blank -> null, max 60 chars.
 * Never mutates any medication — only ever reads `state`.
 */
export function buildMedicationEntry(state: MedicationEntryFormState): MedicationEntryBuildResult {
  const errors: MedicationEntryErrors = {};

  const selectedLines = state.lines.filter((line) => line.selected);
  if (selectedLines.length === 0) {
    errors.lines = 'Select at least one medication.';
  }

  const doseErrors: Record<string, string> = {};
  for (const line of selectedLines) {
    const trimmedDose = line.doseInput.trim();
    const parsedDose = trimmedDose.length > 0 ? Number(trimmedDose) : NaN;
    if (trimmedDose.length === 0 || !Number.isFinite(parsedDose) || parsedDose <= 0) {
      doseErrors[line.medicationId] = 'Dose must be a number greater than 0.';
      continue;
    }
    if (line.doseUnit.trim().length === 0) {
      doseErrors[line.medicationId] = 'Unit is required.';
    }
  }
  if (Object.keys(doseErrors).length > 0) {
    errors.doseErrors = doseErrors;
  }

  const reasonErrors: Record<string, string> = {};
  for (const line of selectedLines) {
    const reasonResult = validateReason(line.reasonInput);
    if (!reasonResult.valid) {
      reasonErrors[line.medicationId] = reasonResult.error ?? 'Invalid reason.';
    }
  }
  if (Object.keys(reasonErrors).length > 0) {
    errors.reasonErrors = reasonErrors;
  }

  const parsedDate = parseTakenAt(state);
  if (parsedDate.ms == null) {
    errors.loggedAt = parsedDate.error ?? 'Invalid date or time.';
  }

  const notesResult = validateNotes(state.notes);
  if (!notesResult.valid) {
    errors.notes = notesResult.error;
  }

  if (errors.lines || errors.doseErrors || errors.reasonErrors || errors.loggedAt || errors.notes) {
    return { valid: false, errors };
  }

  const trimmedNotes = state.notes.trim();

  return {
    valid: true,
    errors: {},
    event: {
      takenAt: parsedDate.ms as number,
      timeKnown: state.timeKnown,
      notes: trimmedNotes.length > 0 ? trimmedNotes : null,
    },
    doses: selectedLines.map((line) => ({
      medicationId: line.medicationId,
      dose: Number(line.doseInput.trim()),
      doseUnit: line.doseUnit.trim(),
      reason: validateReason(line.reasonInput).value,
    })),
  };
}
