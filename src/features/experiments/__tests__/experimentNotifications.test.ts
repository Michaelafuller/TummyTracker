import * as Notifications from 'expo-notifications';

import { getActiveExperiment } from '@/db/repository';
import type { Experiment } from '@/db/schema';
import { CHANNEL_ID } from '@/features/notifications/service';
import { EXPERIMENT_SLOT } from '../experimentNotificationsModel';
import {
  hasNotificationPermission,
  refreshExperimentNotifications,
  requestExperimentNotificationRefresh,
} from '../experimentNotifications';

jest.mock('expo-notifications', () => ({
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
}));

jest.mock('@/db/repository', () => ({
  getActiveExperiment: jest.fn(),
}));

function activeExperiment(overrides: Partial<Experiment> = {}): Experiment {
  return {
    id: 'exp1',
    term: 'lactose',
    startDate: '2026-09-28',
    baselineDays: 14,
    eliminationDays: 14,
    challengeDays: 3,
    observationDays: 3,
    status: 'active',
    verdictJson: null,
    endedAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const NOW = new Date(2026, 8, 28, 10, 0, 0, 0).getTime();

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  (getActiveExperiment as jest.Mock).mockResolvedValue(activeExperiment());
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('refreshExperimentNotifications', () => {
  it('schedules the planned set as one-shot DATE triggers with routing data', async () => {
    await refreshExperimentNotifications();

    const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calls).toHaveLength(5);
    expect(calls[0]).toEqual({
      content: {
        title: 'Lactose experiment',
        body: 'Challenge day 1 of 3: eat lactose once today and log it',
        data: { slot: EXPERIMENT_SLOT, experimentId: 'exp1', kind: 'challenge', dayKey: '2026-10-12' },
      },
      trigger: { type: 'date', date: new Date(2026, 9, 12, 9, 0, 0, 0), channelId: CHANNEL_ID },
    });
    expect(calls.map((c) => c.content.data.kind)).toEqual([
      'challenge',
      'challenge',
      'challenge',
      'observation',
      'ready',
    ]);
  });

  it('cancels only its own slot — reminders, the goals check-in and the day check-in are untouched', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      { identifier: 'exp-old', content: { data: { slot: EXPERIMENT_SLOT } } },
      { identifier: 'breakfast-reminder', content: { data: { slot: 'breakfast' } } },
      { identifier: 'goal-check-in-1', content: { data: { slot: 'goal-check-in' } } },
      { identifier: 'day-check-in-1', content: { data: { slot: 'day-check-in' } } },
    ]);

    await refreshExperimentNotifications();

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('exp-old');
  });

  it('with no active experiment only cancels', async () => {
    (getActiveExperiment as jest.Mock).mockResolvedValue(undefined);
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      { identifier: 'exp-old', content: { data: { slot: EXPERIMENT_SLOT } } },
    ]);

    await refreshExperimentNotifications();

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('exp-old');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('does not schedule (and never asks) when permission is not granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });

    await refreshExperimentNotifications();

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('runs overlapping refreshes one after another so the horizon is scheduled once', async () => {
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

    await Promise.all([refreshExperimentNotifications(), refreshExperimentNotifications()]);

    expect(pending).toHaveLength(5);
  });

  it('keeps going after a failed refresh', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockRejectedValueOnce(new Error('boom'));

    await expect(refreshExperimentNotifications()).rejects.toThrow('boom');
    await refreshExperimentNotifications();

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(5);
  });
});

describe('requestExperimentNotificationRefresh', () => {
  it('swallows a failure (fire-and-forget) and leaves the queue usable', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockRejectedValueOnce(new Error('boom'));

    expect(() => requestExperimentNotificationRefresh()).not.toThrow();
    await refreshExperimentNotifications();

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(5);
  });
});

describe('hasNotificationPermission', () => {
  it('reads the current grant without prompting', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    await expect(hasNotificationPermission()).resolves.toBe(false);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    await expect(hasNotificationPermission()).resolves.toBe(true);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('is false when the permission read throws', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockRejectedValue(new Error('nope'));
    await expect(hasNotificationPermission()).resolves.toBe(false);
  });
});
