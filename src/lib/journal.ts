// Pure helpers for browsing entries by day/week/month and grouping them by day.
// All date math is local-time. Ranges are half-open: [start, end).
import type { LogEntry, Medication, MedicationDose, MedicationEvent } from '@/db/schema';
import { formatDoseNumber } from '@/lib/medications';
import { formatDateInput, MONTHS_LONG } from './datetime';

export type CalendarMode = 'day' | 'week' | 'month';

export interface DateRange {
  start: number;
  end: number;
}

export interface DayGroup<T> {
  /** Local 'YYYY-MM-DD' key for the day. */
  key: string;
  entries: T[];
}

function startOfDay(epochMs: number): Date {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * The half-open [start, end) range covering the period that contains `anchorMs`,
 * for the given mode. Weeks start on Sunday (react-native-calendars default).
 */
export function getPeriodRange(anchorMs: number, mode: CalendarMode): DateRange {
  const day = startOfDay(anchorMs);

  if (mode === 'day') {
    return { start: day.getTime(), end: addDays(day, 1).getTime() };
  }

  if (mode === 'week') {
    const weekStart = addDays(day, -day.getDay()); // back to Sunday
    return { start: weekStart.getTime(), end: addDays(weekStart, 7).getTime() };
  }

  // month
  const monthStart = new Date(day.getFullYear(), day.getMonth(), 1);
  const monthEnd = new Date(day.getFullYear(), day.getMonth() + 1, 1);
  return { start: monthStart.getTime(), end: monthEnd.getTime() };
}

export function filterEntriesInRange<T extends { loggedAt: number }>(
  entries: readonly T[],
  range: DateRange,
): T[] {
  return entries.filter((e) => e.loggedAt >= range.start && e.loggedAt < range.end);
}

/**
 * Group entries by local day, newest day first and newest entry first within a day.
 */
export function groupEntriesByDay<T extends { loggedAt: number }>(
  entries: readonly T[],
): DayGroup<T>[] {
  const sorted = [...entries].sort((a, b) => b.loggedAt - a.loggedAt);
  const groups: DayGroup<T>[] = [];
  const byKey = new Map<string, DayGroup<T>>();

  for (const entry of sorted) {
    const key = formatDateInput(entry.loggedAt);
    let group = byKey.get(key);
    if (!group) {
      group = { key, entries: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }

  return groups;
}

/** Unique local day keys that have at least one entry — for calendar dot marking. */
export function entryDateKeys<T extends { loggedAt: number }>(entries: readonly T[]): string[] {
  return Array.from(new Set(entries.map((e) => formatDateInput(e.loggedAt))));
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Human label for the period the calendar mode currently covers, e.g.
 * "Fri, Jun 27" (day), "Jun 21 – 27" (week), "June 2026" (month). Drives a visible
 * header so toggling Day/Week/Month has an obvious effect.
 */
export function formatPeriodLabel(anchorMs: number, mode: CalendarMode): string {
  if (mode === 'day') {
    const d = new Date(anchorMs);
    return `${WEEKDAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  }

  if (mode === 'week') {
    const range = getPeriodRange(anchorMs, mode);
    const start = new Date(range.start);
    const end = new Date(range.end - 1); // inclusive last day of the week
    if (start.getMonth() === end.getMonth()) {
      return `${MONTHS_SHORT[start.getMonth()]} ${start.getDate()} – ${end.getDate()}`;
    }
    return `${MONTHS_SHORT[start.getMonth()]} ${start.getDate()} – ${MONTHS_SHORT[end.getMonth()]} ${end.getDate()}`;
  }

  const d = new Date(anchorMs);
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** 'meds' is a Journal-item-only filter (medication events have no `type` field) — see filterJournalItems. */
export type EntryTypeFilter = 'all' | 'food' | 'bm' | 'symptom' | 'meds';

const FOOD_TYPES_SET = new Set(['meal', 'snack']);

/**
 * Filter log entries to all, just food (meal/snack), bowel movements, or
 * symptoms. `'meds'` has no log-entry meaning (there is no medication
 * `type` value here) and returns everything, same as `'all'` — callers that
 * also carry medication items filter those separately via
 * `filterJournalItems`, which is `'meds'`'s real home.
 */
export function filterByEntryType<T extends { type: string }>(
  entries: readonly T[],
  filter: EntryTypeFilter,
): T[] {
  if (filter === 'bm') return entries.filter((e) => e.type === 'bowel_movement');
  if (filter === 'symptom') return entries.filter((e) => e.type === 'symptom');
  if (filter === 'food') return entries.filter((e) => FOOD_TYPES_SET.has(e.type));
  return [...entries];
}

/**
 * One row in the merged Journal (HANDOFF.md §3.2, §5): either a `logEntry`
 * (food/BM/symptom, unchanged) or a medication event summarizing its doses.
 * `loggedAt` on both variants is what every range/day-grouping helper below
 * already keys on, so the merged list reuses `filterEntriesInRange` /
 * `groupEntriesByDay` / `entryDateKeys` without a fork.
 */
export type JournalItem =
  | { kind: 'log'; id: string; loggedAt: number; entry: LogEntry }
  | {
      kind: 'medication';
      /** The event's id. */
      id: string;
      loggedAt: number;
      timeKnown: boolean;
      /** e.g. "Omeprazole 20 mg · Ibuprofen 200 mg", built from each dose's own snapshot. */
      summary: string;
      notes: string | null;
    };

/** The `kind: 'medication'` branch of `JournalItem`, named for callers (e.g.
 * MedicationEventRow, lookback.ts) that only ever handle medication items. */
export type MedicationJournalItem = Extract<JournalItem, { kind: 'medication' }>;

/** Wraps log entries as Journal items — unchanged, just re-shaped so they merge with medication items. */
export function logEntriesToJournalItems(entries: readonly LogEntry[]): JournalItem[] {
  return entries.map((entry) => ({ kind: 'log', id: entry.id, loggedAt: entry.loggedAt, entry }));
}

/**
 * Maps medication events to Journal items, one per event, newest-in/newest-
 * out order preserved. The summary uses each medication's CURRENT name
 * (inactive included — HANDOFF.md #11 invariant: never deleted, still shown)
 * with the DOSE'S OWN snapshot `dose`/`doseUnit` — never the medication's
 * current default, so a later dosage change never rewrites history. An event
 * whose medication row can't be found (shouldn't happen — medications are
 * never deleted) shows "Unknown medication" defensively.
 */
export function medicationEventsToJournalItems(
  events: readonly MedicationEvent[],
  doses: readonly MedicationDose[],
  meds: readonly Medication[],
): JournalItem[] {
  const medsById = new Map(meds.map((med) => [med.id, med] as const));
  const dosesByEvent = new Map<string, MedicationDose[]>();
  for (const dose of doses) {
    const existing = dosesByEvent.get(dose.eventId);
    if (existing) {
      existing.push(dose);
    } else {
      dosesByEvent.set(dose.eventId, [dose]);
    }
  }

  return events.map((event) => {
    const eventDoses = dosesByEvent.get(event.id) ?? [];
    const summary = eventDoses
      .map((dose) => {
        const name = medsById.get(dose.medicationId)?.name ?? 'Unknown medication';
        return `${name} ${formatDoseNumber(dose.dose)} ${dose.doseUnit}`;
      })
      .join(' · ');

    return {
      kind: 'medication',
      id: event.id,
      loggedAt: event.takenAt,
      timeKnown: event.timeKnown,
      summary,
      notes: event.notes,
    };
  });
}

/**
 * Filters merged Journal items. `'all'` keeps everything; `'meds'` keeps only
 * medication items; `'food'|'bm'|'symptom'` keep only log items of that type
 * (medication items are excluded, matching the design contract: medications
 * appear in the Journal only under the dedicated "Meds" chip).
 */
export function filterJournalItems(items: readonly JournalItem[], filter: EntryTypeFilter): JournalItem[] {
  if (filter === 'all') return [...items];
  if (filter === 'meds') return items.filter((item) => item.kind === 'medication');

  const logItems = items.filter((item): item is Extract<JournalItem, { kind: 'log' }> => item.kind === 'log');
  const keepIds = new Set(filterByEntryType(logItems.map((item) => item.entry), filter).map((entry) => entry.id));
  return logItems.filter((item) => keepIds.has(item.entry.id));
}

/** The palette slice the Journal calendars are themed from (both modes share these keys). */
export type CalendarPalette = Record<
  | 'background'
  | 'text'
  | 'textSecondary'
  | 'accent'
  | 'accentText'
  | 'primary'
  | 'primaryText',
  string
>;

/**
 * react-native-calendars theme for the Journal's week strip and month grid.
 * Today and the selected day must never look alike: the selected day keeps
 * the accent (violet/lavender) fill, today gets the teal primary fill with
 * primaryText (7.0:1 in both modes, same pair as the CTAs). When today IS the
 * selected day, the library draws the selected style on top.
 */
export function buildCalendarTheme(palette: CalendarPalette) {
  return {
    calendarBackground: palette.background,
    dayTextColor: palette.text,
    monthTextColor: palette.text,
    textSectionTitleColor: palette.textSecondary,
    todayTextColor: palette.primaryText,
    todayBackgroundColor: palette.primary,
    todayDotColor: palette.primaryText,
    selectedDayBackgroundColor: palette.accent,
    selectedDayTextColor: palette.accentText,
    dotColor: palette.accent,
    arrowColor: palette.accent,
  };
}
