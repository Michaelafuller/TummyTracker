import type { LogEntry } from '@/db/schema';
import { buildJournal, dayAt, makeEntry } from '../testUtils/journal';
import {
  analyzeFoodOutcomes,
  analyzeIngredientOutcomes,
  analyzeNutrientOutcomes,
  analyzePairOutcomes,
  foodCandidates,
  ingredientCandidates,
  MAX_PAIR_FINDINGS,
  nutrientCandidates,
  pairCandidates,
} from '../insights';
import { analyzeFactorDays, compareFactorDays, factorDays, visibleFactorRows } from '../factors';
import {
  analyzeMedicationDays,
  compareMedicationDays,
  coveredAndRoughDays,
  medicationExposureDays,
} from '../medications';
import {
  MAX_LOW_CONFIDENCE_FINDINGS,
  outcomeRateCandidates,
  type OutcomeFinding,
} from '../temporal';

const SEEDS = [1, 2, 3, 4, 5, 6];

/** The display rules, restated: medium+high sorted by excess, else the top-N lows. */
function display<T extends { confidence: string }>(
  candidates: readonly T[],
  excess: (f: T) => number,
  max: number = MAX_LOW_CONFIDENCE_FINDINGS,
): T[] {
  const byExcessDesc = (a: T, b: T) => excess(b) - excess(a);
  const strong = candidates.filter((c) => c.confidence !== 'low').sort(byExcessDesc);
  if (strong.length > 0) return strong;
  return candidates
    .filter((c) => c.confidence === 'low')
    .sort(byExcessDesc)
    .slice(0, max);
}

const outcomeExcess = (f: OutcomeFinding) => f.hitRate - f.baseRate;

/** Odd seeds are pure noise; even seeds plant a signal so medium/high tiers appear too. */
function journalFor(seed: number) {
  return buildJournal({
    seed,
    plantedTag: seed % 2 === 0 ? 'planted' : undefined,
    days: 70,
    tagPool: 8,
    tagsPerMeal: [2, 3],
    foodPool: 6,
    outcomeProb: 0.35,
    medCount: 3,
    factors: true,
  });
}

describe('outcome-rate candidates', () => {
  it('ingredients: the public function equals candidates then display rules', () => {
    for (const seed of SEEDS) {
      const { entries } = journalFor(seed);
      const { candidates } = ingredientCandidates(entries);
      expect(analyzeIngredientOutcomes(entries)).toEqual(display(candidates, outcomeExcess));
    }
  });

  it('foods: the public function equals candidates then display rules', () => {
    for (const seed of SEEDS) {
      const { entries } = journalFor(seed);
      const { candidates } = foodCandidates(entries);
      expect(analyzeFoodOutcomes(entries)).toEqual(display(candidates, outcomeExcess));
    }
  });

  it('includes low-tier candidates even when medium/high exist', () => {
    const tiers = new Set<string>();
    for (const seed of SEEDS) {
      for (const f of ingredientCandidates(journalFor(seed).entries).candidates) tiers.add(f.confidence);
    }
    expect(tiers.has('low')).toBe(true);
    expect(tiers.has('high') || tiers.has('medium')).toBe(true);
  });

  it('pairs: every shown pair is an uncapped interaction candidate, and the list is capped', () => {
    for (const seed of SEEDS) {
      const { entries } = journalFor(seed);
      const shown = analyzePairOutcomes(entries);
      const { candidates } = pairCandidates(entries);
      for (const f of shown) expect(candidates).toContainEqual(f);
      expect(shown.length).toBeLessThanOrEqual(MAX_PAIR_FINDINGS);
    }
  });

  it('checked counts only keys that reach minOccurrences', () => {
    const entries: LogEntry[] = [];
    // "a" on 4 meals (compared), "b" on 2 (below the gate of 3), "c" on 3 (exactly at the gate).
    for (let i = 0; i < 4; i++) entries.push(makeEntry({ loggedAt: dayAt(i), tagsJson: JSON.stringify(['a']) }));
    for (let i = 0; i < 2; i++) entries.push(makeEntry({ loggedAt: dayAt(10 + i), tagsJson: JSON.stringify(['b']) }));
    for (let i = 0; i < 3; i++) entries.push(makeEntry({ loggedAt: dayAt(20 + i), tagsJson: JSON.stringify(['c']) }));
    const keysOf = (m: LogEntry) =>
      (JSON.parse(m.tagsJson ?? '[]') as string[]).map((t) => ({ key: t, label: t }));
    expect(outcomeRateCandidates(entries, keysOf).checked).toBe(2);
    expect(outcomeRateCandidates(entries, keysOf, { minOccurrences: 4 }).checked).toBe(1);
    expect(outcomeRateCandidates([], keysOf)).toEqual({ checked: 0, candidates: [] });
  });
});

describe('nutrientCandidates', () => {
  it('the public function equals candidates minus low, sorted by rate gap', () => {
    for (const seed of SEEDS) {
      const { entries } = journalFor(seed);
      const { candidates } = nutrientCandidates(entries);
      const expected = candidates
        .filter((c) => c.confidence !== 'low')
        .sort((a, b) => b.highRate - b.lowRate - (a.highRate - a.lowRate));
      expect(analyzeNutrientOutcomes(entries)).toEqual(expected);
    }
  });

  it('checked counts nutrients passing the sample and group-size gates', () => {
    const { entries } = journalFor(1);
    // calories, fatG and sodiumMg are populated; the other five nutrients never are.
    expect(nutrientCandidates(entries).checked).toBe(3);
    expect(nutrientCandidates([]).checked).toBe(0);
    // 7 samples is below MIN_NUTRIENT_SAMPLES.
    const few = entries.filter((e) => e.calories != null).slice(0, 7);
    expect(nutrientCandidates(few).checked).toBe(0);
  });

  it('keeps the low tier that the public function suppresses', () => {
    // 4 high-calorie meals (3 followed by a rough symptom) vs 4 low-calorie (2 followed):
    // rate gap 0.25 clears the margin, but 4 meals is too few for medium and
    // the Wilson bound of 3/4 does not clear 0.5 - so it is a low candidate.
    const entries: LogEntry[] = [];
    const meal = (day: number, calories: number, rough: boolean) => {
      entries.push(makeEntry({ loggedAt: dayAt(day, 12), calories }));
      if (rough) entries.push(makeEntry({ type: 'symptom', loggedAt: dayAt(day, 14), severity: 4 }));
    };
    [true, true, true, false].forEach((rough, i) => meal(i * 3, 500, rough));
    [true, true, false, false].forEach((rough, i) => meal(20 + i * 3, 100, rough));
    const { checked, candidates } = nutrientCandidates(entries);
    expect(checked).toBe(1);
    expect(candidates.map((c) => [c.nutrient, c.confidence])).toEqual([['calories', 'low']]);
    expect(analyzeNutrientOutcomes(entries)).toEqual([]);
  });
});

describe('compareMedicationDays', () => {
  it('the public function equals the core then display rules', () => {
    for (const seed of SEEDS) {
      const j = journalFor(seed);
      const exposure = medicationExposureDays(j.meds, j.events, j.doses);
      const { covered, rough } = coveredAndRoughDays(j.entries, j.checkIns, j.factorRows);
      const core = compareMedicationDays(covered, rough, j.meds, exposure);
      const pub = analyzeMedicationDays(j.entries, j.checkIns, j.meds, j.events, j.doses, j.factorRows);
      const byExcessDesc = (
        a: { exposedRate: number; otherRate: number; name: string },
        b: { exposedRate: number; otherRate: number; name: string },
      ) => b.exposedRate - b.otherRate - (a.exposedRate - a.otherRate) || a.name.localeCompare(b.name);
      const strong = core.candidates.filter((c) => c.confidence !== 'low').sort(byExcessDesc);
      const expected =
        strong.length > 0
          ? strong
          : core.candidates
              .filter((c) => c.confidence === 'low')
              .sort(byExcessDesc)
              .slice(0, MAX_LOW_CONFIDENCE_FINDINGS);
      expect(pub.findings).toEqual(expected);
      expect(pub.notes).toEqual([...core.notes].sort((a, b) => a.name.localeCompare(b.name)));
    }
  });

  it('checked excludes medications turned into notes', () => {
    const j = journalFor(1);
    const exposure = medicationExposureDays(j.meds, j.events, j.doses);
    const { covered, rough } = coveredAndRoughDays(j.entries, j.checkIns, j.factorRows);
    const core = compareMedicationDays(covered, rough, j.meds, exposure);
    expect(core.checked + core.notes.length).toBe(j.meds.filter((m) => exposure.has(m.id)).length);
    // With no exposure at all, nothing is compared or noted.
    expect(compareMedicationDays(covered, rough, j.meds, new Map())).toEqual({
      checked: 0,
      candidates: [],
      notes: [],
    });
  });
});

describe('compareFactorDays', () => {
  it('the public function equals the core then display rules', () => {
    for (const seed of SEEDS) {
      const j = journalFor(seed);
      const opts = { trackPeriod: false };
      const visible = visibleFactorRows(j.factorRows, opts);
      const days = factorDays(visible, opts);
      const { covered, rough } = coveredAndRoughDays(j.entries, j.checkIns, visible);
      const core = compareFactorDays(covered, rough, days);
      const pub = analyzeFactorDays(j.entries, j.checkIns, j.factorRows, opts);
      const expected = display(core.candidates, (f) => f.flaggedRate - f.baseRate);
      expect(pub.findings.map((f) => f.key).sort()).toEqual(expected.map((f) => f.key).sort());
      expect(pub.notes).toEqual(core.notes);
    }
  });

  it('checked counts compared factors only', () => {
    const j = journalFor(1);
    const opts = { trackPeriod: false };
    const visible = visibleFactorRows(j.factorRows, opts);
    const days = factorDays(visible, opts);
    const { covered, rough } = coveredAndRoughDays(j.entries, j.checkIns, visible);
    // stress and sleep are logged on every day; nothing else is logged.
    expect(compareFactorDays(covered, rough, days).checked).toBe(2);
    expect(compareFactorDays(covered, rough, new Map())).toEqual({ checked: 0, candidates: [], notes: [] });
  });
});
