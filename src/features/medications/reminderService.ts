import * as Notifications from 'expo-notifications';

import { listMedicationReminders, listMedications } from '@/db/repository';
import { CHANNEL_ID, ensureAndroidChannel } from '@/features/notifications/service';
import {
  MED_REMINDER_CATEGORY_PLAIN,
  MED_REMINDER_CATEGORY_TOOK,
  MED_REMINDER_SLOT,
  MED_REMINDER_TOOK_ACTION,
  reminderBody,
  reminderSlots,
  reminderTitle,
} from './reminderModel';

/**
 * Registers the two medication-reminder notification categories (GitHub #29).
 * The "took" category carries ONE button, "Took them"; the "plain" category
 * has none (used when some medication due at that time has no default dose +
 * unit — tapping the notification body still opens the entry form).
 * `opensAppToForeground: true` is required: there is no background task
 * runner (no `expo-task-manager`, not approved — CLAUDE.md §9), so the JS
 * that logs the dose only ever runs once the app has opened.
 */
export async function ensureMedReminderCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(MED_REMINDER_CATEGORY_TOOK, [
    {
      identifier: MED_REMINDER_TOOK_ACTION,
      buttonTitle: 'Took them',
      options: { opensAppToForeground: true },
    },
  ]);
  await Notifications.setNotificationCategoryAsync(MED_REMINDER_CATEGORY_PLAIN, []);
}

/** Cancels the medication-reminder slot ONLY — meal reminders, the day/Goals check-ins and experiment reminders are untouched. */
async function cancelMedReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.content.data?.slot === MED_REMINDER_SLOT)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/** Tail of the serialized refresh chain — see {@link refreshMedicationReminders}. */
let refreshQueue: Promise<void> = Promise.resolve();

/**
 * The single (re)scheduling entry point for medication reminders: cancel
 * every notification in this feature's own slot, then schedule one repeating
 * WEEKLY trigger per (weekday, hour, minute) that has at least one enabled
 * reminder of an ACTIVE medication (grouped — see `reminderSlots`). With no
 * slots it only cancels. It never writes a dose; the "Took them" action
 * handler (`useMedReminderResponses`) is the only thing that may.
 *
 * Does not itself request notification permission — the medication form asks
 * (via `ensureNotificationPermission`) when a reminder is added.
 *
 * Serialized: cancel-then-schedule is not atomic, so two overlapping
 * refreshes (app open racing a medication save or a backup import) would
 * both cancel, then both schedule — every reminder firing twice. Each call
 * waits for the previous one; a failed run does not block the next. The
 * medications and reminders are read INSIDE the queued run, so a refresh
 * always schedules from the latest data, not what was current when it was
 * requested.
 */
export function refreshMedicationReminders(): Promise<void> {
  const run = refreshQueue.then(rescheduleMedicationReminders);
  refreshQueue = run.catch(() => undefined);
  return run;
}

/** Fire-and-forget wrapper for call sites (screens, app open, import) — a failure must never surface to the user. */
export function requestMedicationReminderRefresh(): void {
  refreshMedicationReminders().catch(() => undefined);
}

async function rescheduleMedicationReminders(): Promise<void> {
  const [meds, reminders] = await Promise.all([listMedications(), listMedicationReminders()]);
  const slots = reminderSlots(meds, reminders);

  await cancelMedReminders();
  if (slots.length === 0) return;

  await ensureAndroidChannel();
  await ensureMedReminderCategories();

  const nameById = new Map(meds.map((med) => [med.id, med.name]));
  for (const slot of slots) {
    const names = slot.medicationIds.map((id) => nameById.get(id) ?? 'your medication');
    await Notifications.scheduleNotificationAsync({
      content: {
        title: reminderTitle(),
        body: reminderBody(names),
        categoryIdentifier: slot.canTake ? MED_REMINDER_CATEGORY_TOOK : MED_REMINDER_CATEGORY_PLAIN,
        data: {
          slot: MED_REMINDER_SLOT,
          medicationIds: slot.medicationIds,
          hour: slot.hour,
          minute: slot.minute,
          weekday: slot.weekday,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: slot.weekday,
        hour: slot.hour,
        minute: slot.minute,
        channelId: CHANNEL_ID,
      },
    });
  }
}
