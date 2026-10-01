// "By chance" check for Insights findings (GitHub #24). Re-runs the very same
// analysis with the rough outcomes SLID against everything else by whole days
// (many times), and averages how many findings appear. That keeps the user's
// eating habits and their rough-day streaks but breaks any real food -> outcome
// link, so the average is how many findings luck alone produces on THIS journal.
//
// Display-only and additive: nothing here changes any existing number, tier,
// order or visibility. Deterministic (no Math.random, no Date.now): the same
// data gives the same numbers on every render. Pure — no React, no I/O.
//
// Wording never claims causation or safety ("luck alone", "could easily be
// chance" — never "this is a coincidence" or "this is real").

import type { LogEntry, Medication, MedicationDose, MedicationEvent } from '@/db/schema';
import type { ConfidenceTier } from '@/lib/stats';
import { compareFactorDays, factorDays, type FactorRow } from './factors';
import { foodCandidates, ingredientCandidates, nutrientCandidates, pairAnalysis } from './insights';
import { compareMedicationDays, coveredAndRoughDays, medicationExposureDays } from './medications';
import { displayOutcomeFindings, isOutcome, SLOW_WINDOW_MS, type OutcomeFinding } from './temporal';

/** Slides are at least this many whole days away from zero (clears the 48 h window). */
export const MIN_SLIDE_DAYS = 3;
/** Fewer than this many possible slides -> no estimate. */
export const MIN_SLIDES = 10;
/** At most this many slides (evenly spaced) are run. */
export const MAX_SLIDES = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Slide distances (days) for a journal spanning `spanDays` days: every d in
 * [MIN_SLIDE_DAYS, spanDays - MIN_SLIDE_DAYS]; when more than MAX_SLIDES,
 * MAX_SLIDES of them evenly spaced (deterministic, ascending, unique); [] when
 * fewer than MIN_SLIDES.
 */
export function slideOffsets(spanDays: number): number[] {
  const lo = MIN_SLIDE_DAYS;
  const hi = spanDays - MIN_SLIDE_DAYS;
  const count = hi - lo + 1;
  if (!Number.isFinite(count) || count < MIN_SLIDES) return [];
  if (count <= MAX_SLIDES) return Array.from({ length: count }, (_, i) => lo + i);
  // count > MAX_SLIDES, so the step is > 1 and every rounded offset is distinct.
  return Array.from({ length: MAX_SLIDES }, (_, i) => lo + Math.round((i * (count - 1)) / (MAX_SLIDES - 1)));
}

function localMidnight(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function earliestMidnight(entries: readonly LogEntry[]): number {
  let min = Infinity;
  for (const e of entries) if (e.loggedAt < min) min = e.loggedAt;
  return localMidnight(min);
}

/** Whole local days from the earliest to the latest entry, inclusive (0 for no entries). */
export function journalSpanDays(entries: readonly LogEntry[]): number {
  if (entries.length === 0) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const e of entries) {
    if (e.loggedAt < min) min = e.loggedAt;
    if (e.loggedAt > max) max = e.loggedAt;
  }
  // Rounded so a 23 h / 25 h DST day still counts as one day.
  return Math.round((localMidnight(max) - localMidnight(min)) / DAY_MS) + 1;
}

/**
 * Meal-level slide: a copy of `entries` where every `isOutcome` entry's
 * loggedAt moves `days` x 24 h later, wrapped circularly inside the journal
 * span [start, start + spanDays x 24 h) where start = local midnight of the
 * earliest entry. Non-outcome entries are the SAME objects (untouched); the
 * input is never mutated.
 */
export function slideOutcomes(entries: readonly LogEntry[], days: number): LogEntry[] {
  if (entries.length === 0) return [];
  const start = earliestMidnight(entries);
  const spanMs = journalSpanDays(entries) * DAY_MS;
  const shiftMs = days * DAY_MS;
  return entries.map((entry) => {
    if (!isOutcome(entry)) return entry;
    const rel = entry.loggedAt - start;
    const moved = (((rel + shiftMs) % spanMs) + spanMs) % spanMs;
    return { ...entry, loggedAt: start + moved };
  });
}

/**
 * Day-level slide: covered days sorted ascending; each rough day's flag moves
 * `positions` places later among them, wrapping. Same number of rough days
 * (rough days that are not covered days are ignored — `coveredAndRoughDays`
 * never produces any).
 */
export function rotateRoughDays(
  covered: ReadonlySet<string>,
  rough: ReadonlySet<string>,
  positions: number,
): Set<string> {
  const sorted = [...covered].sort();
  const n = sorted.length;
  const out = new Set<string>();
  for (let i = 0; i < n; i++) {
    if (!rough.has(sorted[i])) continue;
    out.add(sorted[(((i + positions) % n) + n) % n]);
  }
  return out;
}

export interface ChanceCheck {
  /** Things compared on the real journal (e.g. 42 ingredients). */
  checked: number;
  /** Real-journal candidates at each tier OR BETTER. */
  found: Record<ConfidenceTier, number>;
  /** Mean over slides of candidates at each tier OR BETTER. */
  expected: Record<ConfidenceTier, number>;
  slides: number;
}

export type ChanceFamily =
  | 'ingredients'
  | 'foods'
  | 'pairs'
  | 'slowerIngredients'
  | 'slowerFoods'
  | 'slowerPairs'
  | 'medications'
  | 'factors'
  | 'nutrients';

type Tally = Record<ConfidenceTier, number>;
interface Counted {
  checked: number;
  found: Tally;
}

/** Candidates at each tier or better: `low` counts all, `medium` medium+high, `high` high only. */
function tally(tiers: readonly ConfidenceTier[]): Tally {
  const high = tiers.filter((t) => t === 'high').length;
  const medium = high + tiers.filter((t) => t === 'medium').length;
  return { high, medium, low: tiers.length };
}

/** Slower cards are never low, so their `low` count equals the medium count. */
function slowerTally(tiers: readonly ConfidenceTier[]): Tally {
  const t = tally(tiers.filter((tier) => tier !== 'low'));
  return { high: t.high, medium: t.medium, low: t.medium };
}

/**
 * 48 h candidates at medium or better whose key is NOT among the same
 * journal's shown 24 h findings of that kind — mirroring `analyzeSlowerPatterns`.
 */
function slowerCounted(
  slow: { checked: number; candidates: OutcomeFinding[] },
  shown24: readonly OutcomeFinding[],
): Counted {
  const shownKeys = new Set(shown24.map((f) => f.key));
  const tiers = slow.candidates.filter((f) => !shownKeys.has(f.key)).map((f) => f.confidence);
  return { checked: slow.checked, found: slowerTally(tiers) };
}

const tiersOf = (candidates: readonly { confidence: ConfidenceTier }[]) => candidates.map((c) => c.confidence);

/**
 * Counts for every requested meal-level family on one journal (the real one or
 * a slid copy). The 24 h candidates are computed once and shared between a
 * family and its "slower" counterpart (whose "already shown at 24 h" set is
 * the 24 h candidates run through the same display rules the section uses).
 */
function mealLevelCounts(
  entries: readonly LogEntry[],
  families: ReadonlySet<ChanceFamily>,
): Partial<Record<ChanceFamily, Counted>> {
  const out: Partial<Record<ChanceFamily, Counted>> = {};

  if (families.has('ingredients') || families.has('slowerIngredients')) {
    const day = ingredientCandidates(entries);
    if (families.has('ingredients')) out.ingredients = { checked: day.checked, found: tally(tiersOf(day.candidates)) };
    if (families.has('slowerIngredients')) {
      out.slowerIngredients = slowerCounted(
        ingredientCandidates(entries, SLOW_WINDOW_MS),
        displayOutcomeFindings(day.candidates),
      );
    }
  }
  if (families.has('foods') || families.has('slowerFoods')) {
    const day = foodCandidates(entries);
    if (families.has('foods')) out.foods = { checked: day.checked, found: tally(tiersOf(day.candidates)) };
    if (families.has('slowerFoods')) {
      out.slowerFoods = slowerCounted(foodCandidates(entries, SLOW_WINDOW_MS), displayOutcomeFindings(day.candidates));
    }
  }
  if (families.has('pairs') || families.has('slowerPairs')) {
    const day = pairAnalysis(entries);
    if (families.has('pairs')) out.pairs = { checked: day.checked, found: tally(tiersOf(day.candidates)) };
    if (families.has('slowerPairs')) out.slowerPairs = slowerCounted(pairAnalysis(entries, SLOW_WINDOW_MS), day.shown);
  }
  if (families.has('nutrients')) {
    const r = nutrientCandidates(entries);
    out.nutrients = { checked: r.checked, found: tally(tiersOf(r.candidates)) };
  }
  return out;
}

const MEAL_FAMILIES: readonly ChanceFamily[] = [
  'ingredients',
  'foods',
  'pairs',
  'nutrients',
  'slowerIngredients',
  'slowerFoods',
  'slowerPairs',
];

function emptyTally(): Tally {
  return { high: 0, medium: 0, low: 0 };
}

/** Folds the real counts and each slide's counts into a ChanceCheck. */
function summarizeChance(real: Counted, slides: readonly Tally[]): ChanceCheck {
  const sum = emptyTally();
  for (const s of slides) {
    sum.high += s.high;
    sum.medium += s.medium;
    sum.low += s.low;
  }
  const n = slides.length;
  return {
    checked: real.checked,
    found: real.found,
    expected: { high: sum.high / n, medium: sum.medium / n, low: sum.low / n },
    slides: n,
  };
}

/**
 * One ChanceCheck per family that is asked for; null for a family when the
 * journal is too short (no slides). Each slide is counted with the SAME
 * function used for the real journal.
 */
export function chanceChecks(input: {
  entries: readonly LogEntry[];
  checkIns: readonly { date: string }[];
  meds: readonly Medication[];
  events: readonly MedicationEvent[];
  doses: readonly MedicationDose[];
  factorRows: readonly FactorRow[]; // already visibleFactorRows-filtered
  trackPeriod: boolean;
  families: ReadonlySet<ChanceFamily>;
}): Partial<Record<ChanceFamily, ChanceCheck | null>> {
  const { entries, families } = input;
  const result: Partial<Record<ChanceFamily, ChanceCheck | null>> = {};

  // --- Meal-level families: slide the outcomes' timestamps against the meals.
  const mealFamilies = new Set(MEAL_FAMILIES.filter((f) => families.has(f)));
  if (mealFamilies.size > 0) {
    const offsets = slideOffsets(journalSpanDays(entries));
    if (offsets.length === 0) {
      for (const f of mealFamilies) result[f] = null;
    } else {
      const real = mealLevelCounts(entries, mealFamilies);
      const perFamily = new Map<ChanceFamily, Tally[]>([...mealFamilies].map((f) => [f, []]));
      for (const days of offsets) {
        const slid = mealLevelCounts(slideOutcomes(entries, days), mealFamilies);
        for (const f of mealFamilies) perFamily.get(f)?.push((slid[f] as Counted).found);
      }
      for (const f of mealFamilies) {
        result[f] = summarizeChance(real[f] as Counted, perFamily.get(f) ?? []);
      }
    }
  }

  // --- Day-level families: rotate the rough-day flags among the covered days.
  const wantMeds = families.has('medications');
  const wantFactors = families.has('factors');
  if (wantMeds || wantFactors) {
    const { covered, rough } = coveredAndRoughDays(entries, input.checkIns, input.factorRows);
    const offsets = slideOffsets(covered.size);
    if (offsets.length === 0) {
      if (wantMeds) result.medications = null;
      if (wantFactors) result.factors = null;
    } else {
      const exposure = medicationExposureDays(input.meds, input.events, input.doses);
      const days = factorDays(input.factorRows, { trackPeriod: input.trackPeriod });
      const countAt = (roughSet: ReadonlySet<string>) => {
        const m = wantMeds ? compareMedicationDays(covered, roughSet, input.meds, exposure) : null;
        const f = wantFactors ? compareFactorDays(covered, roughSet, days) : null;
        return {
          meds: m && { checked: m.checked, found: tally(tiersOf(m.candidates)) },
          factors: f && { checked: f.checked, found: tally(tiersOf(f.candidates)) },
        };
      };
      const real = countAt(rough);
      const medSlides: Tally[] = [];
      const factorSlides: Tally[] = [];
      for (const d of offsets) {
        const slid = countAt(rotateRoughDays(covered, rough, d));
        if (slid.meds) medSlides.push(slid.meds.found);
        if (slid.factors) factorSlides.push(slid.factors.found);
      }
      if (real.meds) result.medications = summarizeChance(real.meds, medSlides);
      if (real.factors) result.factors = summarizeChance(real.factors, factorSlides);
    }
  }

  return result;
}

/**
 * The one-line copy for a finding card of confidence `tier`. `null` check (a
 * journal too short to slide) says the check needs more history. Otherwise it
 * compares the card against how many findings luck alone produces at this
 * tier or better, and adds "could easily be chance" when luck explains as many
 * findings as were found (the number read, rounded, is at least the number found).
 */
export function chanceSentence(
  check: ChanceCheck | null,
  tier: ConfidenceTier,
  noun: { one: string; many: string },
): string {
  if (check === null) return 'Chance check: needs a couple of weeks of logs first.';
  const expected = check.expected[tier];
  const shown = expected < 0.5 ? 'fewer than 1' : `about ${Math.round(expected)}`;
  const label = check.checked === 1 ? noun.one : noun.many;
  let sentence = `Chance check: of ${check.checked} ${label} checked, luck alone would make ${shown} look this strong.`;
  if (expected >= 0.5 && Math.round(expected) >= check.found[tier]) {
    sentence += " That's as many as you have, so this could easily be chance.";
  }
  return sentence;
}
