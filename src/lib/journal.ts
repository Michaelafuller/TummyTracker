// Pure helpers for browsing entries by day/week/month and grouping them by day.
// All date math is local-time. Ranges are half-open: [start, end).
import { formatDateInput } from './datetime';

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
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
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

export type EntryTypeFilter = 'all' | 'food' | 'bm' | 'symptom';

const FOOD_TYPES_SET = new Set(['meal', 'snack']);

/** Filter entries to all, just food (meal/snack), bowel movements, or symptoms. */
export function filterByEntryType<T extends { type: string }>(
  entries: readonly T[],
  filter: EntryTypeFilter,
): T[] {
  if (filter === 'all') return [...entries];
  if (filter === 'bm') return entries.filter((e) => e.type === 'bowel_movement');
  if (filter === 'symptom') return entries.filter((e) => e.type === 'symptom');
  return entries.filter((e) => FOOD_TYPES_SET.has(e.type));
}
