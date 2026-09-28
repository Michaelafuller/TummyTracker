// Plain-English copy for the experiment screens (GitHub #19) — pure string
// building, no React, so it's the easiest part of the UI layer to unit-test
// (CLAUDE.md §5). Kept separate from engine.ts (the math) on purpose.
import {
  MIN_BASELINE_COVERED,
  type ExperimentEvaluation,
  type ExperimentSchedule,
  type ExperimentVerdict,
  type Phase,
  type PhaseStats,
  type VerdictKind,
} from './engine';
import { formatLongDate } from '@/lib/datetime';
import type { ConfidenceTier } from '@/lib/stats';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** "Sep 28 – Oct 11" (same month drops the repeated month name; a single day shows once). */
export function formatDayRange(startKey: string, endKey: string): string {
  const start = parseDateKey(startKey);
  const startLabel = `${MONTHS_SHORT[start.getMonth()]} ${start.getDate()}`;
  if (startKey === endKey) return startLabel;
  const end = parseDateKey(endKey);
  const endLabel =
    start.getMonth() === end.getMonth() ? `${end.getDate()}` : `${MONTHS_SHORT[end.getMonth()]} ${end.getDate()}`;
  return `${startLabel} – ${endLabel}`;
}

/** The start screen's three-line plan, e.g. "Avoid it: Sep 28 – Oct 11", "Eat it once a day: Oct 12 – 14", "Keep logging: Oct 15 – 17". */
export function experimentPlanLines(schedule: ExperimentSchedule): string[] {
  return [
    `Avoid it: ${formatDayRange(schedule.elimination[0], schedule.elimination[schedule.elimination.length - 1])}`,
    `Eat it once a day: ${formatDayRange(schedule.challenge[0], schedule.challenge[schedule.challenge.length - 1])}`,
    `Keep logging: ${formatDayRange(schedule.observation[0], schedule.observation[schedule.observation.length - 1])}`,
  ];
}

/** "Your last 14 days: 9 logged, 4 rough, ate it on 5." — the start screen's baseline preview. */
export function baselinePreviewSentence(stats: PhaseStats): string {
  return `Your last ${stats.days} days: ${stats.covered} logged, ${stats.rough} rough, ate it on ${stats.exposed}.`;
}

/** A warning when the baseline looks too thin to yield a real verdict later — null when it's fine. Starting is still allowed either way. */
export function baselineWarning(stats: PhaseStats): string | null {
  if (stats.covered < MIN_BASELINE_COVERED) {
    return "Not many days logged recently — the verdict will likely be inconclusive unless you log more before starting.";
  }
  if (stats.exposed === 0) {
    return "You haven't logged eating it in the last two weeks, so avoiding it may have nothing to change — the verdict will likely be inconclusive.";
  }
  if (stats.rough === 0) {
    return 'No rough days in the last two weeks, so there may be nothing to detect.';
  }
  return null;
}

/** Verbatim safety copy (design contract, docs/HANDOFF.md §4) — shown on the start screen. */
export const EXPERIMENT_SAFETY_NOTE =
  "Don't use this to test a food that has caused a severe reaction — swelling, hives, trouble breathing or vomiting. Talk to a clinician first.";

/** Shown on the start screen when another experiment is already active. */
export const EXPERIMENT_ACTIVE_BLOCKED_MESSAGE = 'Finish or end your current experiment first.';

/** The follow screen's header phase line, e.g. "Avoiding · day 5 of 14". */
export function phaseStatusLine(phase: Phase, dayOfPhase: number, phaseLength: number): string {
  switch (phase) {
    case 'elimination':
      return `Avoiding · day ${dayOfPhase} of ${phaseLength}`;
    case 'challenge':
      return `Eat it once today · challenge day ${dayOfPhase} of ${phaseLength}`;
    case 'observation':
      return `Keep logging · day ${dayOfPhase} of ${phaseLength}`;
    case 'ready':
      return 'Verdict ready';
  }
}

/** One plain sentence of today's instruction, per phase. */
export function phaseInstruction(phase: Phase, term: string): string {
  switch (phase) {
    case 'elimination':
      return `Avoid ${term} today, and keep logging as usual.`;
    case 'challenge':
      return `Eat ${term} once today, and log it like any other food.`;
    case 'observation':
      return 'Keep logging how you feel today — no need to eat it again.';
    case 'ready':
      return 'The schedule is complete — finish the experiment to see your verdict.';
  }
}

/** The challenge-day exposure indicator: "Logged today ✓" / "Not logged yet". */
export function challengeTodayLabel(exposedToday: boolean): string {
  return exposedToday ? 'Logged today ✓' : 'Not logged yet';
}

/** "1 slip — the day after is left out too." / "2 slips — the day after each is left out too." Null when there were none. */
export function slipsSentence(slipDays: readonly string[]): string | null {
  if (slipDays.length === 0) return null;
  return slipDays.length === 1
    ? '1 slip — the day after is left out too.'
    : `${slipDays.length} slips — the day after each is left out too.`;
}

/** "Logged so far — avoiding: 9 of 14, reintroducing: 3 of 6." — progress while the experiment is still running. */
export function daysLoggedSoFarSentence(evaluation: ExperimentEvaluation): string {
  return (
    `Logged so far — avoiding: ${evaluation.elimination.covered} of ${evaluation.elimination.days}, ` +
    `reintroducing: ${evaluation.reintroduction.covered} of ${evaluation.reintroduction.days}.`
  );
}

/** "Ended early on August 21, 2026." — shown for an abandoned experiment. */
export function endedEarlySentence(endedAt: number): string {
  return `Ended early on ${formatLongDate(endedAt)}.`;
}

/** The verdict card's headline. */
export function verdictHeadline(kind: VerdictKind): string {
  switch (kind) {
    case 'likely-trigger':
      return 'Likely a trigger';
    case 'likely-not-trigger':
      return 'Likely not a trigger';
    case 'inconclusive':
      return 'Inconclusive';
  }
}

/** The confidence chip's label — reuses Insights' tier names. */
export function confidenceChipLabel(confidence: ConfidenceTier): string {
  const name = confidence === 'high' ? 'High' : confidence === 'medium' ? 'Medium' : 'Low';
  return `${name} confidence`;
}

function pct(rate: number | null): string {
  return rate == null ? '—' : `${Math.round(rate * 100)}%`;
}

/** "Rough days: before 43% (6 of 14 logged) · while avoiding 7% (1 of 14) · after reintroducing 50% (3 of 6)". */
export function verdictNumbersSentence(evaluation: ExperimentEvaluation): string {
  const { baseline, elimination, reintroduction } = evaluation;
  return (
    `Rough days: before ${pct(baseline.rate)} (${baseline.rough} of ${baseline.covered} logged) · ` +
    `while avoiding ${pct(elimination.rate)} (${elimination.rough} of ${elimination.covered}) · ` +
    `after reintroducing ${pct(reintroduction.rate)} (${reintroduction.rough} of ${reintroduction.covered})`
  );
}

/**
 * Rate-only variant of {@link verdictNumbersSentence} for a FROZEN verdict
 * (`experiment.verdictJson`): a completed experiment only snapshots the three
 * rates, not the absolute day/covered/rough counts, so there's nothing to
 * re-derive "X of Y" from — and re-deriving it live would defeat the whole
 * point of freezing (CLAUDE.md §0: later log edits must never rewrite a
 * finished experiment's verdict).
 */
export function verdictRatesSentence(verdict: ExperimentVerdict): string {
  return (
    `Rough days: before ${pct(verdict.baselineRate)} · while avoiding ${pct(verdict.eliminationRate)} · ` +
    `after reintroducing ${pct(verdict.reintroductionRate)}`
  );
}

/** Shown on an active experiment's screen while notification permission isn't granted. */
export const NOTIFICATIONS_OFF_HINT = 'Turn on notifications to get a reminder when each phase starts.';

/** Verbatim disclaimer shown under every verdict, whatever its kind (design contract). */
export const VERDICT_DISCLAIMER = 'An observation from your own logs, not a diagnosis.';
