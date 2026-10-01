// Pure helpers for the medication inventory (Medications Cycle A, HANDOFF.md
// #5, #11). No React, no I/O — the primary test target for this cycle.
// Analysis-ready dose helpers here never infer a dose from a schedule
// (invariant, HANDOFF.md §0): they only ever summarize rows a caller already
// has (Cycle B writes those rows; the UI and any future insights consume them).

import type { MedicationDoseInput } from '@/db/repository';
import { DOSE_UNITS, type Medication, type MedicationDose, type MedicationEvent } from '@/db/schema';
import { dayBounds, formatDateInput } from '@/lib/datetime';
import { validateNotes } from '@/lib/validation';

export const MAX_MEDICATION_NAME_LENGTH = 100;
export const MAX_OTHER_UNIT_LENGTH = 20;
export const REGULAR_NEEDS_DOSE_ERROR = 'A regular medication needs a default dose and unit.';

export interface MedicationInput {
  name: string;
  defaultDose?: number | null;
  doseUnit?: string | null;
  frequency?: string | null;
  startDate?: number | null;
  endDate?: number | null;
  notes?: string | null;
  /** Taken every day (GitHub #26) — requires a default dose and unit. */
  isRegular?: boolean;
}

export interface MedicationValidationErrors {
  name?: string;
  defaultDose?: string;
  doseUnit?: string;
  endDate?: string;
  notes?: string;
}

export interface MedicationValidationResult {
  valid: boolean;
  errors: MedicationValidationErrors;
}

/**
 * Validates a medication's inventory fields (owner decisions, HANDOFF.md):
 * name is required (trimmed, ≤ 100 chars); `defaultDose` is optional but must
 * be > 0 when present; a unit is required whenever a dose is given (whether a
 * DOSE_UNITS chip or the "Other" free-text field, both stored in the same
 * `doseUnit` string — the "Other" text is capped at 20 chars); `endDate` must
 * be on or after `startDate` when both are set; notes reuse the existing 500-
 * char rule. A regular medication (GitHub #26) must have a default dose, and
 * therefore a unit — the dose-field error "A regular medication needs a
 * default dose and unit." is shown when the dose is missing.
 */
export function validateMedication(input: MedicationInput): MedicationValidationResult {
  const errors: MedicationValidationErrors = {};

  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    errors.name = 'Name is required.';
  } else if (trimmedName.length > MAX_MEDICATION_NAME_LENGTH) {
    errors.name = `Name must be ${MAX_MEDICATION_NAME_LENGTH} characters or fewer.`;
  }

  if (input.isRegular && input.defaultDose == null) {
    errors.defaultDose = REGULAR_NEEDS_DOSE_ERROR;
  }

  if (input.defaultDose != null) {
    if (typeof input.defaultDose !== 'number' || !Number.isFinite(input.defaultDose) || input.defaultDose <= 0) {
      errors.defaultDose = 'Dose must be a number greater than 0.';
    }

    const unit = input.doseUnit?.trim() ?? '';
    if (unit.length === 0) {
      errors.doseUnit = 'Unit is required when a dose is given.';
    } else if (unit.length > MAX_OTHER_UNIT_LENGTH) {
      errors.doseUnit = `Unit must be ${MAX_OTHER_UNIT_LENGTH} characters or fewer.`;
    }
  }

  if (input.startDate != null && input.endDate != null && input.endDate < input.startDate) {
    errors.endDate = 'End date must be on or after the start date.';
  }

  const notesResult = validateNotes(input.notes);
  if (!notesResult.valid) {
    errors.notes = notesResult.error;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Formats a dose number without trailing zeros (0.5, not 0.50; 10, not 10.00). */
export function formatDoseNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(parseFloat(value.toFixed(2)));
}

export interface DoseSummarySource {
  defaultDose: number | null;
  doseUnit: string | null;
  frequency: string | null;
}

/**
 * The secondary line on a medication's list row, e.g. "10 mg · twice daily",
 * "10 mg", "twice daily", or "" when neither is set.
 */
export function formatDoseSummary(med: DoseSummarySource): string {
  const dose =
    med.defaultDose != null && med.doseUnit ? `${formatDoseNumber(med.defaultDose)} ${med.doseUnit}` : null;
  const frequency = med.frequency?.trim() ? med.frequency.trim() : null;

  if (dose && frequency) return `${dose} · ${frequency}`;
  if (dose) return dose;
  if (frequency) return frequency;
  return '';
}

/**
 * The doses "Took my regular meds" logs (GitHub #26): every medication that is
 * active AND regular AND has a default dose > 0 and a non-empty unit, in the
 * order given (the Meds tab's order). Each dose is a snapshot of the
 * medication's current default dose/unit; nothing is inferred from `frequency`
 * (invariant, HANDOFF.md §0).
 */
export function regularDoses(meds: readonly Medication[]): MedicationDoseInput[] {
  const doses: MedicationDoseInput[] = [];
  for (const med of meds) {
    if (!med.isActive || !med.isRegular) continue;
    const unit = med.doseUnit?.trim() ?? '';
    if (med.defaultDose == null || !(med.defaultDose > 0) || unit.length === 0) continue;
    doses.push({ medicationId: med.id, dose: med.defaultDose, doseUnit: unit });
  }
  return doses;
}

// Re-exported so callers only need one import for the fixed unit list.
export { DOSE_UNITS };

/**
 * One dose, flattened for analysis (#11): a `medication_dose` row joined to
 * its parent `medication_event` row. `entryId` is the dose row's own id
 * (mirrors `logEntry`'s `id` naming so Cycle B's UI/Journal code can treat
 * this the same shape as a log entry); `notes` comes from the EVENT, not the
 * medication (a medication's own notes are never per-dose).
 */
export interface DoseRecord {
  entryId: string;
  eventId: string;
  medicationId: string;
  takenAt: number;
  timeKnown: boolean;
  dose: number;
  doseUnit: string;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Joins `medication_dose` rows to their parent `medication_event` row.
 * A dose whose event can't be found (should not happen — events/doses are
 * always written together, Cycle B) is skipped defensively rather than
 * thrown, since this only ever informs read-side analysis/UI.
 */
export function flattenDoseRecords(
  events: readonly MedicationEvent[],
  doses: readonly MedicationDose[],
): DoseRecord[] {
  const eventsById = new Map(events.map((event) => [event.id, event] as const));
  const records: DoseRecord[] = [];

  for (const dose of doses) {
    const event = eventsById.get(dose.eventId);
    if (!event) continue;
    records.push({
      entryId: dose.id,
      eventId: dose.eventId,
      medicationId: dose.medicationId,
      takenAt: event.takenAt,
      timeKnown: event.timeKnown,
      dose: dose.dose,
      doseUnit: dose.doseUnit,
      notes: event.notes,
      createdAt: dose.createdAt,
      updatedAt: dose.updatedAt,
    });
  }

  return records;
}

export interface DoseRecordRange {
  start: number;
  end: number;
}

/** Half-open [start, end) filter over `takenAt`, matching lib/journal.ts's range semantics. */
export function filterDoseRecordsInRange(
  records: readonly DoseRecord[],
  range: DoseRecordRange,
): DoseRecord[] {
  return records.filter((record) => record.takenAt >= range.start && record.takenAt < range.end);
}

/** Groups dose records by `medicationId` — stable across a medication rename/deactivation. */
export function groupDoseRecordsByMedication(records: readonly DoseRecord[]): Map<string, DoseRecord[]> {
  const groups = new Map<string, DoseRecord[]>();
  for (const record of records) {
    const existing = groups.get(record.medicationId);
    if (existing) {
      existing.push(record);
    } else {
      groups.set(record.medicationId, [record]);
    }
  }
  return groups;
}

/**
 * Whether a medication has a recorded dose on the local day starting at
 * `dayStartMs` (00:00:00.000 local through the next midnight, exclusive).
 * Always `false` when there is no record — nothing is ever inferred from a
 * medication's frequency/schedule (invariant, HANDOFF.md §0).
 */
export function wasTakenOn(
  records: readonly DoseRecord[],
  medicationId: string,
  dayStartMs: number,
): boolean {
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
  return records.some(
    (record) =>
      record.medicationId === medicationId && record.takenAt >= dayStartMs && record.takenAt < dayEndMs,
  );
}

export interface MedicationUseRange {
  start: number;
  end: number;
}

/**
 * Per-medication use summary for the doctor report (GitHub #17). Every count
 * comes only from logged dose rows — never `frequency`, `startDate`/`endDate`
 * or `isActive` (HANDOFF.md §0 invariant: "nothing is inferred as taken").
 */
export interface MedicationUseSummary {
  medicationId: string;
  name: string;
  isActive: boolean;
  /** As the user typed it, for context only — never used to compute a count. */
  frequency: string | null;
  /** Dose rows in range. */
  dosesLogged: number;
  /** Distinct local days (formatDateInput) in range with >= 1 dose. */
  daysWithDose: number;
  /** Local days in range, clipped to the medication's own dates and clamped
   *  up to daysWithDose (see summarizeMedicationUse). */
  daysInRange: number;
  /** Distinct snapshot amounts, most frequent first; ties keep first-seen order. */
  amounts: { label: string; count: number }[];
}

/** Counts local calendar days in the half-open [startMs, endMs) range, stepping
 *  a Date (DST-safe) rather than dividing by a fixed day length. */
function countLocalDays(startMs: number, endMs: number): number {
  if (endMs <= startMs) return 0;
  const cursor = new Date(startMs);
  cursor.setHours(0, 0, 0, 0);
  let count = 0;
  while (cursor.getTime() < endMs) {
    count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/**
 * The days-in-range denominator for one medication: the report's own
 * [range.start, range.end) window, clipped to the medication's own
 * startDate/endDate when set (both local-midnight epoch ms; endDate is
 * inclusive of that day, so its exclusive boundary is endDate + 1 day), and
 * never less than `daysWithDose` — a dose logged outside the stated dates
 * still counts, so the denominator is clamped up rather than hiding it.
 */
function computeDaysInRange(
  range: MedicationUseRange,
  med: Pick<Medication, 'startDate' | 'endDate'>,
  daysWithDose: number,
): number {
  const effectiveStart = med.startDate != null ? Math.max(range.start, med.startDate) : range.start;
  // Next local midnight after endDate — not endDate + 24h, which lands an hour
  // off on a DST day and could count an extra day.
  const effectiveEnd = med.endDate != null ? Math.min(range.end, dayBounds(med.endDate).end) : range.end;
  return Math.max(countLocalDays(effectiveStart, effectiveEnd), daysWithDose);
}

/** Distinct dose-snapshot amounts, most frequent first; ties keep first-seen order
 *  (Map iteration order + a stable sort). */
function summarizeAmounts(records: readonly DoseRecord[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    const label = `${formatDoseNumber(record.dose)} ${record.doseUnit}`;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Summarizes logged medication use over `range` for the doctor report
 * (GitHub #17). Includes every medication with >= 1 dose in range (active or
 * not — an inactive medication's dose history is still real, #11 invariant),
 * plus every active medication with none (so a clinician sees "Omeprazole —
 * no doses logged"). An inactive medication with no doses in range is left
 * out entirely. Ordered: medications with doses first (most `dosesLogged`
 * first), then the active ones with none (A–Z).
 */
export function summarizeMedicationUse(
  meds: readonly Medication[],
  events: readonly MedicationEvent[],
  doses: readonly MedicationDose[],
  range: MedicationUseRange,
): MedicationUseSummary[] {
  const recordsInRange = filterDoseRecordsInRange(flattenDoseRecords(events, doses), range);
  const byMedication = groupDoseRecordsByMedication(recordsInRange);

  const withDoses: MedicationUseSummary[] = [];
  const withoutDoses: MedicationUseSummary[] = [];

  for (const med of meds) {
    const records = byMedication.get(med.id) ?? [];
    if (records.length === 0 && !med.isActive) continue;

    const daysWithDose = new Set(records.map((record) => formatDateInput(record.takenAt))).size;
    const summary: MedicationUseSummary = {
      medicationId: med.id,
      name: med.name,
      isActive: med.isActive,
      frequency: med.frequency,
      dosesLogged: records.length,
      daysWithDose,
      daysInRange: computeDaysInRange(range, med, daysWithDose),
      amounts: summarizeAmounts(records),
    };

    if (records.length > 0) {
      withDoses.push(summary);
    } else {
      withoutDoses.push(summary);
    }
  }

  withDoses.sort((a, b) => b.dosesLogged - a.dosesLogged);
  withoutDoses.sort((a, b) => a.name.localeCompare(b.name));

  return [...withDoses, ...withoutDoses];
}
