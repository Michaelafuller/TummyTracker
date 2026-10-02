// Pure medication-reminder model (GitHub #29). No expo-notifications import
// here, so this stays unit-testable (mirrors checkin/dayCheckInModel.ts). A
// reminder only ever schedules a notification — nothing in this file (or the
// service/hook built on it) writes a dose except the explicit "Took them"
// action's handler, via `tookDoses`.

import type { MedicationDoseInput } from '@/db/repository';
import type { Medication, MedicationReminder } from '@/db/schema';
import type { ResponseLike } from '@/features/checkin/dayCheckInModel';
import { activeDefaultDose } from '@/lib/medications';

/** Stored in a scheduled notification's `content.data.slot`; the ONLY slot this feature cancels or reschedules. */
export const MED_REMINDER_SLOT = 'med-reminder';
/** Category with the "Took them" button (every medication due has a default dose + unit). */
export const MED_REMINDER_CATEGORY_TOOK = 'med-reminder-took';
/** Category without any button — tapping the notification still opens the entry form. */
export const MED_REMINDER_CATEGORY_PLAIN = 'med-reminder-plain';
export const MED_REMINDER_TOOK_ACTION = 'med-reminder-took-action';
/** `Notifications.DEFAULT_ACTION_IDENTIFIER`'s value — a plain tap on the notification body. */
export const DEFAULT_TAP_ACTION = 'expo.modules.notifications.actions.DEFAULT';

// ---- Weekday mask -------------------------------------------------------

/** Bit 0 = Monday ... bit 6 = Sunday. */
export const ALL_DAYS_MASK = 127;
/** Single-letter chip labels, Monday first. */
export const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
/** Full names (accessibility labels), Monday first. */
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** Whether `dayIndex` (0 = Monday ... 6 = Sunday) is set in the mask. */
export function maskHas(mask: number, dayIndex: number): boolean {
  return dayIndex >= 0 && dayIndex <= 6 && (mask & (1 << dayIndex)) !== 0;
}

/** Builds a mask from day indexes (0 = Monday ... 6 = Sunday); out-of-range and repeated values are ignored. */
export function maskFromDays(days: readonly number[]): number {
  let mask = 0;
  for (const day of days) {
    if (Number.isInteger(day) && day >= 0 && day <= 6) mask |= 1 << day;
  }
  return mask;
}

/** The day indexes set in the mask, ascending. */
export function daysFromMask(mask: number): number[] {
  const days: number[] = [];
  for (let day = 0; day <= 6; day++) {
    if (maskHas(mask, day)) days.push(day);
  }
  return days;
}

/**
 * Maps our day index (0 = Monday ... 6 = Sunday) to expo-notifications'
 * WEEKLY trigger `weekday` (1 = Sunday, 2 = Monday ... 7 = Saturday).
 */
export function expoWeekday(dayIndex: number): number {
  return ((dayIndex + 1) % 7) + 1;
}

// ---- Validation ---------------------------------------------------------

/** A reminder as the medication form edits/saves it (id and timestamps are filled in by the repository). */
export interface ReminderInput {
  hour: number;
  minute: number;
  daysMask: number;
  enabled: boolean;
}

/** An error message for an unusable reminder, or null when it is fine. */
export function validateReminder(r: ReminderInput): string | null {
  const timeOk =
    Number.isInteger(r.hour) && r.hour >= 0 && r.hour <= 23 && Number.isInteger(r.minute) && r.minute >= 0 && r.minute <= 59;
  if (!timeOk) return 'Pick a valid time.';
  if (!Number.isInteger(r.daysMask) || r.daysMask < 1 || r.daysMask > ALL_DAYS_MASK) {
    return 'Pick at least one day.';
  }
  return null;
}

// ---- Slots --------------------------------------------------------------

/** One notification to schedule: every medication due at (weekday, hour, minute). */
export interface ReminderSlot {
  /** expo WEEKLY `weekday`: 1 = Sunday ... 7 = Saturday. */
  weekday: number;
  hour: number;
  minute: number;
  /** In the Meds-list order of the `meds` given. */
  medicationIds: string[];
  /** True only when every listed medication has a default dose > 0 and a unit — the "Took them" button needs that. */
  canTake: boolean;
}

type ReminderRow = Pick<MedicationReminder, 'medicationId' | 'hour' | 'minute' | 'daysMask' | 'enabled'>;

/**
 * Groups every enabled reminder of an ACTIVE medication by (weekday, hour,
 * minute). A medication marked inactive keeps its reminder rows but they are
 * not scheduled; reactivating brings them back. Rows with an unusable time or
 * mask are ignored rather than thrown on. Output is ordered by weekday, then
 * time, so scheduling is deterministic.
 */
export function reminderSlots(meds: readonly Medication[], reminders: readonly ReminderRow[]): ReminderSlot[] {
  const activeIds = new Set<string>();
  for (const med of meds) {
    if (med.isActive) activeIds.add(med.id);
  }

  const groups = new Map<string, { weekday: number; hour: number; minute: number; ids: Set<string> }>();
  for (const reminder of reminders) {
    if (!reminder.enabled || !activeIds.has(reminder.medicationId)) continue;
    if (validateReminder(reminder) !== null) continue;
    for (const day of daysFromMask(reminder.daysMask)) {
      const weekday = expoWeekday(day);
      const key = `${weekday}:${reminder.hour}:${reminder.minute}`;
      const group = groups.get(key) ?? { weekday, hour: reminder.hour, minute: reminder.minute, ids: new Set<string>() };
      group.ids.add(reminder.medicationId);
      groups.set(key, group);
    }
  }

  const slots: ReminderSlot[] = [];
  for (const group of groups.values()) {
    const due = meds.filter((med) => group.ids.has(med.id));
    slots.push({
      weekday: group.weekday,
      hour: group.hour,
      minute: group.minute,
      medicationIds: due.map((med) => med.id),
      canTake: due.every((med) => activeDefaultDose(med) !== null),
    });
  }
  slots.sort((a, b) => a.weekday - b.weekday || a.hour - b.hour || a.minute - b.minute);
  return slots;
}

// ---- Copy ---------------------------------------------------------------

export function reminderTitle(): string {
  return 'Medication reminder';
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function reminderBody(names: readonly string[]): string {
  return `Time for ${joinNames(names)}`;
}

// ---- Responses ----------------------------------------------------------

export interface MedReminderResponse {
  kind: 'took' | 'open';
  medicationIds: string[];
}

/**
 * Reads what a notification response asks for. Null for anything that is not
 * OURS: another slot, an action we did not register, or missing/bad
 * `data.medicationIds`. A plain tap on the body is `open`; the "Took them"
 * button is `took`.
 */
export function parseMedReminderResponse(r: ResponseLike): MedReminderResponse | null {
  const data = r.notification.request.content.data;
  if (!data || data.slot !== MED_REMINDER_SLOT) return null;

  const ids = data.medicationIds;
  if (!Array.isArray(ids) || ids.length === 0) return null;
  if (!ids.every((id): id is string => typeof id === 'string' && id.length > 0)) return null;

  if (r.actionIdentifier === MED_REMINDER_TOOK_ACTION) return { kind: 'took', medicationIds: [...ids] };
  if (r.actionIdentifier === DEFAULT_TAP_ACTION) return { kind: 'open', medicationIds: [...ids] };
  return null;
}

/**
 * The doses a "Took them" tap logs: of the medications the notification
 * listed, only those still active with a default dose + unit, at their
 * CURRENT defaults (never stale scheduling-time data), in the order of `meds`.
 * Empty when none qualify — the caller then falls back to the entry form.
 */
export function tookDoses(meds: readonly Medication[], medicationIds: readonly string[]): MedicationDoseInput[] {
  const wanted = new Set(medicationIds);
  const doses: MedicationDoseInput[] = [];
  for (const med of meds) {
    if (!wanted.has(med.id)) continue;
    const dose = activeDefaultDose(med);
    if (dose) doses.push(dose);
  }
  return doses;
}
