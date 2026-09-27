import * as Notifications from 'expo-notifications';
import { waitFor } from '@testing-library/react-native';

import { getDayCheckIn, upsertDayCheckIn } from '@/db/repository';
import { CHANNEL_ID } from '@/features/notifications/service';
import { loadPrefs } from '@/lib/prefs';
import { DAY_CHECK_IN_CATEGORY, DAY_CHECK_IN_SLOT } from '../dayCheckInModel';
import { disableDayCheckIn, recordDayCheckIn, refreshDayCheckIn, refreshDayCheckInIfEnabled } from '../dayCheckInService';

jest.mock('expo-notifications', () => ({
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationCategoryAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
}));

jest.mock('@/db/repository', () => ({
  getDayCheckIn: jest.fn(),
  upsertDayCheckIn: jest.fn(),
}));

jest.mock('@/lib/prefs', () => ({
  loadPrefs: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
  (getDayCheckIn as jest.Mock).mockResolvedValue(undefined);
  (upsertDayCheckIn as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('disableDayCheckIn', () => {
  it('cancels only notifications tagged with the day-check-in slot, leaving a reminder and the goal check-in alone', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      { identifier: 'day-check-in-1', content: { data: { slot: DAY_CHECK_IN_SLOT } } },
      { identifier: 'breakfast-reminder', content: { data: { slot: 'breakfast' } } },
      { identifier: 'goal-check-in-1', content: { data: { slot: 'goal-check-in' } } },
    ]);

    await disableDayCheckIn();

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('day-check-in-1');
  });
});

describe('refreshDayCheckIn', () => {
  it('schedules a 7-notification horizon when today is unanswered and still ahead', async () => {
    const now = new Date(2026, 5, 15, 10, 0, 0, 0).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    (getDayCheckIn as jest.Mock).mockResolvedValue(undefined);

    await refreshDayCheckIn(21, 0);

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(7);
    const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;
    const today = calls[0][0];
    expect(today.content.categoryIdentifier).toBe(DAY_CHECK_IN_CATEGORY);
    expect(today.content.data).toEqual({ slot: DAY_CHECK_IN_SLOT, date: '2026-06-15', hour: 21, minute: 0 });
    expect(today.trigger.type).toBe('date');
    expect(today.trigger.channelId).toBe(CHANNEL_ID);

    const second = calls[1][0];
    expect(second.content.data).toEqual({ slot: DAY_CHECK_IN_SLOT, date: '2026-06-16', hour: 21, minute: 0 });
  });

  it('schedules a 6-notification horizon (no "today" slot) when today is already answered', async () => {
    const now = new Date(2026, 5, 15, 10, 0, 0, 0).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    (getDayCheckIn as jest.Mock).mockResolvedValue({
      id: 'x',
      date: '2026-06-15',
      status: 'fine',
      createdAt: 0,
      updatedAt: 0,
    });

    await refreshDayCheckIn(21, 0);

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(6);
    const first = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(first.content.data.date).toBe('2026-06-16');
  });

  it('checks today against formatDateInput of the current date, not a stale key', async () => {
    const now = new Date(2026, 5, 15, 10, 0, 0, 0).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    await refreshDayCheckIn(21, 0);

    expect(getDayCheckIn).toHaveBeenCalledWith('2026-06-15');
  });

  it('registers the day-check-in notification category', async () => {
    await refreshDayCheckIn(21, 0);
    expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith(
      DAY_CHECK_IN_CATEGORY,
      expect.arrayContaining([
        expect.objectContaining({ identifier: 'day-check-in-fine', buttonTitle: 'Fine day' }),
        expect.objectContaining({ identifier: 'day-check-in-rough', buttonTitle: 'Rough day' }),
      ]),
    );
  });

  it('cancels the whole existing horizon before rescheduling', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      { identifier: 'old-1', content: { data: { slot: DAY_CHECK_IN_SLOT, hour: 20, minute: 0 } } },
      { identifier: 'old-2', content: { data: { slot: DAY_CHECK_IN_SLOT, hour: 20, minute: 0 } } },
    ]);

    await refreshDayCheckIn(21, 0);

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old-1');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old-2');
  });
});

describe('refreshDayCheckIn serialization', () => {
  it('runs overlapping refreshes one after another, so the second cancel sees the first horizon', async () => {
    // Stateful fake of the OS schedule: without serialization both refreshes
    // would cancel an empty list, then both schedule — a doubled horizon.
    let pending: { identifier: string; content: { data: Record<string, unknown> } }[] = [];
    let nextId = 0;
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockImplementation(async () => [...pending]);
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockImplementation(async (id: string) => {
      pending = pending.filter((n) => n.identifier !== id);
    });
    (Notifications.scheduleNotificationAsync as jest.Mock).mockImplementation(
      async (req: { content: { data: Record<string, unknown> } }) => {
        const identifier = `n${nextId++}`;
        pending.push({ identifier, content: req.content });
        return identifier;
      },
    );
    jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 5, 15, 10, 0, 0, 0).getTime());

    await Promise.all([refreshDayCheckIn(21, 0), refreshDayCheckIn(21, 0)]);

    expect(pending).toHaveLength(7);
  });

  it('keeps going after a failed refresh', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 5, 15, 10, 0, 0, 0).getTime());

    await expect(refreshDayCheckIn(21, 0)).rejects.toThrow('boom');
    await refreshDayCheckIn(21, 0);

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(7);
  });
});

describe('refreshDayCheckInIfEnabled', () => {
  it('schedules nothing when disabled', async () => {
    (loadPrefs as jest.Mock).mockResolvedValue({ dayCheckInEnabled: false, dayCheckInHour: 21, dayCheckInMinute: 0 });

    await refreshDayCheckInIfEnabled();

    expect(getDayCheckIn).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('reschedules using the persisted hour/minute when enabled', async () => {
    const now = new Date(2026, 5, 15, 10, 0, 0, 0).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    (loadPrefs as jest.Mock).mockResolvedValue({ dayCheckInEnabled: true, dayCheckInHour: 22, dayCheckInMinute: 30 });

    await refreshDayCheckInIfEnabled();

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
    const first = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(first.content.data.hour).toBe(22);
    expect(first.content.data.minute).toBe(30);
  });
});

describe('recordDayCheckIn', () => {
  it('upserts the answer then refreshes the horizon when enabled', async () => {
    (loadPrefs as jest.Mock).mockResolvedValue({ dayCheckInEnabled: true, dayCheckInHour: 21, dayCheckInMinute: 0 });

    await recordDayCheckIn('2026-06-15', 'rough');

    expect(upsertDayCheckIn).toHaveBeenCalledWith('2026-06-15', 'rough');
    // refreshDayCheckInIfEnabled is fire-and-forget (`void`) — poll for it to settle.
    await waitFor(() => expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled());
  });

  it('does not schedule anything when the day check-in is disabled', async () => {
    (loadPrefs as jest.Mock).mockResolvedValue({ dayCheckInEnabled: false, dayCheckInHour: 21, dayCheckInMinute: 0 });

    await recordDayCheckIn('2026-06-15', 'fine');

    expect(upsertDayCheckIn).toHaveBeenCalledWith('2026-06-15', 'fine');
    await waitFor(() => expect(loadPrefs).toHaveBeenCalled());
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
