import * as Notifications from 'expo-notifications';

import { listMedicationReminders, listMedications } from '@/db/repository';
import type { Medication, MedicationReminder } from '@/db/schema';
import { CHANNEL_ID } from '@/features/notifications/service';
import {
  MED_REMINDER_CATEGORY_PLAIN,
  MED_REMINDER_CATEGORY_TOOK,
  MED_REMINDER_SLOT,
  MED_REMINDER_TOOK_ACTION,
  maskFromDays,
} from '../reminderModel';
import {
  ensureMedReminderCategories,
  refreshMedicationReminders,
  requestMedicationReminderRefresh,
} from '../reminderService';

jest.mock('expo-notifications', () => ({
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationCategoryAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date', WEEKLY: 'weekly' },
  AndroidImportance: { DEFAULT: 3 },
}));

jest.mock('@/db/repository', () => ({
  listMedications: jest.fn(),
  listMedicationReminders: jest.fn(),
}));

function med(id: string, name: string, overrides: Partial<Medication> = {}): Medication {
  return {
    id,
    name,
    defaultDose: 50,
    doseUnit: 'mcg',
    frequency: null,
    startDate: null,
    endDate: null,
    isActive: true,
    isRegular: false,
    notes: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function reminder(
  id: string,
  medicationId: string,
  hour: number,
  minute: number,
  daysMask = 127,
  enabled = true,
): MedicationReminder {
  return { id, medicationId, hour, minute, daysMask, enabled, createdAt: 1, updatedAt: 1 };
}

const scheduleCalls = () => (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.map((c) => c[0]);

beforeEach(() => {
  jest.clearAllMocks();
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
  (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('id');
  (listMedications as jest.Mock).mockResolvedValue([]);
  (listMedicationReminders as jest.Mock).mockResolvedValue([]);
});

describe('ensureMedReminderCategories', () => {
  it('registers a "took" category with one Took them button that opens the app, and a button-less plain one', async () => {
    await ensureMedReminderCategories();

    expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith(MED_REMINDER_CATEGORY_TOOK, [
      { identifier: MED_REMINDER_TOOK_ACTION, buttonTitle: 'Took them', options: { opensAppToForeground: true } },
    ]);
    expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith(MED_REMINDER_CATEGORY_PLAIN, []);
  });
});

describe('refreshMedicationReminders', () => {
  it('cancels only its own slot, leaving meal reminders, check-ins and experiment reminders alone', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      { identifier: 'med-1', content: { data: { slot: MED_REMINDER_SLOT } } },
      { identifier: 'med-2', content: { data: { slot: MED_REMINDER_SLOT } } },
      { identifier: 'breakfast-reminder', content: { data: { slot: 'breakfast' } } },
      { identifier: 'day-check-in-1', content: { data: { slot: 'day-check-in' } } },
      { identifier: 'goal-check-in-1', content: { data: { slot: 'goal-check-in' } } },
      { identifier: 'experiment-1', content: { data: { slot: 'experiment' } } },
      { identifier: 'no-data', content: {} },
    ]);

    await refreshMedicationReminders();

    const cancelled = (Notifications.cancelScheduledNotificationAsync as jest.Mock).mock.calls.map((c) => c[0]);
    expect(cancelled.sort()).toEqual(['med-1', 'med-2']);
  });

  it('with no slots only cancels: nothing is scheduled and no channel/category is touched', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      { identifier: 'med-1', content: { data: { slot: MED_REMINDER_SLOT } } },
    ]);
    (listMedications as jest.Mock).mockResolvedValue([med('a', 'Levothyroxine', { isActive: false })]);
    (listMedicationReminders as jest.Mock).mockResolvedValue([reminder('r1', 'a', 8, 0)]);

    await refreshMedicationReminders();

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('med-1');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.setNotificationCategoryAsync).not.toHaveBeenCalled();
  });

  it('schedules one WEEKLY trigger per slot with the expo weekday, channel, grouped data and the right category (worked example)', async () => {
    (listMedications as jest.Mock).mockResolvedValue([
      med('lev', 'Levothyroxine'),
      med('vitd', 'Vitamin D', { defaultDose: 1000, doseUnit: 'unit' }),
    ]);
    (listMedicationReminders as jest.Mock).mockResolvedValue([
      reminder('r1', 'lev', 8, 0, maskFromDays([0, 6])), // Mon + Sun 08:00
      reminder('r2', 'vitd', 8, 0, maskFromDays([0])), // Mon 08:00 only
    ]);

    await refreshMedicationReminders();

    expect(scheduleCalls()).toEqual([
      {
        content: {
          title: 'Medication reminder',
          body: 'Time for Levothyroxine',
          categoryIdentifier: MED_REMINDER_CATEGORY_TOOK,
          data: { slot: MED_REMINDER_SLOT, medicationIds: ['lev'], hour: 8, minute: 0, weekday: 1 },
        },
        trigger: { type: 'weekly', weekday: 1, hour: 8, minute: 0, channelId: CHANNEL_ID },
      },
      {
        content: {
          title: 'Medication reminder',
          body: 'Time for Levothyroxine and Vitamin D',
          categoryIdentifier: MED_REMINDER_CATEGORY_TOOK,
          data: { slot: MED_REMINDER_SLOT, medicationIds: ['lev', 'vitd'], hour: 8, minute: 0, weekday: 2 },
        },
        trigger: { type: 'weekly', weekday: 2, hour: 8, minute: 0, channelId: CHANNEL_ID },
      },
    ]);
  });

  it('uses the plain (button-less) category when any medication due lacks a default dose or unit', async () => {
    (listMedications as jest.Mock).mockResolvedValue([med('a', 'A'), med('b', 'B', { defaultDose: null })]);
    (listMedicationReminders as jest.Mock).mockResolvedValue([
      reminder('r1', 'a', 9, 0, maskFromDays([2])),
      reminder('r2', 'b', 9, 0, maskFromDays([2])),
    ]);

    await refreshMedicationReminders();

    const calls = scheduleCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].content.categoryIdentifier).toBe(MED_REMINDER_CATEGORY_PLAIN);
    expect(calls[0].content.data.medicationIds).toEqual(['a', 'b']);
  });

  it('does not schedule an inactive medication or a disabled reminder', async () => {
    (listMedications as jest.Mock).mockResolvedValue([med('a', 'A', { isActive: false }), med('b', 'B')]);
    (listMedicationReminders as jest.Mock).mockResolvedValue([
      reminder('r1', 'a', 8, 0, maskFromDays([0])),
      reminder('r2', 'b', 9, 0, maskFromDays([0]), false),
    ]);

    await refreshMedicationReminders();

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('two overlapping refreshes do not double-schedule: the second cancels what the first scheduled', async () => {
    (listMedications as jest.Mock).mockResolvedValue([med('a', 'A')]);
    (listMedicationReminders as jest.Mock).mockResolvedValue([reminder('r1', 'a', 8, 0, maskFromDays([0]))]);

    // A tiny in-memory scheduler so cancellation actually removes what an earlier run scheduled.
    let nextId = 0;
    let scheduled: { identifier: string; content: { data: { slot: string } } }[] = [];
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockImplementation(async () => {
      await Promise.resolve();
      return [...scheduled];
    });
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockImplementation(async (id: string) => {
      await Promise.resolve();
      scheduled = scheduled.filter((n) => n.identifier !== id);
    });
    (Notifications.scheduleNotificationAsync as jest.Mock).mockImplementation(
      async (request: { content: { data: { slot: string } } }) => {
        await Promise.resolve();
        scheduled.push({ identifier: `n${nextId++}`, content: request.content });
        return `n${nextId}`;
      },
    );

    await Promise.all([refreshMedicationReminders(), refreshMedicationReminders()]);

    expect(scheduled).toHaveLength(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('a failed run does not block the next one', async () => {
    (listMedications as jest.Mock).mockRejectedValueOnce(new Error('db not ready'));
    await expect(refreshMedicationReminders()).rejects.toThrow('db not ready');

    (listMedications as jest.Mock).mockResolvedValue([med('a', 'A')]);
    (listMedicationReminders as jest.Mock).mockResolvedValue([reminder('r1', 'a', 8, 0, maskFromDays([0]))]);
    await refreshMedicationReminders();

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });
});

describe('requestMedicationReminderRefresh', () => {
  it('never throws or rejects, even when the refresh fails', async () => {
    (listMedications as jest.Mock).mockRejectedValue(new Error('boom'));
    expect(() => requestMedicationReminderRefresh()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
