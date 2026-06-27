// Pure reminder model (no expo-notifications import here, so it's unit-testable).
// The OS-scheduled local notifications are the source of truth; we tag each with
// its slot/hour/minute in `content.data` and reconstruct UI state from them.

export const REMINDER_SLOTS = ['breakfast', 'lunch', 'dinner'] as const;
export type ReminderSlot = (typeof REMINDER_SLOTS)[number];

export interface ReminderState {
  enabled: boolean;
  hour: number;
  minute: number;
}

export type RemindersState = Record<ReminderSlot, ReminderState>;

export const DEFAULT_REMINDERS: RemindersState = {
  breakfast: { enabled: false, hour: 8, minute: 0 },
  lunch: { enabled: false, hour: 12, minute: 30 },
  dinner: { enabled: false, hour: 18, minute: 30 },
};

export function isReminderSlot(value: unknown): value is ReminderSlot {
  return typeof value === 'string' && (REMINDER_SLOTS as readonly string[]).includes(value);
}

export function reminderTitle(slot: ReminderSlot): string {
  const label = slot[0].toUpperCase() + slot.slice(1);
  return `${label} check-in`;
}

export function reminderBody(slot: ReminderSlot): string {
  return `Log your ${slot} and how it sat with you.`;
}

/** The minimal shape we read back from a scheduled notification. */
export interface ScheduledLike {
  content: { data?: Record<string, unknown> | null };
}

/**
 * Rebuild the per-slot reminder state from the list of OS-scheduled notifications.
 * Slots without a matching scheduled notification fall back to disabled defaults.
 */
export function remindersFromScheduled(scheduled: readonly ScheduledLike[]): RemindersState {
  const state: RemindersState = {
    breakfast: { ...DEFAULT_REMINDERS.breakfast },
    lunch: { ...DEFAULT_REMINDERS.lunch },
    dinner: { ...DEFAULT_REMINDERS.dinner },
  };

  for (const item of scheduled) {
    const data = item.content.data ?? {};
    const slot = data.slot;
    const hour = data.hour;
    const minute = data.minute;
    if (isReminderSlot(slot) && typeof hour === 'number' && typeof minute === 'number') {
      state[slot] = { enabled: true, hour, minute };
    }
  }

  return state;
}
