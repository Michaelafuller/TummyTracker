// Pure nutrient-goal evaluation (HANDOFF.md "nutrient threshold goals" Phase 2).
// No React, no I/O — judges a DailyTally (src/lib/dailyTally.ts) against the
// user's per-nutrient goals (src/db/schema.ts `goal` table).
//
// Missing data counts as zero for evaluation (design contract, HANDOFF.md): a
// floor with nothing logged is fully open, a cap with nothing logged is fully
// within budget. The Goals tab already discloses missing entries per nutrient
// (dailyTally's `missingCount`), so the user can see why a total looks low —
// this module doesn't need to re-surface that caveat.

import type { Goal } from '@/db/schema';
import type { DailyTally } from './dailyTally';

export interface GoalEvaluation {
  goal: Goal;
  /** Tally total for the goal's nutrient, null coerced to 0 for judging. */
  total: number;
  /** floor: total >= threshold · cap: total <= threshold. Exactly-at-threshold counts as met for both. */
  met: boolean;
  /** floor: amount still to go (0 when met) · cap: amount over (0 when within). */
  shortfall: number;
}

/** Evaluate every goal against today's (or any window's) tally. */
export function evaluateGoals(goals: readonly Goal[], tally: DailyTally): GoalEvaluation[] {
  return goals.map((g) => {
    const total = tally.nutrients[g.nutrient].total ?? 0;
    const met = g.direction === 'floor' ? total >= g.threshold : total <= g.threshold;
    const shortfall = met
      ? 0
      : g.direction === 'floor'
        ? g.threshold - total
        : total - g.threshold;
    return { goal: g, total, met, shortfall };
  });
}

/** Floor goals that are not yet met — the set the daily check-in notification names. */
export function unmetFloors(evaluations: readonly GoalEvaluation[]): GoalEvaluation[] {
  return evaluations.filter((e) => e.goal.direction === 'floor' && !e.met);
}

/** Cap goals whose total has gone over — the set the save-time notice names. */
export function exceededCaps(evaluations: readonly GoalEvaluation[]): GoalEvaluation[] {
  return evaluations.filter((e) => e.goal.direction === 'cap' && !e.met);
}

/**
 * Validates a goal threshold typed into the editor: a positive, finite number.
 * Zero, negative, NaN, and empty/non-numeric input are all rejected — a
 * threshold of 0 is meaningless for either direction (a floor of 0 is always
 * met, a cap of 0 always exceeded the moment anything is logged).
 */
export function parseGoalThreshold(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}
