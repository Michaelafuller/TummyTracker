// Pure daily check-in model (HANDOFF.md "nutrient threshold goals" Phase 2).
// Mirrors src/features/notifications/model.ts's style: no expo-notifications
// import here, so this stays unit-testable. Persisted prefs (src/lib/prefs.ts)
// are the source of truth for enabled/hour/minute (fix for the one-shot-then-
// dies bug, HANDOFF.md Cycle A) — `checkInFromScheduled` below is demoted to
// one-time adoption only (checkInService.ts's `getCheckIn`), and this module
// otherwise just builds the copy that goes in the notification body.

import type { Goal } from '@/db/schema';
import { NUTRITION_NOUNS, nutritionUnit } from '@/lib/nutrition';
import type { NutritionField } from '@/lib/validation';
import type { GoalEvaluation } from '@/lib/goals';

/** Stored in a scheduled notification's `content.data.slot` to identify it as the check-in. */
export const CHECK_IN_SLOT = 'goal-check-in';

export interface CheckInState {
  enabled: boolean;
  hour: number;
  minute: number;
}

/** "Likely just once a day" (design contract) — one check-in, off by default. */
export const DEFAULT_CHECK_IN: CheckInState = { enabled: false, hour: 20, minute: 0 };

/** The minimal shape we read back from a scheduled notification. */
export interface ScheduledLike {
  content: { data?: Record<string, unknown> | null };
}

/**
 * Rebuild check-in state from the list of OS-scheduled notifications — used
 * ONLY for the one-time adoption of a pre-existing install's pending
 * check-in (checkInService.ts's `getCheckIn`), not for ongoing state (that's
 * persisted prefs now). No matching notification means adopt-as-disabled
 * (default hour/minute are just a starting point for the UI).
 */
export function checkInFromScheduled(scheduled: readonly ScheduledLike[]): CheckInState {
  for (const item of scheduled) {
    const data = item.content.data ?? {};
    if (data.slot === CHECK_IN_SLOT && typeof data.hour === 'number' && typeof data.minute === 'number') {
      return { enabled: true, hour: data.hour, minute: data.minute };
    }
  }
  return { ...DEFAULT_CHECK_IN };
}

/**
 * The next moment to fire the (one-shot) check-in notification: today at
 * hour:minute if that instant is still ahead of `now` and the caller didn't
 * ask to skip today (all floors already met), else tomorrow at hour:minute.
 * Local time via `Date` mutation so DST-shifted days resolve correctly.
 */
export function nextCheckInFireDate(now: number, hour: number, minute: number, skipToday: boolean): Date {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  if (skipToday || d.getTime() <= now) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function amountText(field: NutritionField, amount: number): string {
  const unit = nutritionUnit(field);
  return unit.length > 0 ? `${amount}${unit}` : String(amount);
}

function capitalize(word: string): string {
  return word.length === 0 ? word : word[0].toUpperCase() + word.slice(1);
}

function joinWithAnd(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Body for a check-in firing today, unmet floors still open: e.g. "Protein: 22g
 * to go · Fiber: 5g to go". `unmet` is expected to already be filtered to
 * unmet floors (src/lib/goals.ts `unmetFloors`) — this doesn't re-filter.
 */
export function checkInBodyForToday(unmet: readonly GoalEvaluation[]): string {
  return unmet
    .map((e) => `${capitalize(NUTRITION_NOUNS[e.goal.nutrient])}: ${amountText(e.goal.nutrient, e.shortfall)} to go`)
    .join(' · ');
}

/**
 * Body used when scheduling for a future day (today's floors are all met, or
 * today's check-in time has already passed): e.g. "Nothing logged yet —
 * protein 50g and fiber 30g are still open." Rationale: if the user never
 * opens the app before that fire, nothing can have been logged in the
 * meantime, so this copy is *provably* accurate at fire time; any app
 * interaction (save, app-open, goal edit) re-arms the check-in with fresh
 * copy via refreshCheckIn, so this is only ever the "nobody touched the app"
 * fallback.
 */
export function checkInBodyForFreshDay(floors: readonly Goal[]): string {
  const parts = floors.map((g) => `${NUTRITION_NOUNS[g.nutrient]} ${amountText(g.nutrient, g.threshold)}`);
  const verb = floors.length === 1 ? 'is' : 'are';
  return `Nothing logged yet — ${joinWithAnd(parts)} ${verb} still open.`;
}
