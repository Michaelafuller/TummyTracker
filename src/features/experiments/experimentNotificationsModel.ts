// Pure phase-reminder model for elimination experiments (GitHub #19, Cycle B).
// Mirrors src/features/checkin/dayCheckInModel.ts: no expo-notifications
// import here, so it stays unit-testable. A notification is never a record —
// these only say what today's step is; tapping one just opens the experiment.

import { experimentSchedule, type ExperimentLike } from './engine';

/** Stored in a scheduled notification's `content.data.slot` — cancel/refresh filter on this slot only. */
export const EXPERIMENT_SLOT = 'experiment-phase';
/** Local hour every phase reminder fires at (plan-session default, owner may override). */
export const REMINDER_HOUR = 9;
/** `actionIdentifier` of a plain tap on a notification body (expo-notifications' `DEFAULT_ACTION_IDENTIFIER`). */
export const DEFAULT_TAP_ACTION = 'expo.modules.notifications.actions.DEFAULT';

export type PlannedNotificationKind = 'challenge' | 'observation' | 'ready';

export interface PlannedNotification {
  fireAt: Date;
  title: string;
  body: string;
  kind: PlannedNotificationKind;
  /** 'YYYY-MM-DD' the reminder is for (its local fire day). */
  dayKey: string;
}

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function nextDayKey(key: string): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + 1);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 09:00 LOCAL on the given day — built from calendar parts, so it's DST-safe (never a fixed 24h offset). */
function fireTimeFor(dayKey: string): Date {
  const d = parseDateKey(dayKey);
  d.setHours(REMINDER_HOUR, 0, 0, 0);
  return d;
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

/**
 * Every reminder for this experiment's schedule, at 09:00 local on: each
 * challenge day, the first observation day, and the day after the last
 * observation day (the verdict is ready). Only fire times strictly after
 * `now` are returned, ascending — so a finished schedule yields [].
 */
export function plannedExperimentNotifications(exp: ExperimentLike, now: number): PlannedNotification[] {
  const schedule = experimentSchedule(exp);
  const title = `${capitalize(exp.term)} experiment`;
  const planned: PlannedNotification[] = [];

  schedule.challenge.forEach((dayKey, index) => {
    planned.push({
      fireAt: fireTimeFor(dayKey),
      title,
      body: `Challenge day ${index + 1} of ${schedule.challenge.length}: eat ${exp.term} once today and log it`,
      kind: 'challenge',
      dayKey,
    });
  });

  const firstObservation = schedule.observation[0];
  if (firstObservation) {
    const n = schedule.observation.length;
    planned.push({
      fireAt: fireTimeFor(firstObservation),
      title,
      body: `Back to avoiding ${exp.term} — keep logging for ${n} more ${n === 1 ? 'day' : 'days'}`,
      kind: 'observation',
      dayKey: firstObservation,
    });
  }

  const readyDay = nextDayKey(schedule.lastDay);
  planned.push({
    fireAt: fireTimeFor(readyDay),
    title,
    body: `Your ${exp.term} experiment is ready — see the verdict`,
    kind: 'ready',
    dayKey: readyDay,
  });

  return planned.filter((n) => n.fireAt.getTime() > now).sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}

/** The minimal response shape we read (a subset of expo-notifications' `NotificationResponse`). */
export interface ExperimentResponseLike {
  actionIdentifier: string;
  notification: { request: { identifier: string; content: { data?: Record<string, unknown> | null } } };
}

/**
 * The experiment id a plain tap on one of OUR notifications refers to, or
 * null for anything else: another slot, a non-default action, or a
 * missing/malformed `data.experimentId`.
 */
export function parseExperimentResponse(r: ExperimentResponseLike): { experimentId: string } | null {
  const data = r.notification.request.content.data;
  if (!data || data.slot !== EXPERIMENT_SLOT) return null;
  if (r.actionIdentifier !== DEFAULT_TAP_ACTION) return null;
  const experimentId = data.experimentId;
  if (typeof experimentId !== 'string' || experimentId.length === 0) return null;
  return { experimentId };
}
