// Day-level daily-factor analysis for Insights (GitHub #23): sleep, stress,
// alcohol, caffeine and (opt-in) period. Mirrors `medications.ts` (#20) — a
// separate module the Insights screen composes ALONGSIDE the food engine;
// `computeInsights`, `analyzeOutcomeRates`, `isOutcome` and `drilldown.ts` are
// untouched, so no food number changes.
//
// Invariants (docs/HANDOFF.md §0): a factor is known only on a day it was
// logged (nothing is inferred; an unlogged day is unknown, never "low"), so
// the comparison base is "days the factor was logged and NOT flagged" — never
// "all other days"; only COVERED days are compared (a factor row covers its
// day); a rough day is an `isOutcome` entry only (check-ins and factor rows
// cover a day, they never make it rough); period data is invisible while
// tracking is off; wording never claims causation. Pure — no React, no I/O.

import type { DayFactor, LogEntry } from '@/db/schema';
import { formatDateInput } from '@/lib/datetime';
import { wilsonLowerBound, type ConfidenceTier } from '@/lib/stats';
import type { DrilldownInstance } from './drilldown';
import {
  CAVEAT_MIN_OVERLAPPING,
  CAVEAT_MIN_SHARE,
  MIN_EXPOSED_DAYS,
  MIN_OTHER_DAYS,
  NEARLY_EVERY_DAY_SHARE,
  coveredAndRoughDays,
} from './medications';
import { MAX_LOW_CONFIDENCE_FINDINGS, MEDIUM_CONFIDENCE_MIN_MEALS, MEDIUM_HIT_RATE_MARGIN } from './temporal';

export type FactorKey = 'stress' | 'sleep' | 'alcohol' | 'caffeine' | 'period';

/** Stable display/processing order. */
export const FACTOR_KEYS: readonly FactorKey[] = ['stress', 'sleep', 'alcohol', 'caffeine', 'period'];

/** Stress at or above this is a flagged ("high-stress") day. */
export const HIGH_STRESS_MIN = 4;

/** The factor columns of a `day_factor` row (all nullable). */
export type FactorRow = Pick<DayFactor, 'date' | 'sleep' | 'stress' | 'alcohol' | 'caffeine' | 'period'>;

export interface FactorDays {
  /** Days the factor counts as "flagged" (high stress, poor sleep, ...). */
  flagged: Set<string>;
  /** Days the factor is known — a superset of `flagged`. */
  logged: Set<string>;
}

// Guards float noise in `rate >= baseRate + margin`.
const EPSILON = 1e-9;

/** The local day key after `key` ('YYYY-MM-DD'). Steps from noon so DST can't skip a day. */
function nextDayKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const cursor = new Date(year, month - 1, day, 12, 0, 0, 0);
  cursor.setDate(cursor.getDate() + 1);
  return formatDateInput(cursor.getTime());
}

/** Whether a row has at least one factor value set (a row whose chips were all cleared logs nothing). */
function hasAnyFactor(row: FactorRow): boolean {
  return (
    row.sleep != null || row.stress != null || row.alcohol != null || row.caffeine != null || row.period != null
  );
}

/**
 * The rows that are visible to every screen and analysis: with period tracking
 * off the period value is blanked (stored data is kept in the DB, just never
 * read), and a row with nothing left logged is dropped. This is the one place
 * the "period stays out of sight" rule lives.
 */
export function visibleFactorRows(rows: readonly FactorRow[], opts: { trackPeriod: boolean }): FactorRow[] {
  const visible: FactorRow[] = [];
  for (const row of rows) {
    const shown = opts.trackPeriod ? row : { ...row, period: null };
    if (hasAnyFactor(shown)) visible.push(shown);
  }
  return visible;
}

/**
 * Per factor: the days it is logged and the days it is flagged. Flag rules:
 * stress >= 4; sleep 'poor'; alcohol 'some' or 'a_lot' (flags that day AND the
 * next, like a medication dose — the next day also joins `logged`, since it is
 * known to sit inside the alcohol window); caffeine 'more'; period true.
 * A factor nobody logged is absent from the map; period is absent entirely
 * when `trackPeriod` is false.
 */
export function factorDays(
  rows: readonly FactorRow[],
  opts: { trackPeriod: boolean },
): Map<FactorKey, FactorDays> {
  const out = new Map<FactorKey, FactorDays>();
  const bucket = (key: FactorKey): FactorDays => {
    let days = out.get(key);
    if (!days) {
      days = { flagged: new Set<string>(), logged: new Set<string>() };
      out.set(key, days);
    }
    return days;
  };

  for (const row of visibleFactorRows(rows, opts)) {
    if (row.stress != null) {
      const days = bucket('stress');
      days.logged.add(row.date);
      if (row.stress >= HIGH_STRESS_MIN) days.flagged.add(row.date);
    }
    if (row.sleep != null) {
      const days = bucket('sleep');
      days.logged.add(row.date);
      if (row.sleep === 'poor') days.flagged.add(row.date);
    }
    if (row.alcohol != null) {
      const days = bucket('alcohol');
      days.logged.add(row.date);
      if (row.alcohol !== 'none') {
        const next = nextDayKey(row.date);
        days.flagged.add(row.date);
        days.flagged.add(next);
        days.logged.add(next);
      }
    }
    if (row.caffeine != null) {
      const days = bucket('caffeine');
      days.logged.add(row.date);
      if (row.caffeine === 'more') days.flagged.add(row.date);
    }
    if (row.period != null) {
      const days = bucket('period');
      days.logged.add(row.date);
      if (row.period) days.flagged.add(row.date);
    }
  }
  return out;
}

const FACTOR_COPY: Record<
  FactorKey,
  {
    /** Finding card title. */
    finding: string;
    /** Note / caveat subject, sentence-start capitalised. */
    note: string;
    /** "Rough on N of M {flagged}". */
    flagged: string;
    /** "...vs N of M {base}". */
    base: string;
    /** "...were {caveat}." */
    caveat: string;
  }
> = {
  stress: {
    finding: 'High-stress days',
    note: 'High stress',
    flagged: 'high-stress days',
    base: 'other days you logged stress',
    caveat: 'on high-stress days',
  },
  sleep: {
    finding: 'Poor-sleep days',
    note: 'Poor sleep',
    flagged: 'poor-sleep days',
    base: 'other days you logged sleep',
    caveat: 'on poor-sleep days',
  },
  alcohol: {
    finding: 'Alcohol days',
    note: 'Alcohol',
    flagged: 'days you had alcohol or the day after',
    base: 'other days you logged alcohol',
    caveat: 'on days you had alcohol or the day after',
  },
  caffeine: {
    finding: 'High-caffeine days',
    note: 'More caffeine than usual',
    flagged: 'days with more caffeine than usual',
    base: 'other days you logged caffeine',
    caveat: 'on days with more caffeine than usual',
  },
  period: {
    finding: 'Period days',
    note: 'Period',
    flagged: 'period days',
    base: 'other days you tracked your period',
    caveat: 'on period days',
  },
};

export interface FactorFinding {
  key: FactorKey;
  /** Card title, e.g. "High-stress days". */
  label: string;
  /** Covered days the factor is flagged. */
  flaggedDays: number;
  flaggedRough: number;
  flaggedRate: number;
  /** Covered days the factor was logged and not flagged. */
  baseDays: number;
  baseRough: number;
  baseRate: number;
  confidence: ConfidenceTier;
}

export interface FactorNote {
  key: FactorKey;
  /** Subject of the note, e.g. "Poor sleep". */
  label: string;
  reason: 'too-few-days' | 'nearly-always';
  flaggedDays: number;
  baseDays: number;
}

/**
 * Compares rough-day rates on covered flagged days vs covered logged-and-not-
 * flagged days, per factor. Gates reuse #20's constants: fewer than
 * MIN_EXPOSED_DAYS flagged days, nearly-always flagged (share >= 90 %), or
 * fewer than MIN_OTHER_DAYS base days become a `note` instead of a finding. A
 * finding needs the flagged rate to exceed the base rate; confidence mirrors
 * the medication analysis (Wilson lower bound over the base rate = high; a
 * margin + minimum days = medium; else low), low findings show only when no
 * medium/high one exists (capped), findings sort by excess rate descending and
 * notes by factor order. A factor that was logged but never flagged has
 * nothing to say and yields neither.
 */
export function analyzeFactorDays(
  entries: readonly LogEntry[],
  checkIns: readonly { date: string }[],
  factorRows: readonly FactorRow[],
  opts: { trackPeriod: boolean },
): { findings: FactorFinding[]; notes: FactorNote[] } {
  const visible = visibleFactorRows(factorRows, opts);
  const days = factorDays(visible, opts);
  const { covered, rough } = coveredAndRoughDays(entries, checkIns, visible);

  const highOrMedium: FactorFinding[] = [];
  const low: FactorFinding[] = [];
  const notes: FactorNote[] = [];

  for (const key of FACTOR_KEYS) {
    const factor = days.get(key);
    if (!factor) continue;

    let flaggedDays = 0;
    let flaggedRough = 0;
    for (const day of factor.flagged) {
      if (!covered.has(day)) continue;
      flaggedDays++;
      if (rough.has(day)) flaggedRough++;
    }
    let baseDays = 0;
    let baseRough = 0;
    for (const day of factor.logged) {
      if (factor.flagged.has(day) || !covered.has(day)) continue;
      baseDays++;
      if (rough.has(day)) baseRough++;
    }

    const copy = FACTOR_COPY[key];
    const note = (reason: FactorNote['reason']) =>
      notes.push({ key, label: copy.note, reason, flaggedDays, baseDays });

    if (flaggedDays < MIN_EXPOSED_DAYS) {
      // Logged but never flagged on a covered day: nothing to compare or say.
      if (flaggedDays > 0) note('too-few-days');
      continue;
    }
    if (flaggedDays / (flaggedDays + baseDays) >= NEARLY_EVERY_DAY_SHARE) {
      note('nearly-always');
      continue;
    }
    if (baseDays < MIN_OTHER_DAYS) {
      note('too-few-days');
      continue;
    }

    const flaggedRate = flaggedRough / flaggedDays;
    const baseRate = baseRough / baseDays;
    if (flaggedRate <= baseRate) continue; // no excess risk — neither finding nor note

    let confidence: ConfidenceTier;
    if (wilsonLowerBound(flaggedRough, flaggedDays) > baseRate) {
      confidence = 'high';
    } else if (
      flaggedRate >= baseRate + MEDIUM_HIT_RATE_MARGIN - EPSILON &&
      flaggedDays >= MEDIUM_CONFIDENCE_MIN_MEALS
    ) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    const finding: FactorFinding = {
      key,
      label: copy.finding,
      flaggedDays,
      flaggedRough,
      flaggedRate,
      baseDays,
      baseRough,
      baseRate,
      confidence,
    };
    (confidence === 'low' ? low : highOrMedium).push(finding);
  }

  const byExcessDesc = (a: FactorFinding, b: FactorFinding) =>
    b.flaggedRate - b.baseRate - (a.flaggedRate - a.baseRate) ||
    FACTOR_KEYS.indexOf(a.key) - FACTOR_KEYS.indexOf(b.key);

  highOrMedium.sort(byExcessDesc);
  const findings =
    highOrMedium.length > 0 ? highOrMedium : low.sort(byExcessDesc).slice(0, MAX_LOW_CONFIDENCE_FINDINGS);
  return { findings, notes };
}

export interface FactorCaveat {
  key: FactorKey;
  label: string;
  /** Hit meals whose day was flagged for this factor. */
  overlapping: number;
  /** All hit meals (followed by a rough outcome) behind the finding. */
  hits: number;
}

/**
 * For one food/ingredient/combination finding's instances: a hit "overlaps" a
 * factor when the MEAL's local day is one of that factor's flagged days.
 * Returns the factor overlapping the most hits when that is at least
 * CAVEAT_MIN_OVERLAPPING and at least CAVEAT_MIN_SHARE of the hits (ties →
 * factor order), else null. Misses never count. Display-only: the finding's
 * own numbers and confidence are never adjusted.
 */
export function factorCaveat(
  instances: readonly DrilldownInstance[],
  days: ReadonlyMap<FactorKey, FactorDays>,
): FactorCaveat | null {
  const hitDays = instances
    .filter((instance) => instance.followedByOutcome)
    .map((instance) => formatDateInput(instance.entry.loggedAt));
  if (hitDays.length < CAVEAT_MIN_OVERLAPPING) return null;

  let best: FactorCaveat | null = null;
  for (const key of FACTOR_KEYS) {
    const factor = days.get(key);
    if (!factor) continue;
    const overlapping = hitDays.filter((day) => factor.flagged.has(day)).length;
    if (overlapping === 0) continue;
    if (best === null || overlapping > best.overlapping) {
      best = { key, label: FACTOR_COPY[key].note, overlapping, hits: hitDays.length };
    }
  }

  if (best === null) return null;
  if (best.overlapping < CAVEAT_MIN_OVERLAPPING) return null;
  if (best.overlapping < hitDays.length * CAVEAT_MIN_SHARE) return null;
  return best;
}

/** "Rough on 6 of 10 high-stress days (60%) vs 3 of 15 other days you logged stress (20%)." Never claims causation. */
export function factorSentence(finding: FactorFinding): string {
  const copy = FACTOR_COPY[finding.key];
  const pct = Math.round(finding.flaggedRate * 100);
  const basePct = Math.round(finding.baseRate * 100);
  return (
    `Rough on ${finding.flaggedRough} of ${finding.flaggedDays} ${copy.flagged} (${pct}%) ` +
    `vs ${finding.baseRough} of ${finding.baseDays} ${copy.base} (${basePct}%).`
  );
}

/** Line for a factor that can't be compared yet. */
export function factorNoteSentence(note: FactorNote): string {
  const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
  if (note.reason === 'nearly-always') {
    return `${note.label} — flagged on nearly every day you logged it, so there's nothing to compare against.`;
  }
  if (note.flaggedDays < MIN_EXPOSED_DAYS) {
    return `${note.label} — only ${note.flaggedDays} logged ${note.flaggedDays === 1 ? 'day' : 'days'} so far.`;
  }
  return `${note.label} — only ${days(note.baseDays)} to compare against so far.`;
}

/** Caveat line inside a food/ingredient/combination card. */
export function factorCaveatSentence(caveat: FactorCaveat): string {
  // Counts MEALS followed by a rough outcome (the card's own unit), not outcomes.
  return `${caveat.overlapping} of the ${caveat.hits} meals followed by a rough outcome were ${FACTOR_COPY[caveat.key].caveat}.`;
}

export const FACTOR_FOOTER = "Days count only when you logged that factor. Linked doesn't mean caused.";
