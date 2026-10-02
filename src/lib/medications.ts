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
export const MAX_REASON_LENGTH = 60;
/** How many days the adherence line looks back (today included) — GitHub #28. */
export const ADHERENCE_WINDOW_DAYS = 30;
/** Most past-reason chips offered for one medication — GitHub #28. */
export const MAX_REASON_CHIPS = 5;
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

/** "200 mg" — the amount only (what the report's "amounts" summary counts). */
export function formatDoseAmount(dose: number, doseUnit: string): string {
  return `${formatDoseNumber(dose)} ${doseUnit}`;
}

/**
 * The shared label for one logged dose (GitHub #28): "200 mg", or
 * "200 mg — headache" when the dose has a reason. Every place a dose is
 * listed (Journal, Meds tab, history, outcome detail, the PDF's Journal)
 * goes through this via `medicationEventsToJournalItems`.
 */
export function formatDoseLabel(dose: number, doseUnit: string, reason?: string | null): string {
  const amount = formatDoseAmount(dose, doseUnit);
  const trimmed = reason?.trim() ?? '';
  return trimmed.length > 0 ? `${amount} — ${trimmed}` : amount;
}

export interface ReasonValidationResult {
  valid: boolean;
  /** Trimmed reason, or null when blank. Only meaningful when `valid`. */
  value: string | null;
  error?: string;
}

/** A dose's reason is optional: trimmed, blank -> null, at most MAX_REASON_LENGTH chars (GitHub #28). */
export function validateReason(text: string | null | undefined): ReasonValidationResult {
  const trimmed = text?.trim() ?? '';
  if (trimmed.length === 0) return { valid: true, value: null };
  if (trimmed.length > MAX_REASON_LENGTH) {
    return {
      valid: false,
      value: null,
      error: `Reason must be ${MAX_REASON_LENGTH} characters or fewer (got ${trimmed.length}).`,
    };
  }
  return { valid: true, value: trimmed };
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
    doses.push({ medicationId: med.id, dose: med.defaultDose, doseUnit: unit, reason: null });
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
  /** Why an as-needed dose was taken (GitHub #28); null when none was given. */
  reason: string | null;
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
      reason: dose.reason,
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
    const label = formatDoseAmount(record.dose, record.doseUnit);
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

// ---------------------------------------------------------------------------
// Adherence view + as-needed reasons (GitHub #28). Everything below only reads
// logged dose rows — a day without a dose is simply unknown — and
// reuses the day-counting helpers above so the Meds tab line and the PDF agree.
// ---------------------------------------------------------------------------

/** The 30 local days ending today (today included), as a half-open [start, end). */
export function adherenceWindow(now: number): MedicationUseRange {
  const today = new Date(now);
  // Date arithmetic (not 29 * 24h) so a DST change inside the window can't shift the start.
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - (ADHERENCE_WINDOW_DAYS - 1),
  ).getTime();
  return { start, end: dayBounds(now).end };
}

export interface AdherenceSummary {
  /** Distinct local days in the window with >= 1 dose of this medication. */
  daysWithDose: number;
  /**
   * Regular medications only: the local days the line is measured against —
   * the window clipped to the medication's start/end dates and its first
   * logged dose ever, never less than `daysWithDose`. Null for as-needed.
   */
  denominator: number | null;
}

/**
 * "How many days did this medication get logged?" over the last 30 local days
 * (GitHub #28). A day counts once however many doses it has. For a regular
 * medication the denominator starts at the latest of the window start, the
 * medication's `startDate` and its first logged dose ever, and ends at its
 * `endDate` when that is earlier (the same clipping as the report's
 * `daysInRange`); as-needed medications have no denominator.
 */
export function adherenceSummary(
  med: Pick<Medication, 'id' | 'startDate' | 'endDate' | 'isRegular'>,
  events: readonly MedicationEvent[],
  doses: readonly MedicationDose[],
  now: number,
): AdherenceSummary {
  const window = adherenceWindow(now);
  const records = flattenDoseRecords(events, doses).filter((record) => record.medicationId === med.id);
  const inWindow = filterDoseRecordsInRange(records, window);
  const daysWithDose = new Set(inWindow.map((record) => formatDateInput(record.takenAt))).size;

  if (!med.isRegular) return { daysWithDose, denominator: null };

  let firstDoseDayStart: number | null = null;
  for (const record of records) {
    const dayStart = dayBounds(record.takenAt).start;
    if (firstDoseDayStart == null || dayStart < firstDoseDayStart) firstDoseDayStart = dayStart;
  }
  const effectiveStart =
    med.startDate != null && firstDoseDayStart != null
      ? Math.max(med.startDate, firstDoseDayStart)
      : (med.startDate ?? firstDoseDayStart);

  return {
    daysWithDose,
    denominator: computeDaysInRange(window, { startDate: effectiveStart, endDate: med.endDate }, daysWithDose),
  };
}

/**
 * The adherence wording (GitHub #28): logged days only, never a
 * percentage. "Logged on 26 of the last 30 days", "Logged on 4 of the last 10
 * days" (a younger regular medication), "Logged on 4 days in the last 30"
 * (as-needed), or "No doses logged in the last 30 days".
 */
export function adherenceLine(med: Pick<Medication, 'isRegular'>, summary: AdherenceSummary): string {
  const { daysWithDose, denominator } = summary;
  if (daysWithDose === 0) return `No doses logged in the last ${ADHERENCE_WINDOW_DAYS} days`;
  if (med.isRegular && denominator != null) {
    return denominator === ADHERENCE_WINDOW_DAYS
      ? `Logged on ${daysWithDose} of the last ${ADHERENCE_WINDOW_DAYS} days`
      : `Logged on ${daysWithDose} of the last ${denominator} days`;
  }
  return `Logged on ${daysWithDose} ${daysWithDose === 1 ? 'day' : 'days'} in the last ${ADHERENCE_WINDOW_DAYS}`;
}

/** Every local day ('YYYY-MM-DD') this medication has at least one logged dose — the calendar's dots. */
export function doseDayKeys(
  medicationId: string,
  events: readonly MedicationEvent[],
  doses: readonly MedicationDose[],
): Set<string> {
  const keys = new Set<string>();
  for (const record of flattenDoseRecords(events, doses)) {
    if (record.medicationId === medicationId) keys.add(formatDateInput(record.takenAt));
  }
  return keys;
}

/** {@link doseDayKeys} limited to one calendar month (`month` is 1-12, as react-native-calendars reports it). */
export function doseDaysInMonth(
  medicationId: string,
  events: readonly MedicationEvent[],
  doses: readonly MedicationDose[],
  year: number,
  month: number,
): Set<string> {
  const prefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-`;
  const keys = new Set<string>();
  for (const key of doseDayKeys(medicationId, events, doses)) {
    if (key.startsWith(prefix)) keys.add(key);
  }
  return keys;
}

/**
 * The reason chips for one medication (GitHub #28): its distinct past
 * reasons, most recently logged first, case-insensitively de-duplicated
 * (first-seen = most recent casing), at most MAX_REASON_CHIPS. A reason stays
 * on offer even if the medication later became regular.
 */
export function pastReasons(
  medicationId: string,
  events: readonly MedicationEvent[],
  doses: readonly MedicationDose[],
): string[] {
  const records = flattenDoseRecords(events, doses)
    .filter((record) => record.medicationId === medicationId && record.reason != null)
    .sort((a, b) => b.takenAt - a.takenAt || b.createdAt - a.createdAt);

  const seen = new Set<string>();
  const reasons: string[] = [];
  for (const record of records) {
    const reason = record.reason?.trim() ?? '';
    if (reason.length === 0) continue;
    const key = reason.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    reasons.push(reason);
    if (reasons.length === MAX_REASON_CHIPS) break;
  }
  return reasons;
}

/** {@link pastReasons} for every non-regular medication, keyed by medication id — the entry form's chips. */
export function reasonSuggestionsByMedication(
  meds: readonly Medication[],
  events: readonly MedicationEvent[],
  doses: readonly MedicationDose[],
): Record<string, string[]> {
  const byMedication: Record<string, string[]> = {};
  for (const med of meds) {
    if (med.isRegular) continue;
    const reasons = pastReasons(med.id, events, doses);
    if (reasons.length > 0) byMedication[med.id] = reasons;
  }
  return byMedication;
}
