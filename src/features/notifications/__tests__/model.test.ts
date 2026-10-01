import {
  DEFAULT_REMINDERS,
  DEFAULT_TAP_ACTION,
  isReminderSlot,
  parseMealReminderResponse,
  reminderBody,
  remindersFromScheduled,
  reminderTitle,
} from '../model';

describe('reminder model', () => {
  it('guards reminder slots', () => {
    expect(isReminderSlot('breakfast')).toBe(true);
    expect(isReminderSlot('brunch')).toBe(false);
    expect(isReminderSlot(3)).toBe(false);
  });

  it('builds human-readable title and body', () => {
    expect(reminderTitle('lunch')).toBe('Lunch check-in');
    expect(reminderBody('dinner')).toContain('dinner');
  });

  it('returns disabled defaults when nothing is scheduled', () => {
    expect(remindersFromScheduled([])).toEqual(DEFAULT_REMINDERS);
  });

  it('reconstructs enabled slots from scheduled notifications', () => {
    const state = remindersFromScheduled([
      { content: { data: { slot: 'breakfast', hour: 7, minute: 15 } } },
      { content: { data: { slot: 'dinner', hour: 19, minute: 0 } } },
    ]);
    expect(state.breakfast).toEqual({ enabled: true, hour: 7, minute: 15 });
    expect(state.dinner).toEqual({ enabled: true, hour: 19, minute: 0 });
    expect(state.lunch.enabled).toBe(false);
  });

  it('ignores malformed scheduled entries', () => {
    const state = remindersFromScheduled([
      { content: { data: { slot: 'brunch', hour: 7, minute: 15 } } },
      { content: { data: { slot: 'lunch', hour: 'noon' as unknown as number, minute: 0 } } },
      { content: { data: null } },
    ]);
    expect(state).toEqual(DEFAULT_REMINDERS);
  });
});

describe('parseMealReminderResponse (GitHub #26)', () => {
  const response = (data: Record<string, unknown> | null | undefined, actionIdentifier = DEFAULT_TAP_ACTION) => ({
    actionIdentifier,
    notification: { request: { identifier: 'n1', content: { data } } },
  });

  it.each(['breakfast', 'lunch', 'dinner'] as const)('returns the slot for a plain tap on a %s reminder', (slot) => {
    expect(parseMealReminderResponse(response({ slot, hour: 8, minute: 0 }))).toEqual({ slot });
  });

  it('ignores the slots of other notifications (day check-in, experiments, unknown)', () => {
    expect(parseMealReminderResponse(response({ slot: 'day-check-in', date: '2026-10-01' }))).toBeNull();
    expect(parseMealReminderResponse(response({ slot: 'experiment', experimentId: 'x' }))).toBeNull();
    expect(parseMealReminderResponse(response({ slot: 'snack' }))).toBeNull();
    expect(parseMealReminderResponse(response({ slot: 'brunch' }))).toBeNull();
  });

  it('ignores a non-default action (e.g. a button on another notification)', () => {
    expect(parseMealReminderResponse(response({ slot: 'lunch' }, 'fine'))).toBeNull();
  });

  it('ignores missing or malformed data', () => {
    expect(parseMealReminderResponse(response(null))).toBeNull();
    expect(parseMealReminderResponse(response(undefined))).toBeNull();
    expect(parseMealReminderResponse(response({}))).toBeNull();
    expect(parseMealReminderResponse(response({ slot: 3 }))).toBeNull();
  });
});
