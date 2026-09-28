// Pure elimination-experiment engine (GitHub #19, Cycle A) — schedule dates,
// per-day facts, phase stats and the verdict rules. No React, no I/O; this is
// the primary test target (docs/HANDOFF.md §2). The correlation engine
// (src/features/analysis/*, `isOutcome`) is read, never modified — an
// experiment "rough day" is any day with >=1 isOutcome entry OR a 'rough' day
// check-in (plan-session judgment, HANDOFF.md).
//
// Everything here works in local calendar-day keys ('YYYY-MM-DD',
// src/lib/datetime.ts `formatDateInput`) and steps days with `Date#setDate`
// (DST-safe) — never raw ms/86 400 000 arithmetic (CLAUDE.md/HANDOFF.md
// invariant).

import type { DayCheckIn, LogEntry } from '@/db/schema';
import { isOutcome } from '@/features/analysis/temporal';
import { formatDateInput } from '@/lib/datetime';
import { entryMatchesTerm } from '@/lib/watchlist';
import { wilsonLowerBound, wilsonUpperBound, type ConfidenceTier } from '@/lib/stats';

/** Standard protocol (owner decision 2026-09-27): 14-day baseline read from
 * existing logs (no waiting), a user-chosen elimination length, then a fixed
 * 3-day challenge + 3-day observation ("reintroduction"). */
export const DEFAULT_PROTOCOL = { baselineDays: 14, eliminationDays: 14, challengeDays: 3, observationDays: 3 };
export const ELIMINATION_CHOICES = [7, 14, 21, 28] as const;
export type EliminationChoice = (typeof ELIMINATION_CHOICES)[number];

/** The fields the engine needs — a subset of the `experiment` row (src/db/schema.ts). */
export interface ExperimentLike {
  term: string;
  /** 'YYYY-MM-DD', first elimination day. */
  startDate: string;
  baselineDays: number;
  eliminationDays: number;
  challengeDays: number;
  observationDays: number;
}

// ---------------------------------------------------------------------------
// Calendar-day helpers (setDate-based — DST-safe, never ms/86 400 000).
// ---------------------------------------------------------------------------

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Steps a 'YYYY-MM-DD' key forward (or back, for a negative `days`) by whole calendar days. */
function addDaysKey(key: string, days: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return formatDateInput(d.getTime());
}

/** `count` consecutive day keys starting at `startKey`, ascending. */
function dayRange(startKey: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDaysKey(startKey, i));
}

/** Whole calendar days from `fromKey` to `toKey` (>= fromKey), stepping one day at a time. */
function daysBetween(fromKey: string, toKey: string): number {
  let count = 0;
  let cursor = fromKey;
  while (cursor < toKey) {
    cursor = addDaysKey(cursor, 1);
    count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Schedule + phase
// ---------------------------------------------------------------------------

export interface ExperimentSchedule {
  /** The baselineDays days immediately before startDate (read from existing logs), ascending. */
  baseline: string[];
  elimination: string[];
  challenge: string[];
  observation: string[];
  /** Last observation day — the day the experiment's schedule is complete. */
  lastDay: string;
}

/** Builds the four phases' calendar-day lists from an experiment's protocol. */
export function experimentSchedule(exp: ExperimentLike): ExperimentSchedule {
  const baseline = dayRange(addDaysKey(exp.startDate, -exp.baselineDays), exp.baselineDays);
  const elimination = dayRange(exp.startDate, exp.eliminationDays);
  const challenge = dayRange(addDaysKey(exp.startDate, exp.eliminationDays), exp.challengeDays);
  const observation = dayRange(
    addDaysKey(exp.startDate, exp.eliminationDays + exp.challengeDays),
    exp.observationDays,
  );
  return { baseline, elimination, challenge, observation, lastDay: observation[observation.length - 1] };
}

export type Phase = 'elimination' | 'challenge' | 'observation' | 'ready';

export interface CurrentPhase {
  phase: Phase;
  /** 1-based day-within-phase. */
  dayOfPhase: number;
  phaseLength: number;
}

/**
 * Which phase `todayKey` falls in. A `todayKey` before `startDate` can't
 * happen in practice (an experiment always starts today) — treated as
 * elimination day 1 defensively rather than throwing.
 */
export function currentPhase(exp: ExperimentLike, todayKey: string): CurrentPhase {
  const schedule = experimentSchedule(exp);

  if (todayKey <= exp.startDate) {
    return { phase: 'elimination', dayOfPhase: 1, phaseLength: exp.eliminationDays };
  }

  const eliminationEnd = schedule.elimination[schedule.elimination.length - 1];
  if (todayKey <= eliminationEnd) {
    return { phase: 'elimination', dayOfPhase: daysBetween(exp.startDate, todayKey) + 1, phaseLength: exp.eliminationDays };
  }

  const challengeEnd = schedule.challenge[schedule.challenge.length - 1];
  if (todayKey <= challengeEnd) {
    return {
      phase: 'challenge',
      dayOfPhase: daysBetween(schedule.challenge[0], todayKey) + 1,
      phaseLength: exp.challengeDays,
    };
  }

  if (todayKey <= schedule.lastDay) {
    return {
      phase: 'observation',
      dayOfPhase: daysBetween(schedule.observation[0], todayKey) + 1,
      phaseLength: exp.observationDays,
    };
  }

  return { phase: 'ready', dayOfPhase: exp.observationDays, phaseLength: exp.observationDays };
}

// ---------------------------------------------------------------------------
// Day facts
// ---------------------------------------------------------------------------

export interface DayFacts {
  /** Any log entry (any type) OR a day check-in that day — never inferred. */
  covered: boolean;
  /** Any `isOutcome` entry that day, or a 'rough' check-in. An outcome beats a 'fine' check-in on the same day. */
  rough: boolean;
  /** Any food entry that day matching `term` (src/lib/watchlist.ts `entryMatchesTerm`). */
  exposed: boolean;
}

/** Per-local-day facts over every entry/check-in supplied — callers slice by phase's day list afterward. */
export function dayFacts(
  entries: readonly LogEntry[],
  checkIns: readonly DayCheckIn[],
  term: string,
): Map<string, DayFacts> {
  const facts = new Map<string, DayFacts>();

  function ensure(key: string): DayFacts {
    const existing = facts.get(key);
    if (existing) return existing;
    const created: DayFacts = { covered: false, rough: false, exposed: false };
    facts.set(key, created);
    return created;
  }

  for (const entry of entries) {
    const day = ensure(formatDateInput(entry.loggedAt));
    day.covered = true;
    if (isOutcome(entry)) day.rough = true;
    if (entryMatchesTerm(entry, term)) day.exposed = true;
  }

  for (const checkIn of checkIns) {
    const day = ensure(checkIn.date);
    day.covered = true;
    if (checkIn.status === 'rough') day.rough = true;
  }

  return facts;
}

// ---------------------------------------------------------------------------
// Phase stats + evaluation
// ---------------------------------------------------------------------------

export interface PhaseStats {
  /** Days in this phase's day list (after any exclusion, e.g. elimination's contaminated days). */
  days: number;
  covered: number;
  rough: number;
  /** rough / covered, or null when nothing was covered. */
  rate: number | null;
}

function phaseStats(dayKeys: readonly string[], facts: ReadonlyMap<string, DayFacts>): PhaseStats {
  let covered = 0;
  let rough = 0;
  for (const key of dayKeys) {
    const day = facts.get(key);
    if (!day?.covered) continue; // uncovered days never count (invariant)
    covered++;
    if (day.rough) rough++;
  }
  return { days: dayKeys.length, covered, rough, rate: covered > 0 ? rough / covered : null };
}

/** Elimination days excluded from stats: each slip day, and the day right after it (the reaction window spills over). */
function excludedEliminationDays(eliminationDays: readonly string[], slipDays: readonly string[]): Set<string> {
  const eliminationSet = new Set(eliminationDays);
  const excluded = new Set<string>();
  for (const slip of slipDays) {
    excluded.add(slip);
    const dayAfter = addDaysKey(slip, 1);
    if (eliminationSet.has(dayAfter)) excluded.add(dayAfter);
  }
  return excluded;
}

export type VerdictKind = 'likely-trigger' | 'likely-not-trigger' | 'inconclusive';

export interface ExperimentVerdict {
  kind: VerdictKind;
  /** null for inconclusive — an inconclusive result has no confidence level. */
  confidence: ConfidenceTier | null;
  /** One plain sentence, e.g. "Too few days logged while avoiding it." */
  reason: string;
  baselineRate: number | null;
  eliminationRate: number | null;
  reintroductionRate: number | null;
}

export interface ExperimentEvaluation {
  baseline: PhaseStats;
  elimination: PhaseStats;
  /** challenge + observation days together. */
  reintroduction: PhaseStats;
  /** Elimination days with exposure (a "slip"). */
  slipDays: string[];
  /** Challenge days with exposure. */
  challengeExposureDays: number;
  /** null until the schedule reaches phase === 'ready'. */
  verdict: ExperimentVerdict | null;
}

// --- Verdict rule constants (named + exported so tests can target them directly) ---

/** Rule 1: more slip days than this makes the elimination phase unreliable. */
export const MAX_SLIP_RATIO = 0.15;
/** Rule 3: minimum baseline days covered. */
export const MIN_BASELINE_COVERED = 7;
/** Rule 3: minimum reintroduction (challenge + observation) days covered. */
export const MIN_REINTRODUCTION_COVERED = 4;
/** Rule 3: floor under the elimination coverage fraction requirement. */
export const MIN_ELIMINATION_COVERED_FLOOR = 5;
/** Rule 3: fraction of elimination days counted that must be covered. */
export const ELIMINATION_COVERED_FRACTION = 0.6;
/** Rule 5: rate-drop/rate-rise threshold for a trigger verdict. */
export const TRIGGER_RATE_THRESHOLD = 0.2;
/** Rule 5: rate-drop/rate-rise threshold under which nothing moved (not-trigger). */
export const NOT_TRIGGER_RATE_THRESHOLD = 0.1;
/** Rule 6 (not-trigger confidence): minimum elimination days covered for medium confidence. */
export const NOT_TRIGGER_MIN_ELIMINATION_COVERED = 10;
/** Rule 6 (not-trigger confidence): minimum reintroduction days covered for medium confidence. */
export const NOT_TRIGGER_MIN_REINTRODUCTION_COVERED = 5;
/** Rule 6 (not-trigger confidence): minimum challenge-exposure days for medium confidence. */
export const NOT_TRIGGER_MIN_CHALLENGE_EXPOSURE = 2;

export const VERDICT_REASON_TOO_MANY_SLIPS = 'Too many slips while avoiding it to draw a reliable conclusion.';
export const VERDICT_REASON_NO_CHALLENGE_EXPOSURE = "You didn't log eating it on the challenge days.";
export const VERDICT_REASON_NOT_ENOUGH_DAYS = 'Not enough days logged to draw a conclusion.';
export const VERDICT_REASON_NO_BASELINE_ROUGH_DAYS =
  'No rough days before the experiment, so there was nothing to improve.';
export const VERDICT_REASON_TRIGGER = 'Rough days dropped while avoiding it and came back after reintroducing it.';
export const VERDICT_REASON_NOT_TRIGGER = "Rough days didn't meaningfully change while avoiding or reintroducing it.";

/** Rule 5's "Mixed results: …" reason, naming which half (if either) moved. */
function mixedResultsReason(drop: number, rise: number): string {
  const dropMoved = drop >= TRIGGER_RATE_THRESHOLD;
  const riseMoved = rise >= TRIGGER_RATE_THRESHOLD;
  if (dropMoved && !riseMoved) {
    return "Mixed results: it improved while avoiding it, but rough days didn't clearly return after reintroducing it.";
  }
  if (riseMoved && !dropMoved) {
    return "Mixed results: rough days increased after reintroducing it, but it didn't clearly improve while avoiding it.";
  }
  return 'Mixed results: the numbers moved a little in both directions — not enough to call it either way.';
}

function computeVerdict(args: {
  exp: ExperimentLike;
  baseline: PhaseStats;
  elimination: PhaseStats;
  reintroduction: PhaseStats;
  slipDays: readonly string[];
  challengeExposureDays: number;
}): ExperimentVerdict {
  const { exp, baseline, elimination, reintroduction, slipDays, challengeExposureDays } = args;
  const rates = { baselineRate: baseline.rate, eliminationRate: elimination.rate, reintroductionRate: reintroduction.rate };

  // Rule 1: too many slips.
  const maxSlips = Math.max(1, Math.floor(exp.eliminationDays * MAX_SLIP_RATIO));
  if (slipDays.length > maxSlips) {
    return { kind: 'inconclusive', confidence: null, reason: VERDICT_REASON_TOO_MANY_SLIPS, ...rates };
  }

  // Rule 2: no logged exposure on any challenge day.
  if (challengeExposureDays === 0) {
    return { kind: 'inconclusive', confidence: null, reason: VERDICT_REASON_NO_CHALLENGE_EXPOSURE, ...rates };
  }

  // Rule 3: not enough days logged in any phase.
  const minEliminationCovered = Math.max(
    MIN_ELIMINATION_COVERED_FLOOR,
    Math.ceil(elimination.days * ELIMINATION_COVERED_FRACTION),
  );
  if (
    baseline.covered < MIN_BASELINE_COVERED ||
    elimination.covered < minEliminationCovered ||
    reintroduction.covered < MIN_REINTRODUCTION_COVERED
  ) {
    return { kind: 'inconclusive', confidence: null, reason: VERDICT_REASON_NOT_ENOUGH_DAYS, ...rates };
  }

  // Rule 4: nothing to improve on.
  if (baseline.rough === 0) {
    return { kind: 'inconclusive', confidence: null, reason: VERDICT_REASON_NO_BASELINE_ROUGH_DAYS, ...rates };
  }

  // Rule 5: compare the three rates. Covered thresholds above guarantee non-null rates here.
  const b = baseline.rate ?? 0;
  const e = elimination.rate ?? 0;
  const r = reintroduction.rate ?? 0;
  const drop = b - e;
  const rise = r - e;

  if (drop >= TRIGGER_RATE_THRESHOLD && rise >= TRIGGER_RATE_THRESHOLD) {
    // Rule 6 (trigger confidence).
    const eliminationUpper = wilsonUpperBound(elimination.rough, elimination.covered);
    const baselineLower = wilsonLowerBound(baseline.rough, baseline.covered);
    const reintroductionLower = wilsonLowerBound(reintroduction.rough, reintroduction.covered);
    const clearsBaseline = eliminationUpper < baselineLower;
    const clearsReintroduction = eliminationUpper < reintroductionLower;
    const confidence: ConfidenceTier =
      clearsBaseline && clearsReintroduction ? 'high' : clearsBaseline || clearsReintroduction ? 'medium' : 'low';
    return { kind: 'likely-trigger', confidence, reason: VERDICT_REASON_TRIGGER, ...rates };
  }

  if (drop < NOT_TRIGGER_RATE_THRESHOLD && rise < NOT_TRIGGER_RATE_THRESHOLD) {
    // Rule 6 (not-trigger confidence) — absence of an effect is never high from one experiment.
    const confidence: ConfidenceTier =
      elimination.covered >= NOT_TRIGGER_MIN_ELIMINATION_COVERED &&
      reintroduction.covered >= NOT_TRIGGER_MIN_REINTRODUCTION_COVERED &&
      challengeExposureDays >= NOT_TRIGGER_MIN_CHALLENGE_EXPOSURE
        ? 'medium'
        : 'low';
    return { kind: 'likely-not-trigger', confidence, reason: VERDICT_REASON_NOT_TRIGGER, ...rates };
  }

  return { kind: 'inconclusive', confidence: null, reason: mixedResultsReason(drop, rise), ...rates };
}

/**
 * Evaluates an experiment against the logs/check-ins supplied: baseline,
 * elimination (contaminated days excluded) and reintroduction (challenge +
 * observation) phase stats, slip tracking, and — once the schedule reaches
 * phase 'ready' — a verdict. `entries`/`checkIns` may be the WHOLE journal;
 * only days within each phase's own list are read.
 */
export function evaluateExperiment(
  exp: ExperimentLike,
  entries: readonly LogEntry[],
  checkIns: readonly DayCheckIn[],
  todayKey: string,
): ExperimentEvaluation {
  const schedule = experimentSchedule(exp);
  const facts = dayFacts(entries, checkIns, exp.term);

  const baseline = phaseStats(schedule.baseline, facts);

  const slipDays = schedule.elimination.filter((key) => facts.get(key)?.exposed === true);
  const excluded = excludedEliminationDays(schedule.elimination, slipDays);
  const eliminationCountedDays = schedule.elimination.filter((key) => !excluded.has(key));
  const elimination = phaseStats(eliminationCountedDays, facts);

  const reintroductionDays = [...schedule.challenge, ...schedule.observation];
  const reintroduction = phaseStats(reintroductionDays, facts);

  const challengeExposureDays = schedule.challenge.filter((key) => facts.get(key)?.exposed === true).length;

  const { phase } = currentPhase(exp, todayKey);
  const verdict =
    phase === 'ready' ? computeVerdict({ exp, baseline, elimination, reintroduction, slipDays, challengeExposureDays }) : null;

  return { baseline, elimination, reintroduction, slipDays, challengeExposureDays, verdict };
}

/**
 * Baseline-only preview for the start screen (HANDOFF.md §4), before an
 * experiment row exists: stats over the `baselineDays` days immediately
 * before `todayKey` (not including today). Equivalent to
 * `evaluateExperiment`'s baseline phase for an experiment that started today.
 */
export function baselinePreview(
  entries: readonly LogEntry[],
  checkIns: readonly DayCheckIn[],
  term: string,
  todayKey: string,
  baselineDays: number = DEFAULT_PROTOCOL.baselineDays,
): PhaseStats {
  const days = dayRange(addDaysKey(todayKey, -baselineDays), baselineDays);
  const facts = dayFacts(entries, checkIns, term);
  return phaseStats(days, facts);
}
