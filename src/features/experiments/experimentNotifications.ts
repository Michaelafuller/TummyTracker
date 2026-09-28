// Phase-reminder scheduling for the active elimination experiment (GitHub
// #19, Cycle B). Mirrors src/features/checkin/dayCheckInService.ts: own
// slot, own cancel, serialized refresh. Never requests permission — that
// happens once, on the start screen, at the moment the user starts.
import * as Notifications from 'expo-notifications';

import { getActiveExperiment } from '@/db/repository';
import { CHANNEL_ID, ensureAndroidChannel } from '@/features/notifications/service';
import { EXPERIMENT_SLOT, plannedExperimentNotifications } from './experimentNotificationsModel';

async function cancelExperimentNotifications(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.content.data?.slot === EXPERIMENT_SLOT)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/** Tail of the serialized refresh chain — see {@link refreshExperimentNotifications}. */
let refreshQueue: Promise<void> = Promise.resolve();

/**
 * The single (re)scheduling entry point: cancel every notification in the
 * experiment slot (and only that slot — reminders, the Goals check-in and the
 * day check-in are untouched), then, if an experiment is active and
 * notification permission is already granted, schedule each planned reminder
 * as a one-shot DATE trigger. No active experiment → just the cancel.
 *
 * Serialized like `refreshDayCheckIn`: cancel-then-schedule isn't atomic, so
 * overlapping refreshes (app-open racing a start/finish) would double the
 * horizon. Each call waits for the previous one; a failed run doesn't block
 * the next.
 */
export function refreshExperimentNotifications(): Promise<void> {
  const run = refreshQueue.then(rescheduleExperimentNotifications);
  refreshQueue = run.catch(() => undefined);
  return run;
}

/** Whether notification permission is currently granted — read-only, never prompts. */
export async function hasNotificationPermission(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Fire-and-forget wrapper for call sites (screens, app open, import) — a failure must never surface to the user. */
export function requestExperimentNotificationRefresh(): void {
  refreshExperimentNotifications().catch(() => undefined);
}

async function rescheduleExperimentNotifications(): Promise<void> {
  await cancelExperimentNotifications();

  const active = await getActiveExperiment();
  if (!active) return;

  const permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) return;

  await ensureAndroidChannel();

  for (const planned of plannedExperimentNotifications(active, Date.now())) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: planned.title,
        body: planned.body,
        data: { slot: EXPERIMENT_SLOT, experimentId: active.id, kind: planned.kind, dayKey: planned.dayKey },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: planned.fireAt,
        channelId: CHANNEL_ID,
      },
    });
  }
}
