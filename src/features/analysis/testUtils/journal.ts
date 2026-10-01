// Jest-only fixtures for the analysis tests: a seeded PRNG and synthetic
// journal builders. Lives outside __tests__/ because Jest collects every file
// there as a suite. Never import this from app code.

import type { LogEntry, Medication, MedicationDose, MedicationEvent } from '@/db/schema';
import { formatDateInput } from '@/lib/datetime';
import type { FactorRow } from '../factors';

let seq = 0;

export function makeEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: `t${seq++}`,
    type: 'meal',
    mealSlot: null,
    name: 'Food',
    barcode: null,
    loggedAt: 0,
    sentiment: null,
    bristolScale: null,
    symptomType: null,
    severity: null,
    notes: null,
    calories: null,
    fatG: null,
    saturatedFatG: null,
    carbsG: null,
    proteinG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    servingG: null,
    ingredientsText: null,
    tagsJson: null,
    componentCount: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

/** Seeded PRNG (mulberry32) — tests never use Math.random. */
export function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Local time of 2026-01-01 + `offset` days at `hour`. */
export function dayAt(offset: number, hour = 12): number {
  return new Date(2026, 0, 1 + offset, hour, 0, 0, 0).getTime();
}

export const dayKey = (offset: number): string => formatDateInput(dayAt(offset));

export interface JournalOptions {
  seed: number;
  days: number;
  /** Distinct ingredient tags to draw from (default 40). */
  tagPool?: number;
  /** Tags per meal: min..max (default 3..5). */
  tagsPerMeal?: [number, number];
  /** Distinct food names (default 12). */
  foodPool?: number;
  /** Chance a day has a rough outcome (default 0.3). */
  outcomeProb?: number;
  /** A tag whose every meal is followed 3 h later by a rough symptom (a planted signal). */
  plantedTag?: string;
  /** Chance a meal carries the planted tag (default 0.25). */
  plantedProb?: number;
  /** Medications to create, each dosed on ~25 % of days (default 0). */
  medCount?: number;
  /** Make the first medication's dose days exactly the rough days. */
  medOnRoughDays?: boolean;
  /** Daily factor rows with random stress / sleep (default false). */
  factors?: boolean;
}

export interface Journal {
  entries: LogEntry[];
  checkIns: { date: string }[];
  meds: Medication[];
  events: MedicationEvent[];
  doses: MedicationDose[];
  factorRows: FactorRow[];
}

/**
 * Synthetic journal: 3 meals a day (8, 13, 19 h) with random tags / foods /
 * nutrient values, a rough symptom on some days at 21 h, optional planted
 * signal, medications and daily factors. Fully determined by `seed`.
 */
export function buildJournal(opts: JournalOptions): Journal {
  const rand = prng(opts.seed);
  const tagPool = opts.tagPool ?? 40;
  const [minTags, maxTags] = opts.tagsPerMeal ?? [3, 5];
  const foodPool = opts.foodPool ?? 12;
  const outcomeProb = opts.outcomeProb ?? 0.3;
  const plantedProb = opts.plantedProb ?? 0.25;
  const pick = (n: number) => Math.floor(rand() * n);

  const entries: LogEntry[] = [];
  const roughDays: number[] = [];
  for (let d = 0; d < opts.days; d++) {
    for (const hour of [8, 13, 19]) {
      const count = minTags + pick(maxTags - minTags + 1);
      const tags = new Set<string>();
      while (tags.size < count) tags.add(`tag${pick(tagPool)}`);
      const planted = opts.plantedTag !== undefined && rand() < plantedProb;
      if (planted) tags.add(opts.plantedTag as string);
      const at = dayAt(d, hour);
      entries.push(
        makeEntry({
          type: 'meal',
          name: `Food ${pick(foodPool)}`,
          loggedAt: at,
          tagsJson: JSON.stringify([...tags]),
          calories: rand() < 0.7 ? 100 + pick(600) : null,
          fatG: rand() < 0.7 ? 1 + pick(40) : null,
          sodiumMg: rand() < 0.5 ? 50 + pick(1500) : null,
        }),
      );
      if (planted) {
        entries.push(
          makeEntry({ type: 'symptom', name: 'Symptom', loggedAt: at + 3 * 3600 * 1000, severity: 4 }),
        );
      }
    }
    if (rand() < outcomeProb) {
      roughDays.push(d);
      entries.push(makeEntry({ type: 'symptom', name: 'Symptom', loggedAt: dayAt(d, 21), severity: 4 }));
    }
  }

  const meds: Medication[] = [];
  const events: MedicationEvent[] = [];
  const doses: MedicationDose[] = [];
  for (let m = 0; m < (opts.medCount ?? 0); m++) {
    const id = `med${m}`;
    meds.push({
      id,
      name: `Med ${m}`,
      defaultDose: null,
      doseUnit: null,
      frequency: null,
      startDate: null,
      endDate: null,
      isActive: true,
      isRegular: false,
      notes: null,
      createdAt: 0,
      updatedAt: 0,
    });
    for (let d = 0; d < opts.days; d++) {
      const dosed = opts.medOnRoughDays && m === 0 ? roughDays.includes(d) : rand() < 0.25;
      if (!dosed) continue;
      const eventId = `ev${m}-${d}`;
      events.push({ id: eventId, takenAt: dayAt(d, 9), timeKnown: true, notes: null, createdAt: 0, updatedAt: 0 });
      doses.push({
        id: `do${m}-${d}`,
        eventId,
        medicationId: id,
        dose: 1,
        doseUnit: 'tablet',
        createdAt: 0,
        updatedAt: 0,
      });
    }
  }

  const factorRows: FactorRow[] = [];
  if (opts.factors) {
    for (let d = 0; d < opts.days; d++) {
      factorRows.push({
        date: dayKey(d),
        stress: 1 + pick(5),
        sleep: rand() < 0.3 ? 'poor' : 'ok',
        alcohol: null,
        caffeine: null,
        period: null,
      });
    }
  }

  return { entries, checkIns: [], meds, events, doses, factorRows };
}
