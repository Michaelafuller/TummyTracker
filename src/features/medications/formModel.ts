// Pure form model for the medication add/edit screen (HANDOFF.md #5, #6).
// Keeping this React-free (like features/bm/formModel.ts and
// features/symptoms/formModel.ts) makes the build/parse logic unit-testable
// without rendering anything.

import { DOSE_UNITS, type DoseUnit, type Medication, type MedicationReminder } from '@/db/schema';
import { formatDateInput, parseDateTime } from '@/lib/datetime';
import { validateMedication, type MedicationValidationErrors } from '@/lib/medications';
import { ALL_DAYS_MASK, validateReminder, type ReminderInput } from './reminderModel';

/** The unit chips: every fixed DOSE_UNITS value, plus "other" for the free-text field. */
export type UnitChoice = DoseUnit | 'other';

export const UNIT_CHOICES: readonly UnitChoice[] = [...DOSE_UNITS, 'other'];

/** One reminder row in the form (GitHub #29). `key` is a stable React key only — never saved. */
export interface ReminderDraft extends ReminderInput {
  key: string;
}

/** A new reminder row: 08:00, every day, on. */
export function newReminderDraft(key: string): ReminderDraft {
  return { key, hour: 8, minute: 0, daysMask: ALL_DAYS_MASK, enabled: true };
}

export interface MedicationFormState {
  name: string;
  /** Raw numeric text; '' means "no dose entered". */
  defaultDose: string;
  /** Which chip is selected, if any — null means no unit chosen yet. */
  unitChoice: UnitChoice | null;
  /** The free-text unit typed when unitChoice === 'other'. */
  otherUnitText: string;
  frequency: string;
  /** 'YYYY-MM-DD', or '' when unset (both dates are optional). */
  startDateInput: string;
  endDateInput: string;
  notes: string;
  /** Taken every day — powers "Took my regular meds" (GitHub #26). */
  isRegular: boolean;
  /** Scheduled reminders (GitHub #29), in the order shown. */
  reminders: ReminderDraft[];
}

export type MedicationFormErrors = MedicationValidationErrors & {
  /** Per-row reminder error keyed by row index (e.g. "Pick at least one day."). */
  reminders?: Record<number, string>;
};

export interface BuiltMedication {
  name: string;
  defaultDose: number | null;
  doseUnit: string | null;
  frequency: string | null;
  startDate: number | null;
  endDate: number | null;
  notes: string | null;
  isRegular: boolean;
}

export interface MedicationBuildResult {
  valid: boolean;
  medication?: BuiltMedication;
  /** The validated reminder rows to save with the medication (replaces its existing rows). */
  reminders?: ReminderInput[];
  errors: MedicationFormErrors;
}

/** The unit text that will actually be saved — the chip value, or the trimmed "Other" text. */
function resolvedUnit(state: MedicationFormState): string | null {
  if (state.unitChoice == null) return null;
  if (state.unitChoice === 'other') {
    const trimmed = state.otherUnitText.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return state.unitChoice;
}

/** A date-only input parses at local midnight (CLAUDE.md §6); '' means "not set". */
function parsedDateOnly(input: string): number | null {
  if (input.trim().length === 0) return null;
  const parsed = parseDateTime(input, '00:00');
  return parsed.ms;
}

export function buildMedication(state: MedicationFormState): MedicationBuildResult {
  const trimmedDose = state.defaultDose.trim();
  const parsedDose = trimmedDose.length > 0 ? Number(trimmedDose) : null;

  const result = validateMedication({
    name: state.name,
    defaultDose: parsedDose,
    doseUnit: resolvedUnit(state),
    frequency: state.frequency.trim().length > 0 ? state.frequency.trim() : null,
    startDate: parsedDateOnly(state.startDateInput),
    endDate: parsedDateOnly(state.endDateInput),
    notes: state.notes,
    isRegular: state.isRegular,
  });

  const reminderErrors: Record<number, string> = {};
  state.reminders.forEach((reminder, index) => {
    const error = validateReminder(reminder);
    if (error) reminderErrors[index] = error;
  });
  const hasReminderErrors = Object.keys(reminderErrors).length > 0;

  if (!result.valid || hasReminderErrors) {
    return { valid: false, errors: { ...result.errors, ...(hasReminderErrors ? { reminders: reminderErrors } : {}) } };
  }

  const trimmedNotes = state.notes.trim();
  return {
    valid: true,
    errors: {},
    reminders: state.reminders.map(({ hour, minute, daysMask, enabled }) => ({ hour, minute, daysMask, enabled })),
    medication: {
      name: state.name.trim(),
      defaultDose: parsedDose,
      doseUnit: resolvedUnit(state),
      frequency: state.frequency.trim().length > 0 ? state.frequency.trim() : null,
      startDate: parsedDateOnly(state.startDateInput),
      endDate: parsedDateOnly(state.endDateInput),
      notes: trimmedNotes.length > 0 ? trimmedNotes : null,
      isRegular: state.isRegular,
    },
  };
}

/** Seeds the edit-screen form from a saved medication row and its reminder rows. */
export function medicationToFormState(med: Medication, reminders: readonly MedicationReminder[] = []): MedicationFormState {
  const isKnownUnit = med.doseUnit != null && (DOSE_UNITS as readonly string[]).includes(med.doseUnit);
  const unitChoice: UnitChoice | null =
    med.doseUnit == null ? null : isKnownUnit ? (med.doseUnit as DoseUnit) : 'other';

  return {
    name: med.name,
    defaultDose: med.defaultDose != null ? String(med.defaultDose) : '',
    unitChoice,
    otherUnitText: unitChoice === 'other' ? (med.doseUnit ?? '') : '',
    frequency: med.frequency ?? '',
    startDateInput: med.startDate != null ? formatDateInput(med.startDate) : '',
    endDateInput: med.endDate != null ? formatDateInput(med.endDate) : '',
    notes: med.notes ?? '',
    isRegular: med.isRegular,
    reminders: reminders.map((r) => ({
      key: r.id,
      hour: r.hour,
      minute: r.minute,
      daysMask: r.daysMask,
      enabled: r.enabled,
    })),
  };
}

/**
 * True when the form has a default dose > 0 and a unit — what a reminder's
 * "Took them" button needs. Drives the one-line hint in the Reminders block.
 */
export function hasDefaultDoseAndUnit(state: MedicationFormState): boolean {
  const dose = Number(state.defaultDose.trim());
  return state.defaultDose.trim().length > 0 && dose > 0 && resolvedUnit(state) !== null;
}
