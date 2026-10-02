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

/** `actionIdentifier` of a plain tap on a notification body (expo-notifications' `DEFAULT_ACTION_IDENTIFIER`). */
export const DEFAULT_TAP_ACTION = 'expo.modules.notifications.actions.DEFAULT';

/** The parts of a notification response the once-only guards read. */
export interface HandledResponseLike {
  actionIdentifier: string;
  notification: { date?: number; request: { identifier: string } };
}

/**
 * The key a response hook remembers so it handles each tap once. A repeating
 * trigger (DAILY meal reminders, WEEKLY medication reminders) keeps the SAME
 * request identifier on every firing, and Home can stay mounted for days, so
 * the delivery time is part of the key — otherwise the next firing's tap was
 * silently ignored (review 2026-10-02).
 */
export function responseHandledKey(r: HandledResponseLike): string {
  return `${r.notification.request.identifier}:${r.notification.date ?? ''}:${r.actionIdentifier}`;
}

/** The minimal response shape we read (a subset of expo-notifications' `NotificationResponse`). */
export interface MealReminderResponseLike {
  actionIdentifier: string;
  notification: { request: { identifier: string; content: { data?: Record<string, unknown> | null } } };
}

/**
 * The slot a plain tap on one of our meal reminders refers to (GitHub #26), or
 * null for anything else: another notification's slot (day check-in,
 * experiments), a non-default action, or missing/malformed data. Only
 * navigation follows from it — a notification is never a record.
 */
export function parseMealReminderResponse(r: MealReminderResponseLike): { slot: ReminderSlot } | null {
  if (r.actionIdentifier !== DEFAULT_TAP_ACTION) return null;
  const slot = r.notification.request.content.data?.slot;
  if (!isReminderSlot(slot)) return null;
  return { slot };
}
