// Pure day-coverage helper (GitHub #13, Insights "X of Y days covered"). The
// correlation engine (src/features/analysis/*) is unchanged this cycle — this
// is a separate, purely descriptive read of how many recent days have any
// activity at all (a log entry or a day check-in answer).

import { formatDateInput } from './datetime';

export const COVERAGE_WINDOW_DAYS = 28;

export interface DayCoverage {
  covered: number;
  total: number;
  checkedIn: number;
}

/**
 * Coverage over the last `windowDays` local calendar days ending today
 * (inclusive). `covered` counts a day with >= 1 entry OR a check-in;
 * `checkedIn` counts a day with a check-in specifically. The window's start
 * is clipped to the earliest day with any activity at all (earliest entry
 * day or earliest check-in date — 'YYYY-MM-DD' compares correctly as a
 * plain string) so someone who started 10 days ago sees "of 10", not "of
 * 28". Entries/check-ins dated after today are ignored. Returns null when
 * there is no activity at all (the caller hides the line).
 */
export function dayCoverage(
  entries: readonly { loggedAt: number }[],
  checkIns: readonly { date: string }[],
  now: number,
  windowDays = COVERAGE_WINDOW_DAYS,
): DayCoverage | null {
  const todayKey = formatDateInput(now);

  const entryDates = new Set<string>();
  for (const entry of entries) {
    const key = formatDateInput(entry.loggedAt);
    if (key <= todayKey) entryDates.add(key);
  }

  const checkInDates = new Set<string>();
  for (const checkIn of checkIns) {
    if (checkIn.date <= todayKey) checkInDates.add(checkIn.date);
  }

  if (entryDates.size === 0 && checkInDates.size === 0) return null;

  let earliest: string | null = null;
  for (const key of entryDates) {
    if (earliest === null || key < earliest) earliest = key;
  }
  for (const key of checkInDates) {
    if (earliest === null || key < earliest) earliest = key;
  }

  // Step a Date back one calendar day at a time (DST-safe) from today,
  // stopping once we'd step past the earliest activity day.
  const dayKeys: string[] = [];
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < windowDays; i++) {
    const key = formatDateInput(cursor.getTime());
    if (earliest !== null && key < earliest) break;
    dayKeys.push(key);
    cursor.setDate(cursor.getDate() - 1);
  }

  let covered = 0;
  let checkedIn = 0;
  for (const key of dayKeys) {
    const hasEntry = entryDates.has(key);
    const hasCheckIn = checkInDates.has(key);
    if (hasEntry || hasCheckIn) covered++;
    if (hasCheckIn) checkedIn++;
  }

  return { covered, total: dayKeys.length, checkedIn };
}
