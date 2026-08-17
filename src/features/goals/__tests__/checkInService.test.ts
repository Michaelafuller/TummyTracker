import * as Notifications from 'expo-notifications';

import { listGoals, listLogEntries } from '@/db/repository';
import type { Goal, LogEntry } from '@/db/schema';
import { loadPrefs, savePrefs, type AppPrefs } from '@/lib/prefs';
import { CHECK_IN_SLOT } from '../checkInModel';
import { disableCheckIn, getCheckIn, refreshCheckIn, refreshCheckInIfEnabled } from '../checkInService';

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

jest.mock('@/lib/prefs', () => ({
  loadPrefs: jest.fn(),
  savePrefs: jest.fn(),
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

const DEFAULT_TEST_PREFS: AppPrefs = {
  offlineMode: false,
  tagBackfillV1Done: false,
  checkInEnabled: false,
  checkInHour: 20,
  checkInMinute: 0,
  checkInAdoptedV1: true,
};

function prefs(overrides: Partial<AppPrefs> = {}): AppPrefs {
  return { ...DEFAULT_TEST_PREFS, ...overrides };
}

beforeEach(() => {
  seq = 0;
  jest.clearAllMocks();
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
  (loadPrefs as jest.Mock).mockResolvedValue(prefs());
  (savePrefs as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('getCheckIn', () => {
  it('reads the persisted flag once adoption has already run, without touching the OS schedule', async () => {
    (loadPrefs as jest.Mock).mockResolvedValue(prefs({ checkInEnabled: true, checkInHour: 7, checkInMinute: 30 }));

    const state = await getCheckIn();

    expect(state).toEqual({ enabled: true, hour: 7, minute: 30 });
    expect(Notifications.getAllScheduledNotificationsAsync).not.toHaveBeenCalled();
    expect(savePrefs).not.toHaveBeenCalled();
  });

  it('adopts a pending OS-scheduled check-in on a pre-existing install (no prefs field yet)', async () => {
    (loadPrefs as jest.Mock).mockResolvedValue(prefs({ checkInAdoptedV1: false }));
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      { content: { data: { slot: CHECK_IN_SLOT, hour: 9, minute: 15 } } },
    ]);

    const state = await getCheckIn();

    expect(state).toEqual({ enabled: true, hour: 9, minute: 15 });
    expect(savePrefs).toHaveBeenCalledWith(
      expect.objectContaining({ checkInEnabled: true, checkInHour: 9, checkInMinute: 15, checkInAdoptedV1: true }),
    );
  });

  it('adopts as disabled when there is nothing pending on a pre-existing install', async () => {
    (loadPrefs as jest.Mock).mockResolvedValue(prefs({ checkInAdoptedV1: false }));
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);

    const state = await getCheckIn();

    expect(state.enabled).toBe(false);
    expect(savePrefs).toHaveBeenCalledWith(expect.objectContaining({ checkInEnabled: false, checkInAdoptedV1: true }));
  });
});

describe('refreshCheckInIfEnabled', () => {
  it('MUST schedule when the flag is persisted enabled but the OS schedule is empty (the post-fire state)', async () => {
    (loadPrefs as jest.Mock).mockResolvedValue(prefs({ checkInEnabled: true, checkInHour: 20, checkInMinute: 0 }));
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]); // nothing scheduled — the exact post-fire gap this fix closes
    (listGoals as jest.Mock).mockResolvedValue([goal({ nutrient: 'proteinG', direction: 'floor', threshold: 50 })]);
    (listLogEntries as jest.Mock).mockResolvedValue([]);

    await refreshCheckInIfEnabled();

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
  });

  it('does not schedule when the flag is persisted disabled', async () => {
    (loadPrefs as jest.Mock).mockResolvedValue(prefs({ checkInEnabled: false }));

    await refreshCheckInIfEnabled();

    expect(listGoals).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
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

  it('persists checkInEnabled: false', async () => {
    (loadPrefs as jest.Mock).mockResolvedValue(prefs({ checkInEnabled: true }));

    await disableCheckIn();

    expect(savePrefs).toHaveBeenCalledWith(expect.objectContaining({ checkInEnabled: false }));
  });
});

describe('refreshCheckIn', () => {
  it('schedules nothing when there are no floor goals (caps never notify)', async () => {
    (listGoals as jest.Mock).mockResolvedValue([goal({ nutrient: 'fatG', direction: 'cap', threshold: 20 })]);
    (listLogEntries as jest.Mock).mockResolvedValue([]);

    await refreshCheckIn(20, 0);

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules a 7-notification horizon when today still fires: today (unmet body) + 6 fresh-day one-shots', async () => {
    const now = new Date(2026, 5, 15, 10, 0, 0, 0).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    (listGoals as jest.Mock).mockResolvedValue([goal({ nutrient: 'proteinG', direction: 'floor', threshold: 50 })]);
    (listLogEntries as jest.Mock).mockResolvedValue([entry({ type: 'meal', loggedAt: now, proteinG: 20 })]);

    await refreshCheckIn(20, 0);

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(7);
    const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;

    const today = calls[0][0];
    expect(today.content.body).toBe('Protein: 30g to go');
    expect(today.content.data).toEqual({ slot: CHECK_IN_SLOT, hour: 20, minute: 0 });
    expect(today.trigger.type).toBe('date');
    const todayFireDate: Date = today.trigger.date;
    expect(todayFireDate.getDate()).toBe(15);
    expect(todayFireDate.getHours()).toBe(20);
    expect(todayFireDate.getMinutes()).toBe(0);

    // The remaining 6 are the following calendar days, generic fresh-day body.
    for (let i = 1; i <= 6; i++) {
      const call = calls[i][0];
      expect(call.content.body).toBe('Nothing logged yet — protein 50g is still open.');
      expect(call.content.data).toEqual({ slot: CHECK_IN_SLOT, hour: 20, minute: 0 });
      const fireDate: Date = call.trigger.date;
      expect(fireDate.getDate()).toBe(15 + i);
      expect(fireDate.getHours()).toBe(20);
    }
  });

  it('schedules a 6-notification horizon (no "today" slot) when all floors are already met', async () => {
    const now = new Date(2026, 5, 15, 10, 0, 0, 0).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    (listGoals as jest.Mock).mockResolvedValue([goal({ nutrient: 'proteinG', direction: 'floor', threshold: 50 })]);
    (listLogEntries as jest.Mock).mockResolvedValue([entry({ type: 'meal', loggedAt: now, proteinG: 60 })]);

    await refreshCheckIn(20, 0);

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(6);
    const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;
    const first = calls[0][0];
    expect(first.content.body).toBe('Nothing logged yet — protein 50g is still open.');
    const fireDate: Date = first.trigger.date;
    expect(fireDate.getDate()).toBe(16);
    expect(fireDate.getHours()).toBe(20);
  });

  it('schedules a 6-notification horizon (no "today" slot) when floors are unmet but the check-in time already passed', async () => {
    const now = new Date(2026, 5, 15, 21, 0, 0, 0).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    (listGoals as jest.Mock).mockResolvedValue([goal({ nutrient: 'proteinG', direction: 'floor', threshold: 50 })]);
    (listLogEntries as jest.Mock).mockResolvedValue([entry({ type: 'meal', loggedAt: now, proteinG: 10 })]);

    await refreshCheckIn(20, 0);

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(6);
    const first = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(first.content.body).toBe('Nothing logged yet — protein 50g is still open.');
    const fireDate: Date = first.trigger.date;
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

  it('cancels the whole existing horizon before rescheduling', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      { identifier: 'old-check-in-1', content: { data: { slot: CHECK_IN_SLOT, hour: 8, minute: 0 } } },
      { identifier: 'old-check-in-2', content: { data: { slot: CHECK_IN_SLOT, hour: 8, minute: 0 } } },
    ]);
    (listGoals as jest.Mock).mockResolvedValue([goal({ nutrient: 'proteinG', direction: 'floor', threshold: 50 })]);
    (listLogEntries as jest.Mock).mockResolvedValue([]);

    await refreshCheckIn(20, 0);

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old-check-in-1');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old-check-in-2');
  });

  it('a second refresh cancels the first horizon before scheduling the next one', async () => {
    const now = new Date(2026, 5, 15, 10, 0, 0, 0).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    (listGoals as jest.Mock).mockResolvedValue([goal({ nutrient: 'proteinG', direction: 'floor', threshold: 50 })]);
    (listLogEntries as jest.Mock).mockResolvedValue([]);

    await refreshCheckIn(20, 0);
    // Simulate the horizon now being "on the OS schedule" for the second call's cancel sweep.
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      { identifier: 'from-first-refresh', content: { data: { slot: CHECK_IN_SLOT, hour: 20, minute: 0 } } },
    ]);

    await refreshCheckIn(20, 0);

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('from-first-refresh');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(14); // 7 + 7
  });
});
