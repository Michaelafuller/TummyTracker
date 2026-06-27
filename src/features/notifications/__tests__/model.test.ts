import {
  DEFAULT_REMINDERS,
  isReminderSlot,
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
