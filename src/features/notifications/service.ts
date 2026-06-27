import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  reminderBody,
  type ReminderSlot,
  type RemindersState,
  remindersFromScheduled,
  reminderTitle,
} from './model';

const CHANNEL_ID = 'reminders';

/** Show reminders as a banner even when the app is foregrounded. Call once at startup. */
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Logging reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

/** Prompt for notification permission if not already granted. Returns whether granted. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function getReminders(): Promise<RemindersState> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return remindersFromScheduled(scheduled);
}

async function cancelSlot(slot: ReminderSlot) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.content.data?.slot === slot)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

export async function disableReminder(slot: ReminderSlot): Promise<void> {
  await cancelSlot(slot);
}

/**
 * Schedule (or reschedule) a daily reminder for `slot` at hour:minute. Requests
 * permission first; returns false if the user declined.
 */
export async function enableReminder(
  slot: ReminderSlot,
  hour: number,
  minute: number,
): Promise<boolean> {
  const granted = await ensureNotificationPermission();
  if (!granted) return false;

  await ensureAndroidChannel();
  await cancelSlot(slot);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: reminderTitle(slot),
      body: reminderBody(slot),
      data: { slot, hour, minute },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: CHANNEL_ID,
    },
  });
  return true;
}
