import * as Notifications from 'expo-notifications';

import { listGoals, listLogEntries } from '@/db/repository';
import type { Goal, LogEntry } from '@/db/schema';
import { CHECK_IN_SLOT } from '../checkInModel';
import { disableCheckIn, refreshCheckIn } from '../checkInService';

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
  listGoals: jest.fn(),
  listLogEntries: jest.fn(),
}));

function goal(overrides: Partial<Goal> & Pick<Goal, 'nutrient' | 'direction' | 'threshold'>): Goal {
  return { id: `g-${overrides.nutrient}`, createdAt: 0, ...overrides };
}

const ENTRY_BASE: Omit<LogEntry, 'id' | 'type' | 'loggedAt'> = {
  mealSlot: null,
  name: 'Food',
  barcode: null,
  sentiment: null,
  bristolScale: null,
  symptomType: null,
  severity: null,
  notes: null,
  ingredientsText: null,
  tagsJson: null,
  servingG: null,
  calories: null,
  fatG: null,
  saturatedFatG: null,
  carbsG: null,
  proteinG: null,
  fiberG: null,
  sugarG: null,
  sodiumMg: null,
  componentCount: null,
  createdAt: 0,
  updatedAt: 0,
};

let seq = 0;
function entry(overrides: Partial<LogEntry> & { type: LogEntry['type']; loggedAt: number }): LogEntry {
  return { ...ENTRY_BASE, id: `e${seq++}`, ...overrides };
}

beforeEach(() => {
  seq = 0;
  jest.clearAllMocks();
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('refreshCheckIn', () => {
  it('schedules nothing when there are no floor goals (caps never notify)', async () => {
    (listGoals as jest.Mock).mockResolvedValue([goal({ nutrient: 'fatG', direction: 'cap', threshold: 20 })]);
    (listLogEntries as jest.Mock).mockResolvedValue([]);

    await refreshCheckIn(20, 0);

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('fires today with the unmet-floors body when the check-in time is still ahead', async () => {
    const now = new Date(2026, 5, 15, 10, 0, 0, 0).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    (listGoals as jest.Mock).mockResolvedValue([goal({ nutrient: 'proteinG', direction: 'floor', threshold: 50 })]);
    (listLogEntries as jest.Mock).mockResolvedValue([entry({ type: 'meal', loggedAt: now, proteinG: 20 })]);

    await refreshCheckIn(20, 0);

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.body).toBe('Protein: 30g to go');
    expect(call.content.data).toEqual({ slot: CHECK_IN_SLOT, hour: 20, minute: 0 });
    expect(call.trigger.type).toBe('date');
    const fireDate: Date = call.trigger.date;
    expect(fireDate.getFullYear()).toBe(2026);
    expect(fireDate.getMonth()).toBe(5);
    expect(fireDate.getDate()).toBe(15);
    expect(fireDate.getHours()).toBe(20);
    expect(fireDate.getMinutes()).toBe(0);
  });

  it('fires tomorrow with the fresh-day body when all floors are already met', async () => {
    const now = new Date(2026, 5, 15, 10, 0, 0, 0).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    (listGoals as jest.Mock).mockResolvedValue([goal({ nutrient: 'proteinG', direction: 'floor', threshold: 50 })]);
    (listLogEntries as jest.Mock).mockResolvedValue([entry({ type: 'meal', loggedAt: now, proteinG: 60 })]);

    await refreshCheckIn(20, 0);

    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.body).toBe('Nothing logged yet — protein 50g is still open.');
    const fireDate: Date = call.trigger.date;
    expect(fireDate.getDate()).toBe(16);
    expect(fireDate.getHours()).toBe(20);
  });

  it('fires tomorrow with the fresh-day body when floors are unmet but the check-in time already passed', async () => {
    const now = new Date(2026, 5, 15, 21, 0, 0, 0).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    (listGoals as jest.Mock).mockResolvedValue([goal({ nutrient: 'proteinG', direction: 'floor', threshold: 50 })]);
    (listLogEntries as jest.Mock).mockResolvedValue([entry({ type: 'meal', loggedAt: now, proteinG: 10 })]);

    await refreshCheckIn(20, 0);

    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.body).toBe('Nothing logged yet — protein 50g is still open.');
    const fireDate: Date = call.trigger.date;
    expect(fireDate.getDate()).toBe(16);
  });

  it('joins several unmet floors in the today body', async () => {
    const now = new Date(2026, 5, 15, 10, 0, 0, 0).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    (listGoals as jest.Mock).mockResolvedValue([
      goal({ nutrient: 'proteinG', direction: 'floor', threshold: 50 }),
      goal({ nutrient: 'fiberG', direction: 'floor', threshold: 30 }),
    ]);
    (listLogEntries as jest.Mock).mockResolvedValue([
      entry({ type: 'meal', loggedAt: now, proteinG: 20, fiberG: 10 }),
    ]);

    await refreshCheckIn(20, 0);

    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.body).toBe('Protein: 30g to go · Fiber: 20g to go');
  });

  it('cancels any existing check-in notification before scheduling a new one', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      { identifier: 'old-check-in', content: { data: { slot: CHECK_IN_SLOT, hour: 8, minute: 0 } } },
    ]);
    (listGoals as jest.Mock).mockResolvedValue([goal({ nutrient: 'proteinG', direction: 'floor', threshold: 50 })]);
    (listLogEntries as jest.Mock).mockResolvedValue([]);

    await refreshCheckIn(20, 0);

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old-check-in');
  });
});

describe('disableCheckIn', () => {
  it('cancels only notifications tagged with the check-in slot, leaving other slots alone', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      { identifier: 'check-in-1', content: { data: { slot: CHECK_IN_SLOT } } },
      { identifier: 'breakfast-reminder', content: { data: { slot: 'breakfast' } } },
    ]);

    await disableCheckIn();

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('check-in-1');
  });
});
