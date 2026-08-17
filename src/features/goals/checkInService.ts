import * as Notifications from 'expo-notifications';

import { listGoals, listLogEntries } from '@/db/repository';
import { CHANNEL_ID, ensureAndroidChannel, ensureNotificationPermission } from '@/features/notifications/service';
import { tallyDailyNutrition } from '@/lib/dailyTally';
import { dayBounds } from '@/lib/datetime';
import { evaluateGoals, unmetFloors } from '@/lib/goals';
import { loadPrefs, savePrefs } from '@/lib/prefs';
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

/**
 * Read the persisted check-in state — prefs are the source of truth for
 * "enabled" (design contract, HANDOFF.md Cycle A fix for the bug where firing
 * the OS-scheduled notification silently disabled the toggle). One-time
 * adoption: a pre-existing install with no check-in prefs yet
 * (`checkInAdoptedV1` unset) adopts whatever `checkInFromScheduled` finds
 * pending as {enabled: true, hour, minute}, or defaults to disabled if
 * nothing is pending — then persists that and never re-derives from the OS
 * schedule again.
 */
export async function getCheckIn(): Promise<CheckInState> {
  const prefs = await loadPrefs();
  if (!prefs.checkInAdoptedV1) {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const adopted = checkInFromScheduled(scheduled);
    await savePrefs({
      ...prefs,
      checkInEnabled: adopted.enabled,
      checkInHour: adopted.hour,
      checkInMinute: adopted.minute,
      checkInAdoptedV1: true,
    });
    return adopted;
  }
  return { enabled: prefs.checkInEnabled, hour: prefs.checkInHour, minute: prefs.checkInMinute };
}

async function cancelCheckIn() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.content.data?.slot === CHECK_IN_SLOT)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/** Cancels the check-in notification horizon and persists enabled:false — other slots (reminders) are untouched. */
export async function disableCheckIn(): Promise<void> {
  await cancelCheckIn();
  const prefs = await loadPrefs();
  await savePrefs({ ...prefs, checkInEnabled: false, checkInAdoptedV1: true });
}

async function scheduleCheckIn(fireDate: Date, body: string, hour: number, minute: number): Promise<void> {
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
 * The single (re)scheduling entry point (design contract, HANDOFF.md): cancel
 * every existing check-in notification, then evaluate TODAY's floor goals
 * against fresh data and schedule a 7-day horizon of one-shots. Caps never
 * notify here — they alert in-app at save time (src/app/meal/review.tsx).
 *
 * Multi-day continuity: today's precise one-shot (accurate unmet-floors body,
 * skipped if all floors are already met or today's time has already passed)
 * is followed by 6 more generic one-shots — one per the next 6 calendar
 * days — using `checkInBodyForFreshDay(floors)`. That body is accurate by the
 * local-first invariant: totals only change through the app, and any app use
 * (save/app-open/goal-edit, all wired to `refreshCheckInIfEnabled`) re-runs
 * this refresh and slides the whole horizon forward again. Without the
 * horizon, a check-in that isn't reopened after firing (or after being
 * skipped for a day) would go silent even though it's still "enabled" — this
 * is what makes staying enabled actually mean something across days the app
 * isn't opened.
 *
 * One-shots (`SchedulableTriggerInputTypes.DATE`), never a repeating DAILY
 * trigger: a DAILY repeat can't skip "just today" once floors are already met
 * without extra state to track that, whereas a one-shot horizon naturally
 * re-arms and re-computes on every refresh. All notifications are tagged
 * `CHECK_IN_SLOT` so the cancel-all-then-reschedule step above always clears
 * the entire horizon before laying down a fresh one.
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

  await ensureAndroidChannel();

  if (firesToday) {
    await scheduleCheckIn(fireDate, checkInBodyForToday(unmet), hour, minute);
  }

  // The following 6 calendar days, anchored to "today at hour:minute" (not to
  // `fireDate`, which is already tomorrow whenever `firesToday` is false —
  // anchoring there would either skip a day or double-book tomorrow).
  const freshDayBody = checkInBodyForFreshDay(floors);
  const anchor = new Date(now);
  anchor.setHours(hour, minute, 0, 0);
  for (let day = 1; day <= 6; day++) {
    const d = new Date(anchor);
    d.setDate(d.getDate() + day);
    await scheduleCheckIn(d, freshDayBody, hour, minute);
  }
}

/**
 * Hook for save/app-open/goal-edit (design contract — "the check-in body is
 * never stale"): no-op unless the check-in is currently enabled per the
 * persisted flag, else recomputes + reschedules the horizon. Always
 * fire-and-forget at call sites.
 */
export async function refreshCheckInIfEnabled(): Promise<void> {
  const { enabled, hour, minute } = await getCheckIn();
  if (!enabled) return;
  await refreshCheckIn(hour, minute);
}
