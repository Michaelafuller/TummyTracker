// Day-level medication analysis for Insights (GitHub #20). A new module the
// Insights screen composes ALONGSIDE the food engine — `computeInsights`,
// `analyzeOutcomeRates`, `isOutcome` and `drilldown.ts` are untouched.
//
// Invariants (docs/HANDOFF.md §0): exposure comes only from logged dose rows
// (never frequency / start / end / "active"); only COVERED days are compared
// (a day with no log entry and no check-in is left out); a day check-in
// covers a day but never makes it rough; wording elsewhere never claims
// causation. Pure and fixture-testable — no React, no I/O.

import type { LogEntry, Medication, MedicationDose, MedicationEvent } from '@/db/schema';
import { FOOD_TYPES } from '@/db/schema';
import { parseTagsJson } from '@/lib/ingredients';
import { formatDateInput } from '@/lib/datetime';
import { effectTailDays } from '@/lib/medicationClasses';
import { flattenDoseRecords } from '@/lib/medications';
import { wilsonLowerBound, type ConfidenceTier } from '@/lib/stats';
import { flagFollowedByOutcome, type DrilldownInstance } from './drilldown';
import {
  DEFAULT_WINDOW_MS,
  MAX_LOW_CONFIDENCE_FINDINGS,
  MEDIUM_CONFIDENCE_MIN_MEALS,
  MEDIUM_HIT_RATE_MARGIN,
  isOutcome,
} from './temporal';

/** A medication needs at least this many covered exposed days to be compared at all. */
export const MIN_EXPOSED_DAYS = 5;
/** ...and at least this many covered unexposed days to compare against. */
export const MIN_OTHER_DAYS = 5;
/** Exposed days at or above this share of all covered days leave nothing to compare against. */
export const NEARLY_EVERY_DAY_SHARE = 0.9;
/** A caveat needs at least this many of a finding's rough outcomes overlapping one medication... */
export const CAVEAT_MIN_OVERLAPPING = 2;
/** ...and at least this share of them. */
export const CAVEAT_MIN_SHARE = 0.5;

const FOOD_TYPES_SET = new Set(FOOD_TYPES as readonly string[]);
// Guards float noise in `rate >= otherRate + margin` (0.6 vs 0.45 + 0.15).
const EPSILON = 1e-9;

/** Local day keys ('YYYY-MM-DD') for `startMs`'s day and `tailDays` days after it. */
function dayKeysFrom(startMs: number, tailDays: number): string[] {
  // Step from local noon so a DST shift can never skip or repeat a day.
  const cursor = new Date(startMs);
  cursor.setHours(12, 0, 0, 0);
  const keys: string[] = [];
  for (let i = 0; i <= tailDays; i++) {
    keys.push(formatDateInput(cursor.getTime()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/**
 * Per medication id: the set of local day keys it counts as "exposed" — each
 * logged dose's day plus `effectTailDays(med.name)` days after it (overlapping
 * doses union). A medication with no doses is absent from the map (active or
 * not: an inactive medication's dose history is still real).
 */
export function medicationExposureDays(
  meds: readonly Medication[],
  events: readonly MedicationEvent[],
  doses: readonly MedicationDose[],
): Map<string, Set<string>> {
  const exposure = new Map<string, Set<string>>();
  const medsById = new Map(meds.map((med) => [med.id, med] as const));

  for (const record of flattenDoseRecords(events, doses)) {
    const med = medsById.get(record.medicationId);
    if (!med) continue;
    let days = exposure.get(med.id);
    if (!days) {
      days = new Set<string>();
      exposure.set(med.id, days);
    }
    for (const key of dayKeysFrom(record.takenAt, effectTailDays(med.name))) days.add(key);
  }

  return exposure;
}

/**
 * Covered = a local day with any log entry (any type), a day check-in, or —
 * when `factorRows` is passed (GitHub #23; rows that logged at least one
 * visible factor, see `visibleFactorRows`) — a daily-factor row. Rough = a
 * local day with >= 1 `isOutcome` entry. A check-in or factor row only covers
 * a day, it never makes one rough (CLAUDE.md §0, #13).
 */
export function coveredAndRoughDays(
  entries: readonly LogEntry[],
  checkIns: readonly { date: string }[],
  factorRows: readonly { date: string }[] = [],
): { covered: Set<string>; rough: Set<string> } {
  const covered = new Set<string>();
  const rough = new Set<string>();
  for (const entry of entries) {
    const key = formatDateInput(entry.loggedAt);
    covered.add(key);
    if (isOutcome(entry)) rough.add(key);
  }
  for (const checkIn of checkIns) covered.add(checkIn.date);
  for (const row of factorRows) covered.add(row.date);
  return { covered, rough };
}

export interface MedicationFinding {
  medicationId: string;
  name: string;
  /** Covered days that count as exposed. */
  exposedDays: number;
  exposedRough: number;
  exposedRate: number;
  /** Covered days that don't. */
  otherDays: number;
  otherRough: number;
  otherRate: number;
  confidence: ConfidenceTier;
}

export interface MedicationNote {
  medicationId: string;
  name: string;
  reason: 'nearly-every-day' | 'too-few-days';
  exposedDays: number;
}

/**
 * Compares rough-day rates on covered exposed days vs covered other days for
 * every medication with >= 1 logged dose. See the exported constants for the
 * gates. A medication with too few exposed days, or nearly every covered day
 * exposed (or too few unexposed days), becomes a `note` instead of a finding.
 * Otherwise a finding only when the exposed rate exceeds the other rate;
 * confidence mirrors `analyzeOutcomeRates` (Wilson lower bound over the other
 * rate = high; a margin + minimum days = medium; else low), and low findings
 * show only when no medium/high one exists, capped like foods. Findings sort
 * by excess rate descending, notes A–Z. `factorRows` (daily factors, #23)
 * only widens the covered-day pools: a day with a factor row counts as covered.
 */
export function analyzeMedicationDays(
  entries: readonly LogEntry[],
  checkIns: readonly { date: string }[],
  meds: readonly Medication[],
  events: readonly MedicationEvent[],
  doses: readonly MedicationDose[],
  factorRows: readonly { date: string }[] = [],
): { findings: MedicationFinding[]; notes: MedicationNote[] } {
  const exposure = medicationExposureDays(meds, events, doses);
  const { covered, rough } = coveredAndRoughDays(entries, checkIns, factorRows);
  const { candidates, notes } = compareMedicationDays(covered, rough, meds, exposure);

  const highOrMedium = candidates.filter((f) => f.confidence !== 'low');
  const low = candidates.filter((f) => f.confidence === 'low');

  const byExcessDesc = (a: MedicationFinding, b: MedicationFinding) =>
    b.exposedRate - b.otherRate - (a.exposedRate - a.otherRate) || a.name.localeCompare(b.name);

  notes.sort((a, b) => a.name.localeCompare(b.name));
  highOrMedium.sort(byExcessDesc);
  const findings =
    highOrMedium.length > 0 ? highOrMedium : low.sort(byExcessDesc).slice(0, MAX_LOW_CONFIDENCE_FINDINGS);
  return { findings, notes };
}

/**
 * The comparison core behind `analyzeMedicationDays`, taking the covered and
 * rough day sets as arguments so the chance check (chance.ts) can pass a slid
 * `rough` set. Returns, with NO display rules (no low-only fallback, no cap,
 * no sorting): `checked` - medications that were actually compared (not turned
 * into a note); `candidates` - every compared medication whose exposed rate
 * exceeds its other-days rate, at every tier (low included); and `notes` in
 * `meds` order. The gates and tiers are documented on `analyzeMedicationDays`.
 */
export function compareMedicationDays(
  covered: ReadonlySet<string>,
  rough: ReadonlySet<string>,
  meds: readonly Medication[],
  exposure: ReadonlyMap<string, ReadonlySet<string>>,
): {
  checked: number;
  candidates: MedicationFinding[];
  notes: MedicationNote[];
  /** Per medication id, the sorted covered exposed day keys joined (look-alike detection, chance.ts). */
  signatures: Map<string, string>;
} {
  let checked = 0;
  const signatures = new Map<string, string>();
  const candidates: MedicationFinding[] = [];
  const notes: MedicationNote[] = [];

  for (const med of meds) {
    const days = exposure.get(med.id);
    if (!days) continue;

    let exposedDays = 0;
    let exposedRough = 0;
    for (const key of days) {
      if (!covered.has(key)) continue;
      exposedDays++;
      if (rough.has(key)) exposedRough++;
    }
    const otherDays = covered.size - exposedDays;
    const otherRough = rough.size - exposedRough;

    if (exposedDays < MIN_EXPOSED_DAYS) {
      notes.push({ medicationId: med.id, name: med.name, reason: 'too-few-days', exposedDays });
      continue;
    }
    if (exposedDays / covered.size >= NEARLY_EVERY_DAY_SHARE || otherDays < MIN_OTHER_DAYS) {
      notes.push({ medicationId: med.id, name: med.name, reason: 'nearly-every-day', exposedDays });
      continue;
    }
    checked++;

    const exposedRate = exposedRough / exposedDays;
    const otherRate = otherRough / otherDays;
    if (exposedRate <= otherRate) continue; // no excess risk: neither finding nor note

    let confidence: ConfidenceTier;
    if (wilsonLowerBound(exposedRough, exposedDays) > otherRate) {
      confidence = 'high';
    } else if (
      exposedRate >= otherRate + MEDIUM_HIT_RATE_MARGIN - EPSILON &&
      exposedDays >= MEDIUM_CONFIDENCE_MIN_MEALS
    ) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    candidates.push({
      medicationId: med.id,
      name: med.name,
      exposedDays,
      exposedRough,
      exposedRate,
      otherDays,
      otherRough,
      otherRate,
      confidence,
    });
    signatures.set(med.id, [...days].filter((key) => covered.has(key)).sort().join('|'));
  }

  return { checked, candidates, notes, signatures };
}

export interface ConfounderCaveat {
  medicationId: string;
  name: string;
  /** Rough outcomes (hits) whose meal fell on one of the medication's exposure days. */
  overlapping: number;
  /** All rough outcomes (hits) behind the finding. */
  hits: number;
}

/**
 * For one food/ingredient/combination finding's instances: a hit "overlaps" a
 * medication when the MEAL's local day is in that medication's exposure days.
 * Returns the medication overlapping the most hits when that is at least
 * CAVEAT_MIN_OVERLAPPING and at least CAVEAT_MIN_SHARE of the hits (ties →
 * A–Z by name), else null. Misses never count. Display-only: the finding's
 * own numbers and confidence are never adjusted.
 */
export function confounderCaveat(
  instances: readonly DrilldownInstance[],
  exposure: ReadonlyMap<string, ReadonlySet<string>>,
  meds: readonly Medication[],
): ConfounderCaveat | null {
  const hitDays = instances
    .filter((instance) => instance.followedByOutcome)
    .map((instance) => formatDateInput(instance.entry.loggedAt));
  if (hitDays.length < CAVEAT_MIN_OVERLAPPING) return null;

  let best: ConfounderCaveat | null = null;
  for (const med of meds) {
    const days = exposure.get(med.id);
    if (!days) continue;
    const overlapping = hitDays.filter((key) => days.has(key)).length;
    if (overlapping === 0) continue;
    const better =
      best === null ||
      overlapping > best.overlapping ||
      (overlapping === best.overlapping && med.name.localeCompare(best.name) < 0);
    if (better) {
      best = { medicationId: med.id, name: med.name, overlapping, hits: hitDays.length };
    }
  }

  if (best === null) return null;
  if (best.overlapping < CAVEAT_MIN_OVERLAPPING) return null;
  if (best.overlapping < hitDays.length * CAVEAT_MIN_SHARE) return null;
  return best;
}

/**
 * Instances for a combination finding ("a + b", tags order-free): food
 * entries whose tags contain both, flagged with the same "followed by an
 * outcome" join as `findingInstances`.
 */
export function pairInstances(
  entries: readonly LogEntry[],
  pairKey: string,
  windowMs: number = DEFAULT_WINDOW_MS,
): DrilldownInstance[] {
  const tags = pairKey.split(' + ');
  if (tags.length !== 2) return [];
  const [a, b] = tags;
  const matching = entries.filter((entry) => {
    if (!FOOD_TYPES_SET.has(entry.type)) return false;
    const entryTags = parseTagsJson(entry.tagsJson);
    return entryTags.includes(a) && entryTags.includes(b);
  });
  return flagFollowedByOutcome(matching, entries, windowMs);
}
