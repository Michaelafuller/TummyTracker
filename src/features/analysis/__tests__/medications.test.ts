import type { LogEntry, Medication, MedicationDose, MedicationEvent } from '@/db/schema';
import { formatDateInput } from '@/lib/datetime';
import { findingInstances } from '../drilldown';
import {
  analyzeMedicationDays,
  CAVEAT_MIN_OVERLAPPING,
  confounderCaveat,
  coveredAndRoughDays,
  MIN_EXPOSED_DAYS,
  MIN_OTHER_DAYS,
  medicationExposureDays,
  NEARLY_EVERY_DAY_SHARE,
  pairInstances,
} from '../medications';
import { MAX_LOW_CONFIDENCE_FINDINGS } from '../temporal';

// --- fixture helpers -------------------------------------------------------

let seq = 0;
const nextId = (prefix: string) => `${prefix}${seq++}`;

/** Local noon of 2026-03-01 + `offset` days. */
function dayAt(offset: number, hour = 12): number {
  return new Date(2026, 2, 1 + offset, hour, 0, 0, 0).getTime();
}

function makeEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: nextId('e'),
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

function meal(offset: number, overrides: Partial<LogEntry> = {}): LogEntry {
  return makeEntry({ type: 'meal', loggedAt: dayAt(offset), ...overrides });
}

function symptom(offset: number, severity = 4): LogEntry {
  return makeEntry({ type: 'symptom', name: 'Symptom', loggedAt: dayAt(offset, 18), severity });
}

function makeMed(id: string, name: string, overrides: Partial<Medication> = {}): Medication {
  return {
    id,
    name,
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
    ...overrides,
  };
}

/** One event + one dose per timestamp, all for `medicationId`. */
function dosesAt(medicationId: string, times: number[]): { events: MedicationEvent[]; doses: MedicationDose[] } {
  const events: MedicationEvent[] = [];
  const doses: MedicationDose[] = [];
  for (const takenAt of times) {
    const eventId = nextId('ev');
    events.push({ id: eventId, takenAt, timeKnown: true, notes: null, createdAt: 0, updatedAt: 0 });
    doses.push({
      id: nextId('do'),
      eventId,
      medicationId,
      dose: 1,
      doseUnit: 'tablet',
      createdAt: 0,
      updatedAt: 0,
    });
  }
  return { events, doses };
}

interface Scenario {
  entries: LogEntry[];
  meds: Medication[];
  events: MedicationEvent[];
  doses: MedicationDose[];
}

/**
 * A default-window (dose day + next day) medication with exactly
 * `exposedDays` COVERED exposed days (`exposedRough` of them rough) and
 * `otherDays` covered other days (`otherRough` rough). Exposed days are 0..n-1
 * with a dose each; the tail day n has no entry so it is not covered. Other
 * days sit far away at 100+.
 */
function scenario(opts: {
  name?: string;
  id?: string;
  exposedDays: number;
  exposedRough: number;
  otherDays: number;
  otherRough: number;
}): Scenario {
  const id = opts.id ?? 'med';
  const entries: LogEntry[] = [];
  for (let i = 0; i < opts.exposedDays; i++) {
    entries.push(i < opts.exposedRough ? symptom(i) : meal(i));
  }
  for (let i = 0; i < opts.otherDays; i++) {
    entries.push(i < opts.otherRough ? symptom(100 + i) : meal(100 + i));
  }
  const { events, doses } = dosesAt(
    id,
    Array.from({ length: opts.exposedDays }, (_, i) => dayAt(i)),
  );
  return { entries, meds: [makeMed(id, opts.name ?? 'Ibuprofen')], events, doses };
}

function analyze(s: Scenario, checkIns: { date: string }[] = []) {
  return analyzeMedicationDays(s.entries, checkIns, s.meds, s.events, s.doses);
}

// --- medicationExposureDays --------------------------------------------------

describe('medicationExposureDays', () => {
  it('counts the dose day and the next day for an ordinary medication', () => {
    const med = makeMed('m1', 'Ibuprofen');
    const { events, doses } = dosesAt('m1', [dayAt(3)]);
    const exposure = medicationExposureDays([med], events, doses);
    expect([...(exposure.get('m1') ?? [])].sort()).toEqual(['2026-03-04', '2026-03-05']);
  });

  it('counts the dose day plus the 7 days after for an antibiotic', () => {
    const med = makeMed('a1', 'Amoxicillin 500');
    const { events, doses } = dosesAt('a1', [dayAt(0)]);
    const days = [...(medicationExposureDays([med], events, doses).get('a1') ?? [])].sort();
    expect(days).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
    ]);
  });

  it('attributes a late-night dose to its own local day', () => {
    const med = makeMed('m1', 'Ibuprofen');
    const { events, doses } = dosesAt('m1', [dayAt(3, 23)]);
    const days = [...(medicationExposureDays([med], events, doses).get('m1') ?? [])].sort();
    expect(days).toEqual(['2026-03-04', '2026-03-05']);
  });

  it('unions overlapping doses', () => {
    const med = makeMed('a1', 'Azithromycin');
    // Days 0 and 3: 0..7 and 3..10 -> 0..10 (11 days), not 16.
    const { events, doses } = dosesAt('a1', [dayAt(0), dayAt(3)]);
    const days = medicationExposureDays([med], events, doses).get('a1');
    expect(days?.size).toBe(11);
    expect(days?.has('2026-03-11')).toBe(true);
    expect(days?.has('2026-03-12')).toBe(false);
  });

  it('crosses a month boundary', () => {
    const med = makeMed('a1', 'Amoxicillin');
    const { events, doses } = dosesAt('a1', [new Date(2026, 1, 25, 9).getTime()]);
    const days = [...(medicationExposureDays([med], events, doses).get('a1') ?? [])].sort();
    expect(days).toEqual([
      '2026-02-25',
      '2026-02-26',
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
    ]);
  });

  it('crosses a year boundary', () => {
    const med = makeMed('m1', 'Ibuprofen');
    const { events, doses } = dosesAt('m1', [new Date(2026, 11, 31, 20).getTime()]);
    const days = [...(medicationExposureDays([med], events, doses).get('m1') ?? [])].sort();
    expect(days).toEqual(['2026-12-31', '2027-01-01']);
  });

  it('steps whole local calendar days across DST changes (no skipped or repeated day)', () => {
    const med = makeMed('a1', 'Amoxicillin');
    // US spring-forward is 2026-03-08 and fall-back 2026-11-01; EU 03-29 / 10-25.
    for (const [y, m, d] of [
      [2026, 2, 7],
      [2026, 2, 28],
      [2026, 9, 31],
      [2026, 9, 24],
    ]) {
      const { events, doses } = dosesAt('a1', [new Date(y, m, d, 0, 30).getTime()]);
      const days = [...(medicationExposureDays([med], events, doses).get('a1') ?? [])].sort();
      const expected: string[] = [];
      for (let i = 0; i <= 7; i++) expected.push(formatDateInput(new Date(y, m, d + i, 12).getTime()));
      expect(days).toEqual(expected);
      expect(new Set(days).size).toBe(8);
    }
  });

  it('omits medications with no doses, and includes inactive medications that have doses', () => {
    const noDoses = makeMed('m0', 'Omeprazole', { frequency: 'daily', startDate: dayAt(0) });
    const inactive = makeMed('m1', 'Ibuprofen', { isActive: false });
    const { events, doses } = dosesAt('m1', [dayAt(2)]);
    const exposure = medicationExposureDays([noDoses, inactive], events, doses);
    expect(exposure.has('m0')).toBe(false);
    expect(exposure.has('m1')).toBe(true);
  });

  it('ignores doses whose medication is unknown', () => {
    const { events, doses } = dosesAt('ghost', [dayAt(2)]);
    expect(medicationExposureDays([makeMed('m1', 'Ibuprofen')], events, doses).size).toBe(0);
  });
});

// --- coveredAndRoughDays -------------------------------------------------------

describe('coveredAndRoughDays', () => {
  it('covers any entry type and marks only outcome days rough', () => {
    const entries = [
      meal(0),
      makeEntry({ type: 'bowel_movement', bristolScale: 4, loggedAt: dayAt(1) }),
      makeEntry({ type: 'bowel_movement', bristolScale: 7, loggedAt: dayAt(2) }),
      symptom(3, 2),
      symptom(4, 3),
    ];
    const { covered, rough } = coveredAndRoughDays(entries, []);
    expect([...covered].sort()).toEqual(['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05']);
    expect([...rough].sort()).toEqual(['2026-03-03', '2026-03-05']);
  });

  it('a check-in covers a day but never makes it rough, even a "rough" answer', () => {
    const checkIns = [
      { date: '2026-03-10', status: 'rough' },
      { date: '2026-03-11', status: 'fine' },
    ];
    const { covered, rough } = coveredAndRoughDays([], checkIns);
    expect([...covered].sort()).toEqual(['2026-03-10', '2026-03-11']);
    expect(rough.size).toBe(0);
  });

  it('a check-in on a day that already has entries changes nothing about roughness', () => {
    const { covered, rough } = coveredAndRoughDays([meal(0)], [{ date: '2026-03-01' }]);
    expect(covered.size).toBe(1);
    expect(rough.size).toBe(0);
  });
});

// --- analyzeMedicationDays ------------------------------------------------------

describe('analyzeMedicationDays — rules', () => {
  it('exposes the rule constants', () => {
    expect(MIN_EXPOSED_DAYS).toBe(5);
    expect(MIN_OTHER_DAYS).toBe(5);
    expect(NEARLY_EVERY_DAY_SHARE).toBe(0.9);
  });

  it('too-few-days: fewer than 5 covered exposed days becomes a note', () => {
    const s = scenario({ exposedDays: 4, exposedRough: 4, otherDays: 20, otherRough: 0 });
    const { findings, notes } = analyze(s);
    expect(findings).toEqual([]);
    expect(notes).toEqual([
      { medicationId: 'med', name: 'Ibuprofen', reason: 'too-few-days', exposedDays: 4 },
    ]);
  });

  it('exactly 5 covered exposed days is enough', () => {
    const s = scenario({ exposedDays: 5, exposedRough: 4, otherDays: 20, otherRough: 2 });
    expect(analyze(s).notes).toEqual([]);
    expect(analyze(s).findings).toHaveLength(1);
  });

  it('nearly-every-day: 90% or more of covered days exposed becomes a note', () => {
    // 18 exposed of 20 covered = 90%.
    const s = scenario({ exposedDays: 18, exposedRough: 10, otherDays: 2, otherRough: 0 });
    const { findings, notes } = analyze(s);
    expect(findings).toEqual([]);
    expect(notes).toEqual([
      { medicationId: 'med', name: 'Ibuprofen', reason: 'nearly-every-day', exposedDays: 18 },
    ]);
  });

  it('nearly-every-day: fewer than 5 covered unexposed days becomes a note even under 90%', () => {
    // 16 exposed of 20 = 80% (< 90%), but only 4 other days.
    const s = scenario({ exposedDays: 16, exposedRough: 10, otherDays: 4, otherRough: 0 });
    const { findings, notes } = analyze(s);
    expect(findings).toEqual([]);
    expect(notes.map((n) => n.reason)).toEqual(['nearly-every-day']);
  });

  it('just under both thresholds is compared (85% exposed, 6 other days)', () => {
    // 34 exposed of 40 = 85%, 6 other days: compared.
    const s = scenario({ exposedDays: 34, exposedRough: 20, otherDays: 6, otherRough: 0 });
    expect(analyze(s).notes).toEqual([]);
    expect(analyze(s).findings).toHaveLength(1);
  });

  it('no excess (exposed rate <= other rate) gives neither a finding nor a note', () => {
    const equal = scenario({ exposedDays: 10, exposedRough: 3, otherDays: 10, otherRough: 3 });
    expect(analyze(equal)).toEqual({ findings: [], notes: [] });
    const lower = scenario({ exposedDays: 10, exposedRough: 1, otherDays: 10, otherRough: 5 });
    expect(analyze(lower)).toEqual({ findings: [], notes: [] });
  });

  it('a medication with no doses is not considered at all', () => {
    const s = scenario({ exposedDays: 10, exposedRough: 8, otherDays: 10, otherRough: 1 });
    const extra = makeMed('idle', 'Omeprazole', { frequency: 'daily', startDate: dayAt(0), endDate: dayAt(300) });
    const { findings, notes } = analyzeMedicationDays(s.entries, [], [...s.meds, extra], s.events, s.doses);
    expect(findings.map((f) => f.medicationId)).toEqual(['med']);
    expect(notes).toEqual([]);
  });

  it('includes an inactive medication that has doses', () => {
    const s = scenario({ exposedDays: 10, exposedRough: 8, otherDays: 10, otherRough: 1 });
    s.meds = [{ ...s.meds[0], isActive: false }];
    expect(analyze(s).findings).toHaveLength(1);
  });

  it('frequency, start and end dates never change the result', () => {
    const plain = scenario({ exposedDays: 10, exposedRough: 8, otherDays: 10, otherRough: 1 });
    const decorated: Scenario = {
      ...plain,
      meds: [
        {
          ...plain.meds[0],
          frequency: 'three times a day',
          startDate: dayAt(-500),
          endDate: dayAt(-400),
          defaultDose: 200,
          doseUnit: 'mg',
        },
      ],
    };
    expect(analyze(decorated)).toEqual(analyze(plain));
  });

  it('a medication with a schedule but no logged doses yields nothing', () => {
    const entries = [meal(0), meal(1), symptom(2)];
    const med = makeMed('m1', 'Ibuprofen', { frequency: 'daily', startDate: dayAt(0) });
    expect(analyzeMedicationDays(entries, [], [med], [], [])).toEqual({ findings: [], notes: [] });
  });

  it('only covered days are compared: uncovered exposed days are left out', () => {
    // Doses on days 0..9 (exposure 0..10) but only days 0..5 have entries.
    const s = scenario({ exposedDays: 6, exposedRough: 4, otherDays: 10, otherRough: 1 });
    const extra = dosesAt('med', [dayAt(6), dayAt(7), dayAt(8), dayAt(9)]);
    const { findings } = analyzeMedicationDays(
      s.entries,
      [],
      s.meds,
      [...s.events, ...extra.events],
      [...s.doses, ...extra.doses],
    );
    expect(findings[0].exposedDays).toBe(6);
    expect(findings[0].otherDays).toBe(10);
  });

  it('check-in days are covered on both sides but never rough', () => {
    const s = scenario({ exposedDays: 6, exposedRough: 3, otherDays: 6, otherRough: 0 });
    // A "rough" check-in on an exposed-side day-with-no-entry (the tail day 6) and one far away.
    const checkIns = [
      { date: formatDateInput(dayAt(6)), status: 'rough' },
      { date: formatDateInput(dayAt(200)), status: 'rough' },
    ];
    const { findings } = analyze(s, checkIns);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ exposedDays: 7, exposedRough: 3, otherDays: 7, otherRough: 0 });
  });
});

describe('analyzeMedicationDays — confidence tiers', () => {
  it('high: the Wilson lower bound of the exposed rate clears the other rate', () => {
    // 12/20 exposed (60%) vs 5/20 other (25%): lower bound ~0.39 > 0.25.
    const { findings } = analyze(scenario({ exposedDays: 20, exposedRough: 12, otherDays: 20, otherRough: 5 }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      name: 'Ibuprofen',
      exposedDays: 20,
      exposedRough: 12,
      otherDays: 20,
      otherRough: 5,
      confidence: 'high',
    });
    expect(findings[0].exposedRate).toBeCloseTo(0.6);
    expect(findings[0].otherRate).toBeCloseTo(0.25);
  });

  it('medium: margin cleared with enough days but the Wilson bound does not clear', () => {
    // 3/5 = 60% vs 5/20 = 25%; Wilson lower(3,5) ~0.23 <= 0.25; margin 0.35 >= 0.15; 5 days.
    const { findings } = analyze(scenario({ exposedDays: 5, exposedRough: 3, otherDays: 20, otherRough: 5 }));
    expect(findings.map((f) => f.confidence)).toEqual(['medium']);
  });

  it('low: an excess that clears neither bar', () => {
    // 2/5 = 40% vs 6/20 = 30%: margin 0.10 < 0.15.
    const { findings } = analyze(scenario({ exposedDays: 5, exposedRough: 2, otherDays: 20, otherRough: 6 }));
    expect(findings.map((f) => f.confidence)).toEqual(['low']);
  });

  it('shows low findings only when there is no medium/high one', () => {
    const high = scenario({ id: 'hi', name: 'Ibuprofen', exposedDays: 20, exposedRough: 12, otherDays: 20, otherRough: 5 });
    const lowScenario = scenario({ id: 'lo', name: 'Naproxen', exposedDays: 5, exposedRough: 2, otherDays: 20, otherRough: 6 });
    // Put the two medications on disjoint calendars by shifting the second's entries/doses far away.
    const shift = 1000 * 24 * 60 * 60 * 1000;
    const shiftedEntries = lowScenario.entries.map((e) => ({ ...e, loggedAt: e.loggedAt + shift }));
    const shiftedEvents = lowScenario.events.map((e) => ({ ...e, takenAt: e.takenAt + shift }));
    const combined = analyzeMedicationDays(
      [...high.entries, ...shiftedEntries],
      [],
      [...high.meds, ...lowScenario.meds],
      [...high.events, ...shiftedEvents],
      [...high.doses, ...lowScenario.doses],
    );
    expect(combined.findings.map((f) => f.name)).toEqual(['Ibuprofen']);
  });

  it('caps low-only findings at MAX_LOW_CONFIDENCE_FINDINGS', () => {
    const meds: Medication[] = [];
    const entries: LogEntry[] = [];
    const events: MedicationEvent[] = [];
    const doses: MedicationDose[] = [];
    // Five low-confidence medications, each on its own 1000-day-spaced calendar, sharing no days.
    const ONE_DAY = 24 * 60 * 60 * 1000;
    for (let i = 0; i < 5; i++) {
      const s = scenario({
        id: `low${i}`,
        name: `Med ${String.fromCharCode(65 + i)}`,
        exposedDays: 5,
        exposedRough: 2,
        otherDays: 20,
        otherRough: 6,
      });
      const shift = i * 1000 * ONE_DAY;
      meds.push(...s.meds);
      entries.push(...s.entries.map((e) => ({ ...e, loggedAt: e.loggedAt + shift })));
      events.push(...s.events.map((e) => ({ ...e, takenAt: e.takenAt + shift })));
      doses.push(...s.doses);
    }
    const { findings } = analyzeMedicationDays(entries, [], meds, events, doses);
    expect(findings.every((f) => f.confidence === 'low')).toBe(true);
    expect(findings).toHaveLength(MAX_LOW_CONFIDENCE_FINDINGS);
  });
});

describe('analyzeMedicationDays — ordering', () => {
  it('sorts findings by excess rate descending and notes A-Z', () => {
    // Two clean scenarios on disjoint calendars plus two notes.
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const bigger = scenario({ id: 'big', name: 'Zeta', exposedDays: 10, exposedRough: 9, otherDays: 10, otherRough: 1 });
    const smaller = scenario({ id: 'sm', name: 'Alpha', exposedDays: 10, exposedRough: 6, otherDays: 10, otherRough: 2 });
    const shift = 1000 * ONE_DAY;
    const note1 = { ...makeMed('n1', 'Yarrow'), id: 'n1' };
    const note2 = { ...makeMed('n2', 'Beta'), id: 'n2' };
    const noteDoses1 = dosesAt('n1', [dayAt(3000)]);
    const noteDoses2 = dosesAt('n2', [dayAt(3001)]);
    const { findings, notes } = analyzeMedicationDays(
      [...bigger.entries, ...smaller.entries.map((e) => ({ ...e, loggedAt: e.loggedAt + shift }))],
      [],
      [...bigger.meds, ...smaller.meds, note1, note2],
      [
        ...bigger.events,
        ...smaller.events.map((e) => ({ ...e, takenAt: e.takenAt + shift })),
        ...noteDoses1.events,
        ...noteDoses2.events,
      ],
      [...bigger.doses, ...smaller.doses, ...noteDoses1.doses, ...noteDoses2.doses],
    );
    // The shared covered-day pool differs per medication, so just check ordering by excess.
    const excess = findings.map((f) => f.exposedRate - f.otherRate);
    expect(excess).toEqual([...excess].sort((a, b) => b - a));
    expect(findings.map((f) => f.name)[0]).toBe('Zeta');
    expect(notes.map((n) => n.name)).toEqual(['Beta', 'Yarrow']);
  });

  it('uses the antibiotic tail: a 7-day window turns one dose into a comparison', () => {
    // One amoxicillin dose on day 0 exposes days 0..7. Cover those 8 days (6 rough) plus 10 other days (1 rough).
    const entries: LogEntry[] = [];
    for (let i = 0; i < 8; i++) entries.push(i < 6 ? symptom(i) : meal(i));
    for (let i = 0; i < 10; i++) entries.push(i < 1 ? symptom(100 + i) : meal(100 + i));
    const { events, doses } = dosesAt('abx', [dayAt(0)]);
    const { findings } = analyzeMedicationDays(entries, [], [makeMed('abx', 'Amoxicillin')], events, doses);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ exposedDays: 8, exposedRough: 6, otherDays: 10, otherRough: 1 });
  });
});

// --- worked example (pasted verbatim into the execute summary) ---------------------------

describe('worked example', () => {
  it('ibuprofen: 12 of 20 days on or after a dose were rough (60% vs 25% on other logged days)', () => {
    const s = scenario({ exposedDays: 20, exposedRough: 12, otherDays: 20, otherRough: 5 });
    const [finding] = analyze(s).findings;
    const pct = (rate: number) => `${Math.round(rate * 100)}%`;
    const sentence =
      `${finding.exposedRough} of ${finding.exposedDays} days on or after ${finding.name} were rough ` +
      `(${pct(finding.exposedRate)} vs ${pct(finding.otherRate)} on other logged days).`;
    expect(sentence).toBe(
      '12 of 20 days on or after Ibuprofen were rough (60% vs 25% on other logged days).',
    );
  });
});

// --- confounderCaveat / pairInstances ------------------------------------------------------

describe('confounderCaveat', () => {
  const amox = makeMed('amox', 'Amoxicillin');
  const cipro = makeMed('cip', 'Ciprofloxacin');
  const meds = [amox, cipro];

  function exposureOf(map: Record<string, number[]>): Map<string, Set<string>> {
    return new Map(
      Object.entries(map).map(([id, offsets]) => [id, new Set(offsets.map((o) => formatDateInput(dayAt(o))))]),
    );
  }

  function inst(offset: number, followedByOutcome: boolean) {
    return { entry: meal(offset), followedByOutcome, outcomeDelayMs: followedByOutcome ? 60 * 60 * 1000 : null };
  }

  it('is null with fewer than 2 overlapping hits', () => {
    expect(CAVEAT_MIN_OVERLAPPING).toBe(2);
    const instances = [inst(0, true), inst(20, true), inst(21, true)];
    expect(confounderCaveat(instances, exposureOf({ amox: [0] }), meds)).toBeNull();
  });

  it('is a caveat at exactly half of the hits', () => {
    const instances = [inst(0, true), inst(1, true), inst(20, true), inst(21, true)];
    expect(confounderCaveat(instances, exposureOf({ amox: [0, 1] }), meds)).toEqual({
      medicationId: 'amox',
      name: 'Amoxicillin',
      overlapping: 2,
      hits: 4,
    });
  });

  it('is null below half of the hits', () => {
    const instances = [inst(0, true), inst(1, true), inst(20, true), inst(21, true), inst(22, true)];
    expect(confounderCaveat(instances, exposureOf({ amox: [0, 1] }), meds)).toBeNull();
  });

  it('never counts misses (meals not followed by an outcome)', () => {
    // 2 overlapping hits of 2 hits; plenty of overlapping misses must not matter either way.
    const instances = [inst(0, true), inst(1, true), inst(2, false), inst(3, false), inst(4, false)];
    const caveat = confounderCaveat(instances, exposureOf({ amox: [0, 1, 2, 3, 4] }), meds);
    expect(caveat).toMatchObject({ overlapping: 2, hits: 2 });
    // ...and overlapping misses alone never create one.
    const onlyMisses = [inst(0, false), inst(1, false), inst(20, true), inst(21, true)];
    expect(confounderCaveat(onlyMisses, exposureOf({ amox: [0, 1] }), meds)).toBeNull();
  });

  it('picks the medication overlapping the most hits', () => {
    const instances = [inst(0, true), inst(1, true), inst(2, true)];
    const caveat = confounderCaveat(instances, exposureOf({ amox: [0], cip: [0, 1, 2] }), meds);
    expect(caveat).toMatchObject({ medicationId: 'cip', overlapping: 3, hits: 3 });
  });

  it('breaks ties A-Z by name', () => {
    const instances = [inst(0, true), inst(1, true)];
    const exposure = exposureOf({ amox: [0, 1], cip: [0, 1] });
    expect(confounderCaveat(instances, exposure, [cipro, amox])?.name).toBe('Amoxicillin');
  });

  it('ignores medications with no exposure days', () => {
    const instances = [inst(0, true), inst(1, true)];
    expect(confounderCaveat(instances, new Map(), meds)).toBeNull();
  });

  it('uses the MEAL day, not the outcome day', () => {
    // The meal is on day 0 (unexposed); the outcome would land on day 1 (exposed) — no overlap.
    const instances = [inst(0, true), inst(0, true)];
    expect(confounderCaveat(instances, exposureOf({ amox: [1] }), meds)).toBeNull();
  });

  it('works from real findingInstances output (a caveat sentence fixture)', () => {
    // Four "Chicken Salad" meals on days 0, 1, 2, 30; each followed by a symptom 1h later.
    const entries: LogEntry[] = [];
    for (const day of [0, 1, 2, 30]) {
      entries.push(meal(day, { name: 'Chicken Salad' }));
      entries.push(makeEntry({ type: 'symptom', name: 'Symptom', severity: 4, loggedAt: dayAt(day) + 60 * 60 * 1000 }));
    }
    const instances = findingInstances(entries, 'food', 'Chicken Salad');
    const caveat = confounderCaveat(instances, exposureOf({ amox: [0, 1, 2, 3, 4, 5, 6, 7] }), meds);
    expect(caveat).not.toBeNull();
    expect(caveat).toMatchObject({ overlapping: 3, hits: 4, name: 'Amoxicillin' });
  });
});

describe('pairInstances', () => {
  const HOUR = 60 * 60 * 1000;

  it('matches food entries containing both tags in either order', () => {
    const a = meal(0, { tagsJson: '["egg","wheat"]' });
    const b = meal(1, { tagsJson: '["wheat","milk","egg"]' });
    const onlyOne = meal(2, { tagsJson: '["egg"]' });
    const nonFood = makeEntry({ type: 'symptom', loggedAt: dayAt(3), tagsJson: '["egg","wheat"]', severity: 1 });
    const instances = pairInstances([a, b, onlyOne, nonFood], 'egg + wheat');
    expect(instances.map((i) => i.entry.id).sort()).toEqual([a.id, b.id].sort());
    // Key given in the other order still matches.
    expect(pairInstances([a, b, onlyOne], 'wheat + egg')).toHaveLength(2);
  });

  it('flags instances exactly like findingInstances (24h, strictly after, never its own outcome)', () => {
    const hit = meal(0, { tagsJson: '["egg","wheat"]' });
    const miss = meal(5, { tagsJson: '["egg","wheat"]' });
    const outcome = makeEntry({ type: 'symptom', severity: 4, loggedAt: hit.loggedAt + 24 * HOUR });
    const instances = pairInstances([hit, miss, outcome], 'egg + wheat');
    expect(instances.find((i) => i.entry.id === hit.id)?.followedByOutcome).toBe(true);
    expect(instances.find((i) => i.entry.id === miss.id)?.followedByOutcome).toBe(false);

    // Same join as the tag drill-down for a single tag.
    const single = findingInstances([hit, miss, outcome], 'tag', 'egg');
    expect(single.map((i) => i.followedByOutcome).sort()).toEqual(
      instances.map((i) => i.followedByOutcome).sort(),
    );
  });

  it('returns newest first and [] for a malformed key', () => {
    const early = meal(0, { tagsJson: '["egg","wheat"]' });
    const late = meal(4, { tagsJson: '["egg","wheat"]' });
    expect(pairInstances([early, late], 'egg + wheat').map((i) => i.entry.id)).toEqual([late.id, early.id]);
    expect(pairInstances([early, late], 'egg')).toEqual([]);
  });
});
