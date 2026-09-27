import * as Notifications from 'expo-notifications';

import { getDayCheckIn, upsertDayCheckIn } from '@/db/repository';
import type { DayStatus } from '@/db/schema';
import { CHANNEL_ID, ensureAndroidChannel } from '@/features/notifications/service';
import { formatDateInput } from '@/lib/datetime';
import { loadPrefs } from '@/lib/prefs';
import {
  DAY_CHECK_IN_ACTIONS,
  DAY_CHECK_IN_BODY,
  DAY_CHECK_IN_CATEGORY,
  DAY_CHECK_IN_SLOT,
  DAY_CHECK_IN_TITLE,
  dayCheckInFireDates,
} from './dayCheckInModel';

/**
 * Registers the day check-in's notification category (its two action
 * buttons). `opensAppToForeground: true` is required on both actions:
 * there's no background task runner (no `expo-task-manager`, not approved
 * — CLAUDE.md §9), so the JS that actually records the answer only ever
 * runs once the app has opened.
 */
export async function ensureDayCheckInCategory(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(DAY_CHECK_IN_CATEGORY, [
    { identifier: DAY_CHECK_IN_ACTIONS.fine, buttonTitle: 'Fine day', options: { opensAppToForeground: true } },
    { identifier: DAY_CHECK_IN_ACTIONS.rough, buttonTitle: 'Rough day', options: { opensAppToForeground: true } },
  ]);
}

async function cancelDayCheckIn() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.content.data?.slot === DAY_CHECK_IN_SLOT)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/** Cancels the day check-in notification horizon only — other slots (reminders, the Goals check-in) are untouched. */
export async function disableDayCheckIn(): Promise<void> {
  await cancelDayCheckIn();
}

/** Tail of the serialized refresh chain — see {@link refreshDayCheckIn}. */
let refreshQueue: Promise<void> = Promise.resolve();

/**
 * The single (re)scheduling entry point for the day check-in, mirroring
 * `checkInService.refreshCheckIn`'s one-shot-horizon shape: cancel every
 * existing day-check-in notification (its own slot only), then schedule a
 * fresh horizon anchored on "today at hour:minute" — today's one-shot
 * (skipped when today is already answered or the time already passed) plus
 * the next 6 calendar days, one-shots (`SchedulableTriggerInputTypes.DATE`)
 * rather than a repeating DAILY trigger so an already-answered "today" can
 * be skipped without extra state, and so any app interaction (an answer,
 * enabling, a time change) naturally re-arms and re-anchors the whole
 * horizon via a fresh call here.
 *
 * Does not itself request notification permission — that's the Settings
 * switch's job, mirroring `enableReminder`/`refreshCheckIn`.
 *
 * Serialized: cancel-then-schedule isn't atomic, so two overlapping refreshes
 * (app-open's re-arm racing a notification-action answer on a cold start, or
 * two quick Fine→Rough taps) would both cancel, then both schedule — a
 * doubled horizon that fires every prompt twice. Each call waits for the
 * previous one to finish; a failed run doesn't block the next.
 */
export function refreshDayCheckIn(hour: number, minute: number): Promise<void> {
  const run = refreshQueue.then(() => rescheduleDayCheckIn(hour, minute));
  refreshQueue = run.catch(() => undefined);
  return run;
}

async function rescheduleDayCheckIn(hour: number, minute: number): Promise<void> {
  await cancelDayCheckIn();

  const today = formatDateInput(Date.now());
  const answeredToday = (await getDayCheckIn(today)) != null;

  await ensureAndroidChannel();
  await ensureDayCheckInCategory();

  const fireDates = dayCheckInFireDates(Date.now(), hour, minute, answeredToday);
  for (const fireDate of fireDates) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: DAY_CHECK_IN_TITLE,
        body: DAY_CHECK_IN_BODY,
        categoryIdentifier: DAY_CHECK_IN_CATEGORY,
        data: { slot: DAY_CHECK_IN_SLOT, date: formatDateInput(fireDate.getTime()), hour, minute },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireDate,
        channelId: CHANNEL_ID,
      },
    });
  }
}

/**
 * Hook for app-open (design contract, mirrors `refreshCheckInIfEnabled`):
 * no-op unless the day check-in is currently enabled per the persisted
 * flag, else recomputes + reschedules the horizon. Always fire-and-forget
 * at call sites.
 */
export async function refreshDayCheckInIfEnabled(): Promise<void> {
  const prefs = await loadPrefs();
  if (!prefs.dayCheckInEnabled) return;
  await refreshDayCheckIn(prefs.dayCheckInHour, prefs.dayCheckInMinute);
}

/**
 * Records the day's answer (Home card tap or a notification action) then
 * re-arms the horizon — answering today drops today's now-redundant pending
 * notification. Fire-and-forget at call sites that don't need to await it.
 */
export async function recordDayCheckIn(date: string, status: DayStatus): Promise<void> {
  await upsertDayCheckIn(date, status);
  void refreshDayCheckInIfEnabled();
}
