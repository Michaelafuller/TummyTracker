// Pure day check-in model (GitHub #13, "fine day / rough day"). Mirrors
// src/features/goals/checkInModel.ts's style: no expo-notifications import
// here, so this stays unit-testable. Persisted prefs (src/lib/prefs.ts) are
// the source of truth for enabled/hour/minute, exactly like the goals
// check-in — this module only builds fire dates and reads back the action a
// notification response carries.

import type { DayStatus } from '@/db/schema';

/** Stored in a scheduled notification's `content.data.slot` to identify it as the day check-in. */
export const DAY_CHECK_IN_SLOT = 'day-check-in';
/** `categoryIdentifier` registered via `Notifications.setNotificationCategoryAsync`. */
export const DAY_CHECK_IN_CATEGORY = 'day-check-in';
export const DAY_CHECK_IN_ACTIONS = { fine: 'day-check-in-fine', rough: 'day-check-in-rough' } as const;
export const DAY_CHECK_IN_TITLE = 'How was today?';
export const DAY_CHECK_IN_BODY = 'Fine day or rough day? One tap keeps your insights honest.';

/**
 * Fire dates for the one-shot horizon: today at hour:minute when that's
 * still ahead of `now` and today isn't already answered, then each of the
 * next 6 calendar days — anchored on "today at hour:minute" exactly like
 * `checkInService.refreshCheckIn`/`nextCheckInFireDate` (DST-safe `Date`
 * mutation, never a fixed 24h offset).
 */
export function dayCheckInFireDates(now: number, hour: number, minute: number, answeredToday: boolean): Date[] {
  const anchor = new Date(now);
  anchor.setHours(hour, minute, 0, 0);

  const dates: Date[] = [];
  if (!answeredToday && anchor.getTime() > now) {
    dates.push(new Date(anchor));
  }
  for (let day = 1; day <= 6; day++) {
    const d = new Date(anchor);
    d.setDate(d.getDate() + day);
    dates.push(d);
  }
  return dates;
}

/** The minimal response shape we read (a subset of expo-notifications' `NotificationResponse`). */
export interface ResponseLike {
  actionIdentifier: string;
  notification: { request: { identifier: string; content: { data?: Record<string, unknown> | null } } };
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The minimal shape we read from a notification response. Returns null for
 * anything that isn't one of OUR two action buttons: a plain tap on the
 * notification body (`DEFAULT_ACTION_IDENTIFIER`), another slot, or a
 * malformed/missing `data.date`.
 */
export function parseDayCheckInResponse(r: ResponseLike): { date: string; status: DayStatus } | null {
  const data = r.notification.request.content.data;
  if (!data || data.slot !== DAY_CHECK_IN_SLOT) return null;

  const status: DayStatus | null =
    r.actionIdentifier === DAY_CHECK_IN_ACTIONS.fine
      ? 'fine'
      : r.actionIdentifier === DAY_CHECK_IN_ACTIONS.rough
        ? 'rough'
        : null;
  if (!status) return null;

  const date = data.date;
  if (typeof date !== 'string' || !DATE_KEY_RE.test(date)) return null;

  return { date, status };
}
