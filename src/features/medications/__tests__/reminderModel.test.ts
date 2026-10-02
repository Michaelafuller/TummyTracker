import type { Medication } from '@/db/schema';
import type { ResponseLike } from '@/features/checkin/dayCheckInModel';
import {
  ALL_DAYS_MASK,
  DEFAULT_TAP_ACTION,
  MED_REMINDER_SLOT,
  MED_REMINDER_TOOK_ACTION,
  daysFromMask,
  expoWeekday,
  joinNames,
  maskFromDays,
  maskHas,
  parseMedReminderResponse,
  reminderBody,
  reminderSlots,
  reminderTitle,
  tookDoses,
  validateReminder,
} from '../reminderModel';

function med(id: string, overrides: Partial<Medication> = {}): Medication {
  return {
    id,
    name: `Med ${id}`,
    defaultDose: 10,
    doseUnit: 'mg',
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

function reminder(medicationId: string, hour: number, minute: number, daysMask = ALL_DAYS_MASK, enabled = true) {
  return { medicationId, hour, minute, daysMask, enabled };
}

describe('weekday mask', () => {
  it('maskHas / maskFromDays / daysFromMask round trip (0 = Monday ... 6 = Sunday)', () => {
    const mask = maskFromDays([0, 2, 6]);
    expect(mask).toBe(1 + 4 + 64);
    expect(maskHas(mask, 0)).toBe(true);
    expect(maskHas(mask, 1)).toBe(false);
    expect(maskHas(mask, 6)).toBe(true);
    expect(daysFromMask(mask)).toEqual([0, 2, 6]);
  });

  it('every day is 127 and ignores out-of-range / repeated days', () => {
    expect(maskFromDays([0, 1, 2, 3, 4, 5, 6])).toBe(ALL_DAYS_MASK);
    expect(maskFromDays([0, 0, 9, -1, 1.5])).toBe(1);
    expect(daysFromMask(0)).toEqual([]);
    expect(maskHas(127, 7)).toBe(false);
  });

  it('maps to expo weekdays: Sunday is 1, Monday 2, Saturday 7', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(expoWeekday)).toEqual([2, 3, 4, 5, 6, 7, 1]);
  });
});

describe('validateReminder', () => {
  it('accepts a normal reminder and the range edges', () => {
    expect(validateReminder({ hour: 8, minute: 0, daysMask: 127, enabled: true })).toBeNull();
    expect(validateReminder({ hour: 0, minute: 0, daysMask: 1, enabled: false })).toBeNull();
    expect(validateReminder({ hour: 23, minute: 59, daysMask: 64, enabled: true })).toBeNull();
  });

  it('rejects an out-of-range or fractional time', () => {
    for (const [hour, minute] of [
      [24, 0],
      [-1, 0],
      [8, 60],
      [8, -1],
      [8.5, 0],
      [8, Number.NaN],
    ]) {
      expect(validateReminder({ hour, minute, daysMask: 127, enabled: true })).toBe('Pick a valid time.');
    }
  });

  it('rejects no weekday selected (mask 0) and a mask above 127', () => {
    expect(validateReminder({ hour: 8, minute: 0, daysMask: 0, enabled: true })).toBe('Pick at least one day.');
    expect(validateReminder({ hour: 8, minute: 0, daysMask: 128, enabled: true })).toBe('Pick at least one day.');
  });
});

describe('reminderSlots', () => {
  it('groups two medications due at the same time into one slot per weekday, in Meds-list order', () => {
    const meds = [med('a'), med('b')];
    // Reminders listed in the opposite order to prove the Meds-list order wins.
    const slots = reminderSlots(meds, [reminder('b', 8, 0, maskFromDays([0])), reminder('a', 8, 0, maskFromDays([0]))]);
    expect(slots).toEqual([{ weekday: 2, hour: 8, minute: 0, medicationIds: ['a', 'b'], canTake: true }]);
  });

  it('keeps a weekday that only one of the medications has as its own slot', () => {
    const meds = [med('a'), med('b')];
    const slots = reminderSlots(meds, [
      reminder('a', 8, 0, maskFromDays([0, 1])), // Mon, Tue
      reminder('b', 8, 0, maskFromDays([0])), // Mon only
    ]);
    expect(slots).toEqual([
      { weekday: 2, hour: 8, minute: 0, medicationIds: ['a', 'b'], canTake: true },
      { weekday: 3, hour: 8, minute: 0, medicationIds: ['a'], canTake: true },
    ]);
  });

  it('schedules a different time as a different slot, ordered by weekday then time', () => {
    const meds = [med('a')];
    const slots = reminderSlots(meds, [
      reminder('a', 20, 30, maskFromDays([6, 0])), // Sun, Mon evening
      reminder('a', 8, 0, maskFromDays([0])),
    ]);
    expect(slots.map((s) => [s.weekday, s.hour, s.minute])).toEqual([
      [1, 20, 30],
      [2, 8, 0],
      [2, 20, 30],
    ]);
  });

  it('maps Sunday to expo weekday 1', () => {
    const slots = reminderSlots([med('a')], [reminder('a', 9, 15, maskFromDays([6]))]);
    expect(slots).toHaveLength(1);
    expect(slots[0].weekday).toBe(1);
  });

  it('drops an inactive medication and a disabled reminder', () => {
    const meds = [med('a', { isActive: false }), med('b'), med('c')];
    const slots = reminderSlots(meds, [
      reminder('a', 8, 0),
      reminder('b', 8, 0),
      reminder('c', 8, 0, ALL_DAYS_MASK, false),
    ]);
    expect(slots).toHaveLength(7);
    expect(slots.every((s) => s.medicationIds.length === 1 && s.medicationIds[0] === 'b')).toBe(true);
  });

  it('ignores a reminder for an unknown medication and rows with an unusable time or mask', () => {
    const slots = reminderSlots(
      [med('a')],
      [reminder('ghost', 8, 0), reminder('a', 25, 0), reminder('a', 8, 61), reminder('a', 8, 0, 0)],
    );
    expect(slots).toEqual([]);
  });

  it('lists a medication once when two of its reminders land on the same slot', () => {
    const slots = reminderSlots([med('a')], [reminder('a', 8, 0, 1), reminder('a', 8, 0, 3)]);
    const monday = slots.find((s) => s.weekday === 2);
    expect(monday?.medicationIds).toEqual(['a']);
  });

  it('canTake is false when any listed medication lacks a default dose or unit', () => {
    const meds = [med('a'), med('b', { defaultDose: null }), med('c', { doseUnit: '  ' }), med('d', { defaultDose: 0 })];
    const day = maskFromDays([0]);
    const only = (id: string) => reminderSlots(meds, [reminder(id, 8, 0, day)])[0].canTake;
    expect(only('a')).toBe(true);
    expect(only('b')).toBe(false);
    expect(only('c')).toBe(false);
    expect(only('d')).toBe(false);
    const grouped = reminderSlots(meds, [reminder('a', 9, 0, day), reminder('b', 9, 0, day)]);
    expect(grouped[0]).toMatchObject({ medicationIds: ['a', 'b'], canTake: false });
  });

  it('returns no slots when there are no reminders', () => {
    expect(reminderSlots([med('a')], [])).toEqual([]);
  });
});

describe('copy', () => {
  it('joins 1, 2 and 3+ names', () => {
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A and B');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
    expect(joinNames([])).toBe('');
  });

  it('builds the title and body', () => {
    expect(reminderTitle()).toBe('Medication reminder');
    expect(reminderBody(['Levothyroxine', 'Vitamin D'])).toBe('Time for Levothyroxine and Vitamin D');
    expect(reminderBody(['A', 'B', 'C'])).toBe('Time for A, B and C');
  });
});

describe('parseMedReminderResponse', () => {
  function response(overrides: { action?: string; data?: Record<string, unknown> | null } = {}): ResponseLike {
    return {
      actionIdentifier: overrides.action ?? MED_REMINDER_TOOK_ACTION,
      notification: {
        request: {
          identifier: 'n1',
          content: {
            data: overrides.data === undefined ? { slot: MED_REMINDER_SLOT, medicationIds: ['a', 'b'] } : overrides.data,
          },
        },
      },
    };
  }

  it('reads the Took them action', () => {
    expect(parseMedReminderResponse(response())).toEqual({ kind: 'took', medicationIds: ['a', 'b'] });
  });

  it('reads a default body tap as open', () => {
    expect(parseMedReminderResponse(response({ action: DEFAULT_TAP_ACTION }))).toEqual({
      kind: 'open',
      medicationIds: ['a', 'b'],
    });
  });

  it('rejects another slot, an unknown action, and missing data', () => {
    expect(parseMedReminderResponse(response({ data: { slot: 'day-check-in', medicationIds: ['a'] } }))).toBeNull();
    expect(parseMedReminderResponse(response({ action: 'something-else' }))).toBeNull();
    expect(parseMedReminderResponse(response({ data: null }))).toBeNull();
    expect(parseMedReminderResponse(response({ data: {} }))).toBeNull();
  });

  it('rejects bad medicationIds', () => {
    for (const medicationIds of [undefined, 'a', [], [1], ['a', ''], ['a', null]]) {
      expect(parseMedReminderResponse(response({ data: { slot: MED_REMINDER_SLOT, medicationIds } }))).toBeNull();
    }
  });
});

describe('tookDoses', () => {
  it('logs the listed active medications at their CURRENT default dose and unit, reason null', () => {
    const meds = [med('a', { defaultDose: 50, doseUnit: 'mcg' }), med('b', { defaultDose: 0.5, doseUnit: ' tablet ' })];
    expect(tookDoses(meds, ['b', 'a'])).toEqual([
      { medicationId: 'a', dose: 50, doseUnit: 'mcg', reason: null },
      { medicationId: 'b', dose: 0.5, doseUnit: 'tablet', reason: null },
    ]);
  });

  it('skips an inactive medication, one without a dose or unit, an unlisted one and an unknown id', () => {
    const meds = [
      med('inactive', { isActive: false }),
      med('nodose', { defaultDose: null }),
      med('nounit', { doseUnit: null }),
      med('unlisted'),
      med('ok'),
    ];
    expect(tookDoses(meds, ['inactive', 'nodose', 'nounit', 'ghost', 'ok'])).toEqual([
      { medicationId: 'ok', dose: 10, doseUnit: 'mg', reason: null },
    ]);
  });

  it('is empty when none qualify', () => {
    expect(tookDoses([med('a', { isActive: false })], ['a'])).toEqual([]);
    expect(tookDoses([], ['a'])).toEqual([]);
  });
});
