// Pure date/time helpers for editing a log entry's `loggedAt` without a native
// date picker. Inputs are split into a date field (YYYY-MM-DD) and a time field
// (HH:MM), parsed/formatted in the device's local timezone.

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Format an epoch-ms timestamp to a local 'YYYY-MM-DD' date string. */
export function formatDateInput(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Format an epoch-ms timestamp to a local long date, e.g. 'August 21, 2026'. Uses
 *  Date getters (not toLocaleDateString) so output is deterministic in Jest and on Hermes. */
export function formatLongDate(epochMs: number): string {
  const d = new Date(epochMs);
  return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Format an epoch-ms timestamp to a local 'HH:MM' time string. */
export function formatTimeInput(epochMs: number): string {
  const d = new Date(epochMs);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export interface ParsedDateTime {
  /** Epoch ms, or null when the inputs are invalid. */
  ms: number | null;
  error?: string;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

/**
 * Combine a 'YYYY-MM-DD' date and 'HH:MM' time into an epoch-ms timestamp in local
 * time. Rejects malformed strings and impossible dates (e.g. 2025-02-30) by checking
 * that the constructed Date round-trips to the same components.
 */
export function parseDateTime(dateInput: string, timeInput: string): ParsedDateTime {
  const dateMatch = DATE_RE.exec(dateInput.trim());
  const timeMatch = TIME_RE.exec(timeInput.trim());
  if (!dateMatch || !timeMatch) {
    return { ms: null, error: 'Use date YYYY-MM-DD and time HH:MM.' };
  }

  const [, yearStr, monthStr, dayStr] = dateMatch;
  const [, hourStr, minuteStr] = timeMatch;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return { ms: null, error: 'Date or time is out of range.' };
  }

  const d = new Date(year, month - 1, day, hour, minute, 0, 0);
  // Reject overflow (e.g. Feb 30 rolling into March).
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day ||
    d.getHours() !== hour ||
    d.getMinutes() !== minute
  ) {
    return { ms: null, error: 'That date does not exist.' };
  }

  return { ms: d.getTime() };
}

export interface ClockTime {
  hour: number;
  minute: number;
}

/** Format an hour/minute as 'HH:MM'. */
export function formatClock(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** Parse an 'HH:MM' clock time (00:00–23:59) to { hour, minute }, or null. */
export function parseClockTime(input: string): ClockTime | null {
  const match = TIME_RE.exec(input.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** Format an hour/minute (0–23) as a 12-hour clock string, e.g. '3:07 PM'. No leading zero on hour. */
export function formatClock12h(hour: number, minute: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${pad2(minute)} ${period}`;
}

/** Format an epoch-ms timestamp as a local 12-hour clock string, e.g. '3:07 PM'. */
export function formatTime12h(epochMs: number): string {
  const d = new Date(epochMs);
  return formatClock12h(d.getHours(), d.getMinutes());
}

/**
 * Local-time day bounds for the day containing `epochMs`: midnight
 * (00:00:00.000 local) through the following midnight — `end` is exclusive,
 * so a timestamp `t` falls in this day iff `start <= t < end`. Built by
 * mutating a `Date` to local midnight and stepping the day field forward by
 * one, so DST transitions (23/25-hour local days) are handled by the `Date`
 * engine rather than a fixed-24h-offset assumption.
 */
export function dayBounds(epochMs: number): { start: number; end: number } {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  const start = d.getTime();
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
  return { start, end };
}
