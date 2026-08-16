import * as Notifications from 'expo-notifications';

import { listGoals, listLogEntries } from '@/db/repository';
import { CHANNEL_ID, ensureAndroidChannel, ensureNotificationPermission } from '@/features/notifications/service';
import { tallyDailyNutrition } from '@/lib/dailyTally';
import { dayBounds } from '@/lib/datetime';
import { evaluateGoals, unmetFloors } from '@/lib/goals';
import {
  CHECK_IN_SLOT,
  checkInBodyForFreshDay,
  checkInBodyForToday,
  checkInFromScheduled,
  nextCheckInFireDate,
  type CheckInState,
} from './checkInModel';

// Re-exported so callers (the Goals tab's check-in toggle) only need one
// import for the permission + scheduling flow — mirrors settings.tsx's
// reminder toggle, which requests permission before calling enableReminder.
export { ensureNotificationPermission };

/** Reconstruct check-in UI state from the OS-scheduled notifications. */
export async function getCheckIn(): Promise<CheckInState> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return checkInFromScheduled(scheduled);
}

async function cancelCheckIn() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.content.data?.slot === CHECK_IN_SLOT)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/** Cancels the check-in notification only — other slots (reminders) are untouched. */
export async function disableCheckIn(): Promise<void> {
  await cancelCheckIn();
}

/**
 * The single (re)scheduling entry point (design contract, HANDOFF.md): cancel
 * any existing check-in notification, then evaluate TODAY's floor goals
 * against fresh data and schedule exactly one one-shot notification. Caps
 * never notify here — they alert in-app at save time (src/app/meal/review.tsx).
 *
 * One-shot (`SchedulableTriggerInputTypes.DATE`), never a repeating DAILY
 * trigger: totals only change through the app (local-first invariant), so the
 * body has to be recomputed on every save/goal-edit/app-open regardless
 * (`refreshCheckInIfEnabled`, wired into all three) — a one-shot naturally
 * re-arms on each of those events, whereas a DAILY repeat can't skip "just
 * today" once floors are already met without extra state to track that. If
 * the app is never reopened before the scheduled fire, nothing could have
 * been logged in the meantime, so the body computed at the last refresh is
 * still accurate when it actually fires.
 *
 * Does not itself request notification permission — that's the UI toggle's
 * job (mirrors enableReminder's "request, bail if declined" shape) so this
 * function stays safe to call from background hooks (app-open, save, goal
 * edit) without ever popping a permission prompt outside a direct user action.
 */
export async function refreshCheckIn(hour: number, minute: number): Promise<void> {
  await cancelCheckIn();

  const goals = await listGoals();
  const floors = goals.filter((g) => g.direction === 'floor');
  if (floors.length === 0) return; // Nothing to check in on — caps never notify.

  const now = Date.now();
  const entries = await listLogEntries();
  const { start, end } = dayBounds(now);
  const tally = tallyDailyNutrition(entries, start, end);
  const unmet = unmetFloors(evaluateGoals(floors, tally));

  const skipToday = unmet.length === 0; // All floors already met — nothing to say today.
  const fireDate = nextCheckInFireDate(now, hour, minute, skipToday);
  const firesToday = fireDate.getTime() >= start && fireDate.getTime() < end;
  const body = firesToday ? checkInBodyForToday(unmet) : checkInBodyForFreshDay(floors);

  await ensureAndroidChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Goal check-in',
      body,
      data: { slot: CHECK_IN_SLOT, hour, minute },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
      channelId: CHANNEL_ID,
    },
  });
}

/**
 * Hook for save/app-open/goal-edit (design contract — "the check-in body is
 * never stale"): no-op unless the check-in is currently enabled, else
 * recomputes + reschedules it. Always fire-and-forget at call sites.
 */
export async function refreshCheckInIfEnabled(): Promise<void> {
  const { enabled, hour, minute } = await getCheckIn();
  if (!enabled) return;
  await refreshCheckIn(hour, minute);
}
