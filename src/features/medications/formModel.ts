// Pure form model for the medication add/edit screen (HANDOFF.md #5, #6).
// Keeping this React-free (like features/bm/formModel.ts and
// features/symptoms/formModel.ts) makes the build/parse logic unit-testable
// without rendering anything.

import { DOSE_UNITS, type DoseUnit, type Medication } from '@/db/schema';
import { formatDateInput, parseDateTime } from '@/lib/datetime';
import { validateMedication, type MedicationValidationErrors } from '@/lib/medications';

/** The unit chips: every fixed DOSE_UNITS value, plus "other" for the free-text field. */
export type UnitChoice = DoseUnit | 'other';

export const UNIT_CHOICES: readonly UnitChoice[] = [...DOSE_UNITS, 'other'];

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
}

export type MedicationFormErrors = MedicationValidationErrors;

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

  if (!result.valid) {
    return { valid: false, errors: result.errors };
  }

  const trimmedNotes = state.notes.trim();
  return {
    valid: true,
    errors: {},
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

/** Seeds the edit-screen form from a saved medication row. */
export function medicationToFormState(med: Medication): MedicationFormState {
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
  };
}
