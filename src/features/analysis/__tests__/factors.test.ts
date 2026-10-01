import type { LogEntry } from '@/db/schema';
import { formatDateInput } from '@/lib/datetime';
import { dayCoverage } from '@/lib/dayCoverage';
import { findingInstances } from '../drilldown';
import {
  analyzeFactorDays,
  factorCaveat,
  factorCaveatSentence,
  factorDays,
  factorNoteSentence,
  factorSentence,
  HIGH_STRESS_MIN,
  visibleFactorRows,
  type FactorDays,
  type FactorKey,
  type FactorRow,
} from '../factors';
import {
  analyzeMedicationDays,
  coveredAndRoughDays,
  MIN_EXPOSED_DAYS,
  MIN_OTHER_DAYS,
  NEARLY_EVERY_DAY_SHARE,
} from '../medications';
import { MAX_LOW_CONFIDENCE_FINDINGS } from '../temporal';

// --- fixture helpers -------------------------------------------------------

let seq = 0;
const nextId = (prefix: string) => `${prefix}${seq++}`;

/** Local noon of 2026-03-01 + `offset` days. */
function dayAt(offset: number, hour = 12): number {
  return new Date(2026, 2, 1 + offset, hour, 0, 0, 0).getTime();
}

const key = (offset: number) => formatDateInput(dayAt(offset));

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

const meal = (offset: number, overrides: Partial<LogEntry> = {}) =>
  makeEntry({ type: 'meal', loggedAt: dayAt(offset), ...overrides });
const symptom = (offset: number, severity = 4) =>
  makeEntry({ type: 'symptom', name: 'Symptom', loggedAt: dayAt(offset, 18), severity });

function row(offset: number, overrides: Partial<FactorRow> = {}): FactorRow {
  return { date: key(offset), sleep: null, stress: null, alcohol: null, caffeine: null, period: null, ...overrides };
}

const ON = { trackPeriod: true };
const OFF = { trackPeriod: false };

interface Scenario {
  entries: LogEntry[];
  rows: FactorRow[];
}

/**
 * A stress scenario: `flaggedDays` covered days at stress 5 (`flaggedRough` of
 * them rough) and `baseDays` covered days at stress 2 (`baseRough` rough).
 * Flagged days are 0..n-1, base days sit far away at 100+. Every day has a
 * meal/symptom entry, so each is covered on its own.
 */
function stressScenario(opts: {
  flaggedDays: number;
  flaggedRough: number;
  baseDays: number;
  baseRough: number;
}): Scenario {
  const entries: LogEntry[] = [];
  const rows: FactorRow[] = [];
  for (let i = 0; i < opts.flaggedDays; i++) {
    entries.push(i < opts.flaggedRough ? symptom(i) : meal(i));
    rows.push(row(i, { stress: 5 }));
  }
  for (let i = 0; i < opts.baseDays; i++) {
    entries.push(i < opts.baseRough ? symptom(100 + i) : meal(100 + i));
    rows.push(row(100 + i, { stress: 2 }));
  }
  return { entries, rows };
}

const analyze = (s: Scenario, opts = ON) => analyzeFactorDays(s.entries, [], s.rows, opts);

// --- visibleFactorRows -----------------------------------------------------

describe('visibleFactorRows', () => {
  it('blanks period when tracking is off and drops rows left with nothing', () => {
    const rows = [row(0, { stress: 3, period: true }), row(1, { period: true }), row(2, { period: false })];
    expect(visibleFactorRows(rows, OFF)).toEqual([row(0, { stress: 3 })]);
  });

  it('keeps period when tracking is on', () => {
    const rows = [row(0, { period: true })];
    expect(visibleFactorRows(rows, ON)).toEqual(rows);
  });

  it('drops a row whose chips were all cleared (every value null)', () => {
    expect(visibleFactorRows([row(0)], ON)).toEqual([]);
  });
});

// --- factorDays -------------------------------------------------------------

describe('factorDays — flag rules', () => {
  const sets = (days: FactorDays | undefined) => ({
    flagged: [...(days?.flagged ?? [])].sort(),
    logged: [...(days?.logged ?? [])].sort(),
  });

  it('stress: 4 and 5 are flagged; 1-3 are logged but not flagged', () => {
    expect(HIGH_STRESS_MIN).toBe(4);
    const map = factorDays(
      [row(0, { stress: 1 }), row(1, { stress: 3 }), row(2, { stress: 4 }), row(3, { stress: 5 })],
      ON,
    );
    expect(sets(map.get('stress'))).toEqual({
      flagged: [key(2), key(3)],
      logged: [key(0), key(1), key(2), key(3)],
    });
  });

  it('sleep: only poor is flagged', () => {
    const map = factorDays([row(0, { sleep: 'poor' }), row(1, { sleep: 'ok' }), row(2, { sleep: 'good' })], ON);
    expect(sets(map.get('sleep'))).toEqual({ flagged: [key(0)], logged: [key(0), key(1), key(2)] });
  });

  it('caffeine: only "more than usual" is flagged', () => {
    const map = factorDays(
      [row(0, { caffeine: 'none' }), row(1, { caffeine: 'usual' }), row(2, { caffeine: 'more' })],
      ON,
    );
    expect(sets(map.get('caffeine'))).toEqual({ flagged: [key(2)], logged: [key(0), key(1), key(2)] });
  });

  it('period: yes is flagged, no is logged', () => {
    const map = factorDays([row(0, { period: true }), row(1, { period: false })], ON);
    expect(sets(map.get('period'))).toEqual({ flagged: [key(0)], logged: [key(0), key(1)] });
  });

  it('alcohol "some" flags that day AND the next; the next day joins logged', () => {
    const map = factorDays([row(5, { alcohol: 'some' })], ON);
    expect(sets(map.get('alcohol'))).toEqual({ flagged: [key(5), key(6)], logged: [key(5), key(6)] });
  });

  it('alcohol "a lot" behaves the same; "none" flags nothing and adds no next day', () => {
    const lot = factorDays([row(5, { alcohol: 'a_lot' })], ON);
    expect(sets(lot.get('alcohol')).flagged).toEqual([key(5), key(6)]);
    const none = factorDays([row(5, { alcohol: 'none' })], ON);
    expect(sets(none.get('alcohol'))).toEqual({ flagged: [], logged: [key(5)] });
  });

  it('alcohol window crosses a month boundary', () => {
    const map = factorDays([{ ...row(0), date: '2026-02-28', alcohol: 'some' }], ON);
    expect(sets(map.get('alcohol')).flagged).toEqual(['2026-02-28', '2026-03-01']);
  });

  it('a day inside the alcohol window stays flagged even when logged "none"', () => {
    const map = factorDays([row(5, { alcohol: 'some' }), row(6, { alcohol: 'none' })], ON);
    expect(sets(map.get('alcohol'))).toEqual({ flagged: [key(5), key(6)], logged: [key(5), key(6)] });
  });

  it('an unlogged day is in neither set', () => {
    const map = factorDays([row(0, { stress: 5 }), row(2, { stress: 1 })], ON);
    const stress = map.get('stress');
    expect(stress?.logged.has(key(1))).toBe(false);
    expect(stress?.flagged.has(key(1))).toBe(false);
  });

  it('a factor nobody logged is absent from the map', () => {
    const map = factorDays([row(0, { stress: 2 })], ON);
    expect([...map.keys()]).toEqual(['stress']);
  });

  it('period is omitted entirely when tracking is off — stored rows are ignored, not deleted', () => {
    const rows = [row(0, { period: true, stress: 4 })];
    expect(factorDays(rows, OFF).has('period')).toBe(false);
    expect(factorDays(rows, OFF).has('stress')).toBe(true);
    expect(factorDays(rows, ON).has('period')).toBe(true);
    // The input is never mutated.
    expect(rows[0].period).toBe(true);
  });

  it('a cleared factor (null) is unknown, not low', () => {
    const map = factorDays([row(0, { stress: null, sleep: 'good' })], ON);
    expect(map.has('stress')).toBe(false);
  });
});

// --- analyzeFactorDays — rules ------------------------------------------------

describe('analyzeFactorDays — rules', () => {
  it('reuses the medication gates', () => {
    expect(MIN_EXPOSED_DAYS).toBe(5);
    expect(MIN_OTHER_DAYS).toBe(5);
    expect(NEARLY_EVERY_DAY_SHARE).toBe(0.9);
  });

  it('too-few-days: fewer than 5 flagged days becomes a note', () => {
    const s = stressScenario({ flaggedDays: 4, flaggedRough: 4, baseDays: 20, baseRough: 0 });
    expect(analyze(s)).toEqual({
      findings: [],
      notes: [{ key: 'stress', label: 'High stress', reason: 'too-few-days', flaggedDays: 4, baseDays: 20 }],
    });
  });

  it('exactly 5 flagged days is enough', () => {
    const s = stressScenario({ flaggedDays: 5, flaggedRough: 4, baseDays: 20, baseRough: 2 });
    expect(analyze(s).notes).toEqual([]);
    expect(analyze(s).findings).toHaveLength(1);
  });

  it('nearly-always: 90% or more of logged days flagged becomes a note', () => {
    const s = stressScenario({ flaggedDays: 18, flaggedRough: 10, baseDays: 2, baseRough: 0 });
    const { findings, notes } = analyze(s);
    expect(findings).toEqual([]);
    expect(notes).toEqual([
      { key: 'stress', label: 'High stress', reason: 'nearly-always', flaggedDays: 18, baseDays: 2 },
    ]);
  });

  it('fewer than 5 base days becomes a too-few-days note even under 90%', () => {
    const s = stressScenario({ flaggedDays: 16, flaggedRough: 10, baseDays: 4, baseRough: 0 });
    const { findings, notes } = analyze(s);
    expect(findings).toEqual([]);
    expect(notes).toEqual([
      { key: 'stress', label: 'High stress', reason: 'too-few-days', flaggedDays: 16, baseDays: 4 },
    ]);
  });

  it('just under both thresholds is compared (85% flagged, 6 base days)', () => {
    const s = stressScenario({ flaggedDays: 34, flaggedRough: 20, baseDays: 6, baseRough: 0 });
    expect(analyze(s).notes).toEqual([]);
    expect(analyze(s).findings).toHaveLength(1);
  });

  it('no excess (flagged rate <= base rate) gives neither a finding nor a note', () => {
    const equal = stressScenario({ flaggedDays: 10, flaggedRough: 3, baseDays: 10, baseRough: 3 });
    expect(analyze(equal)).toEqual({ findings: [], notes: [] });
    const lower = stressScenario({ flaggedDays: 10, flaggedRough: 1, baseDays: 10, baseRough: 5 });
    expect(analyze(lower)).toEqual({ findings: [], notes: [] });
  });

  it('a factor that was logged but never flagged yields neither a finding nor a note', () => {
    const entries = Array.from({ length: 12 }, (_, i) => meal(i));
    const rows = Array.from({ length: 12 }, (_, i) => row(i, { stress: 1 }));
    expect(analyzeFactorDays(entries, [], rows, ON)).toEqual({ findings: [], notes: [] });
  });

  it('no factor rows at all gives an empty result', () => {
    expect(analyzeFactorDays([meal(0), symptom(1)], [], [], ON)).toEqual({ findings: [], notes: [] });
  });
});

describe('analyzeFactorDays — comparison base', () => {
  it('the base is logged-and-not-flagged days: unlogged covered days are never counted as "other"', () => {
    // 10 high-stress days (6 rough), 10 days at stress 2 (1 rough) — plus 40 covered days with no
    // stress logged and no roughness. If the base were "all other covered days" the base rate
    // would be 1/50, not 1/10.
    const s = stressScenario({ flaggedDays: 10, flaggedRough: 6, baseDays: 10, baseRough: 1 });
    for (let i = 0; i < 40; i++) s.entries.push(meal(200 + i));
    const { findings } = analyze(s);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      flaggedDays: 10,
      flaggedRough: 6,
      baseDays: 10,
      baseRough: 1,
      baseRate: 0.1,
    });
  });

  it('only covered days count — a flagged day with no entry is not covered unless its row covers it', () => {
    // Stress rows cover their own day, so flagged days always count; but the alcohol NEXT day
    // has no row and no entry here, so it is flagged yet uncovered and excluded.
    const entries = [symptom(0)];
    const rows = [row(0, { alcohol: 'some' })];
    const { notes } = analyzeFactorDays(entries, [], rows, ON);
    expect(notes).toEqual([
      { key: 'alcohol', label: 'Alcohol', reason: 'too-few-days', flaggedDays: 1, baseDays: 0 },
    ]);
  });

  it('a factor-only day is covered (and never rough)', () => {
    // 4 high-stress days with NO entries at all (their rows cover them), 6 base days with a meal each.
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => row(i, { stress: 5 })),
      ...Array.from({ length: 6 }, (_, i) => row(100 + i, { stress: 1 })),
    ];
    const entries = Array.from({ length: 6 }, (_, i) => meal(100 + i));
    expect(analyzeFactorDays(entries, [], rows, ON)).toEqual({
      findings: [],
      notes: [{ key: 'stress', label: 'High stress', reason: 'too-few-days', flaggedDays: 4, baseDays: 6 }],
    });
  });

  it('a check-in covers a day but a "rough" answer never makes it rough', () => {
    const s = stressScenario({ flaggedDays: 6, flaggedRough: 0, baseDays: 6, baseRough: 0 });
    const checkIns = [{ date: key(0), status: 'rough' }];
    expect(analyzeFactorDays(s.entries, checkIns, s.rows, ON)).toEqual({ findings: [], notes: [] });
  });

  it('rough comes from isOutcome entries only (a mild symptom does not count)', () => {
    const entries: LogEntry[] = [];
    const rows: FactorRow[] = [];
    for (let i = 0; i < 6; i++) {
      entries.push(symptom(i, 2)); // severity 2: not an outcome
      rows.push(row(i, { stress: 5 }));
    }
    for (let i = 0; i < 6; i++) {
      entries.push(meal(100 + i));
      rows.push(row(100 + i, { stress: 1 }));
    }
    expect(analyzeFactorDays(entries, [], rows, ON)).toEqual({ findings: [], notes: [] });
  });
});

describe('analyzeFactorDays — confidence, ordering, caps', () => {
  it('high: the Wilson lower bound clears the base rate', () => {
    const s = stressScenario({ flaggedDays: 30, flaggedRough: 28, baseDays: 30, baseRough: 3 });
    expect(analyze(s).findings[0].confidence).toBe('high');
  });

  it('medium: a 15-point margin over the base rate with at least 5 days', () => {
    // 6/10 = 60% vs 3/15 = 20%: Wilson lower bound of 6/10 is ~0.31, above 0.2 -> high; use a
    // closer case: 3/5 = 60% vs 6/20 = 30%: bound ~0.23 < 0.30, margin 30 points -> medium.
    const s = stressScenario({ flaggedDays: 5, flaggedRough: 3, baseDays: 20, baseRough: 6 });
    expect(analyze(s).findings[0].confidence).toBe('medium');
  });

  it('low: an excess without the margin', () => {
    const s = stressScenario({ flaggedDays: 10, flaggedRough: 4, baseDays: 20, baseRough: 7 });
    // 40% vs 35%: excess of 5 points only.
    expect(analyze(s).findings[0].confidence).toBe('low');
  });

  it('low findings show only when no medium/high one exists', () => {
    const lowStress = stressScenario({ flaggedDays: 10, flaggedRough: 4, baseDays: 20, baseRough: 7 });
    expect(analyze(lowStress).findings.map((f) => f.confidence)).toEqual(['low']);

    // Add a clearly high-confidence sleep finding on distant days.
    const entries = [...lowStress.entries];
    const rows = [...lowStress.rows];
    for (let i = 0; i < 30; i++) {
      entries.push(i < 28 ? symptom(300 + i) : meal(300 + i));
      rows.push(row(300 + i, { sleep: 'poor' }));
    }
    for (let i = 0; i < 30; i++) {
      entries.push(i < 3 ? symptom(400 + i) : meal(400 + i));
      rows.push(row(400 + i, { sleep: 'good' }));
    }
    const result = analyzeFactorDays(entries, [], rows, ON);
    expect(result.findings.map((f) => f.key)).toEqual(['sleep']);
  });

  it('caps low-only findings at MAX_LOW_CONFIDENCE_FINDINGS', () => {
    // Four low-confidence factors (stress, sleep, caffeine, period), each 4/10 vs 7/20.
    const entries: LogEntry[] = [];
    const rows: FactorRow[] = [];
    const specs: [FactorKey, Partial<FactorRow>, Partial<FactorRow>][] = [
      ['stress', { stress: 5 }, { stress: 1 }],
      ['sleep', { sleep: 'poor' }, { sleep: 'good' }],
      ['caffeine', { caffeine: 'more' }, { caffeine: 'none' }],
      ['period', { period: true }, { period: false }],
    ];
    // Distinct day ranges per factor, 500 days apart; each has 10 flagged + 20 base days.
    specs.forEach(([, flagged, base], f) => {
      for (let i = 0; i < 10; i++) {
        entries.push(i < 4 ? symptom(f * 500 + i) : meal(f * 500 + i));
        rows.push(row(f * 500 + i, flagged));
      }
      for (let i = 0; i < 20; i++) {
        entries.push(i < 7 ? symptom(f * 500 + 100 + i) : meal(f * 500 + 100 + i));
        rows.push(row(f * 500 + 100 + i, base));
      }
    });
    const result = analyzeFactorDays(entries, [], rows, ON);
    expect(result.findings.length).toBe(MAX_LOW_CONFIDENCE_FINDINGS);
    expect(result.findings.every((f) => f.confidence === 'low')).toBe(true);
  });

  it('sorts findings by excess rate descending', () => {
    const entries: LogEntry[] = [];
    const rows: FactorRow[] = [];
    // stress: 9/10 vs 1/20 (big excess); sleep: 7/10 vs 2/20 (smaller excess); both high.
    const build = (offset: number, flagged: Partial<FactorRow>, base: Partial<FactorRow>, fr: number, br: number) => {
      for (let i = 0; i < 10; i++) {
        entries.push(i < fr ? symptom(offset + i) : meal(offset + i));
        rows.push(row(offset + i, flagged));
      }
      for (let i = 0; i < 20; i++) {
        entries.push(i < br ? symptom(offset + 100 + i) : meal(offset + 100 + i));
        rows.push(row(offset + 100 + i, base));
      }
    };
    build(0, { sleep: 'poor' }, { sleep: 'good' }, 7, 2);
    build(500, { stress: 5 }, { stress: 1 }, 9, 1);
    const result = analyzeFactorDays(entries, [], rows, ON);
    expect(result.findings.map((f) => f.key)).toEqual(['stress', 'sleep']);
  });

  it('notes come out in factor order', () => {
    const rows = [row(0, { stress: 5 }), row(1, { sleep: 'poor' }), row(2, { caffeine: 'more' })];
    const entries = [meal(0), meal(1), meal(2)];
    const { notes } = analyzeFactorDays(entries, [], rows, ON);
    expect(notes.map((n) => n.key)).toEqual(['stress', 'sleep', 'caffeine']);
  });
});

describe('analyzeFactorDays — period opt-in', () => {
  function periodScenario() {
    const entries: LogEntry[] = [];
    const rows: FactorRow[] = [];
    for (let i = 0; i < 10; i++) {
      entries.push(i < 8 ? symptom(i) : meal(i));
      rows.push(row(i, { period: true }));
    }
    for (let i = 0; i < 10; i++) {
      entries.push(i < 1 ? symptom(100 + i) : meal(100 + i));
      rows.push(row(100 + i, { period: false }));
    }
    return { entries, rows };
  }

  it('produces a period finding when tracking is on', () => {
    const { entries, rows } = periodScenario();
    expect(analyzeFactorDays(entries, [], rows, ON).findings.map((f) => f.key)).toEqual(['period']);
  });

  it('produces no finding and no note when tracking is off', () => {
    const { entries, rows } = periodScenario();
    expect(analyzeFactorDays(entries, [], rows, OFF)).toEqual({ findings: [], notes: [] });
  });

  it('with tracking off a period-only row does not even cover its day', () => {
    const { covered } = coveredAndRoughDays([], [], visibleFactorRows([row(0, { period: true })], OFF));
    expect(covered.size).toBe(0);
  });
});

// --- coverage helpers ----------------------------------------------------------

describe('coveredAndRoughDays — factor rows', () => {
  it('without factor rows the result is identical to before', () => {
    const entries = [meal(0), symptom(1)];
    const before = coveredAndRoughDays(entries, [{ date: key(5) }]);
    const after = coveredAndRoughDays(entries, [{ date: key(5) }], []);
    expect([...after.covered].sort()).toEqual([...before.covered].sort());
    expect([...after.rough].sort()).toEqual([...before.rough].sort());
  });

  it('a factor row covers its day but never makes it rough', () => {
    const { covered, rough } = coveredAndRoughDays([], [], [row(3, { stress: 5 })]);
    expect([...covered]).toEqual([key(3)]);
    expect(rough.size).toBe(0);
  });

  it('a factor row on a day that already has entries changes nothing', () => {
    const { covered, rough } = coveredAndRoughDays([symptom(0)], [], [row(0, { sleep: 'poor' })]);
    expect(covered.size).toBe(1);
    expect(rough.size).toBe(1);
  });
});

describe('analyzeMedicationDays — factor rows only widen the covered pools', () => {
  it('is unchanged without factor rows, and a factor-only day joins the "other" pool when passed', () => {
    const med = {
      id: 'm1',
      name: 'Ibuprofen',
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
    };
    const events = Array.from({ length: 5 }, (_, i) => ({
      id: `ev${i}`,
      takenAt: dayAt(i),
      timeKnown: true,
      notes: null,
      createdAt: 0,
      updatedAt: 0,
    }));
    const doses = events.map((event, i) => ({
      id: `do${i}`,
      eventId: event.id,
      medicationId: 'm1',
      dose: 1,
      doseUnit: 'tablet',
      createdAt: 0,
      updatedAt: 0,
    }));
    const entries = [
      ...Array.from({ length: 5 }, (_, i) => symptom(i)),
      ...Array.from({ length: 5 }, (_, i) => meal(100 + i)),
    ];
    const base = analyzeMedicationDays(entries, [], [med], events, doses);
    const same = analyzeMedicationDays(entries, [], [med], events, doses, []);
    expect(same).toEqual(base);
    expect(base.findings[0]).toMatchObject({ exposedDays: 5, otherDays: 5 });

    const widened = analyzeMedicationDays(entries, [], [med], events, doses, [row(200, { stress: 1 })]);
    expect(widened.findings[0]).toMatchObject({ exposedDays: 5, otherDays: 6, otherRough: 0 });
  });
});

describe('dayCoverage — factor rows', () => {
  const NOW = new Date(2026, 5, 15, 12, 0, 0, 0).getTime();
  const DAY = 24 * 60 * 60 * 1000;
  const keyOf = (ms: number) => formatDateInput(ms);

  it('without factor rows the result is unchanged', () => {
    const entries = [{ loggedAt: NOW - 3 * DAY }, { loggedAt: NOW }];
    expect(dayCoverage(entries, [], NOW, 28, [])).toEqual(dayCoverage(entries, [], NOW));
  });

  it('a factor-only day counts as covered but not checked in', () => {
    const entries = [{ loggedAt: NOW }];
    const coverage = dayCoverage(entries, [], NOW, 28, [{ date: keyOf(NOW - 1 * DAY) }]);
    expect(coverage).toEqual({ covered: 2, total: 2, checkedIn: 0 });
  });

  it('factor rows alone produce coverage (the line is no longer hidden) and clip the window start', () => {
    const coverage = dayCoverage([], [], NOW, 28, [{ date: keyOf(NOW - 2 * DAY) }]);
    expect(coverage).toEqual({ covered: 1, total: 3, checkedIn: 0 });
  });

  it('a factor row on a day with an entry and a check-in is counted once', () => {
    const entries = [{ loggedAt: NOW }];
    const coverage = dayCoverage(entries, [{ date: keyOf(NOW) }], NOW, 28, [{ date: keyOf(NOW) }]);
    expect(coverage).toEqual({ covered: 1, total: 1, checkedIn: 1 });
  });

  it('ignores factor rows dated after today', () => {
    const coverage = dayCoverage([{ loggedAt: NOW }], [], NOW, 28, [{ date: keyOf(NOW + 3 * DAY) }]);
    expect(coverage).toEqual({ covered: 1, total: 1, checkedIn: 0 });
  });
});

// --- factorCaveat ----------------------------------------------------------------

describe('factorCaveat', () => {
  function daysOf(map: Partial<Record<FactorKey, number[]>>): Map<FactorKey, FactorDays> {
    return new Map(
      Object.entries(map).map(([k, offsets]) => {
        const set = new Set((offsets ?? []).map(key));
        return [k as FactorKey, { flagged: set, logged: set }];
      }),
    );
  }

  function inst(offset: number, followedByOutcome: boolean) {
    return { entry: meal(offset), followedByOutcome, outcomeDelayMs: followedByOutcome ? 3600000 : null };
  }

  it('is null with fewer than 2 overlapping hits', () => {
    expect(factorCaveat([inst(0, true), inst(20, true), inst(21, true)], daysOf({ stress: [0] }))).toBeNull();
  });

  it('is a caveat at exactly half of the hits', () => {
    const instances = [inst(0, true), inst(1, true), inst(20, true), inst(21, true)];
    expect(factorCaveat(instances, daysOf({ stress: [0, 1] }))).toEqual({
      key: 'stress',
      label: 'High stress',
      overlapping: 2,
      hits: 4,
    });
  });

  it('is null below half of the hits', () => {
    const instances = [inst(0, true), inst(1, true), inst(20, true), inst(21, true), inst(22, true)];
    expect(factorCaveat(instances, daysOf({ stress: [0, 1] }))).toBeNull();
  });

  it('never counts misses', () => {
    const onlyMisses = [inst(0, false), inst(1, false), inst(20, true), inst(21, true)];
    expect(factorCaveat(onlyMisses, daysOf({ stress: [0, 1] }))).toBeNull();
    const withMisses = [inst(0, true), inst(1, true), inst(2, false), inst(3, false)];
    expect(factorCaveat(withMisses, daysOf({ stress: [0, 1, 2, 3] }))).toMatchObject({ overlapping: 2, hits: 2 });
  });

  it('picks the factor overlapping the most hits; ties go to factor order', () => {
    const instances = [inst(0, true), inst(1, true), inst(2, true)];
    expect(factorCaveat(instances, daysOf({ stress: [0], sleep: [0, 1, 2] }))).toMatchObject({
      key: 'sleep',
      overlapping: 3,
    });
    expect(factorCaveat([inst(0, true), inst(1, true)], daysOf({ sleep: [0, 1], stress: [0, 1] }))?.key).toBe(
      'stress',
    );
  });

  it('uses the MEAL day, not the outcome day', () => {
    expect(factorCaveat([inst(0, true), inst(0, true)], daysOf({ stress: [1] }))).toBeNull();
  });

  it('counts a meal on the day after drinking (alcohol window)', () => {
    const map = factorDays([row(10, { alcohol: 'a_lot' })], ON);
    const caveat = factorCaveat([inst(10, true), inst(11, true)], map);
    expect(caveat).toMatchObject({ key: 'alcohol', overlapping: 2, hits: 2 });
  });
});

// --- sentences ----------------------------------------------------------------------

describe('sentences', () => {
  it('factorSentence reads like the Insights card and never claims causation', () => {
    const s = stressScenario({ flaggedDays: 10, flaggedRough: 6, baseDays: 15, baseRough: 3 });
    const [finding] = analyze(s).findings;
    expect(factorSentence(finding)).toBe(
      'Rough on 6 of 10 high-stress days (60%) vs 3 of 15 other days you logged stress (20%).',
    );
    expect(factorSentence(finding)).not.toMatch(/caus|because|due to/i);
  });

  it.each<[FactorKey, string, string]>([
    ['sleep', 'poor-sleep days', 'other days you logged sleep'],
    ['alcohol', 'days you had alcohol or the day after', 'other days you logged alcohol'],
    ['caffeine', 'days with more caffeine than usual', 'other days you logged caffeine'],
    ['period', 'period days', 'other days you tracked your period'],
  ])('factorSentence wording for %s', (k, flagged, base) => {
    const sentence = factorSentence({
      key: k,
      label: 'x',
      flaggedDays: 10,
      flaggedRough: 5,
      flaggedRate: 0.5,
      baseDays: 10,
      baseRough: 1,
      baseRate: 0.1,
      confidence: 'high',
    });
    expect(sentence).toBe(`Rough on 5 of 10 ${flagged} (50%) vs 1 of 10 ${base} (10%).`);
  });

  it('factorNoteSentence covers each reason', () => {
    expect(
      factorNoteSentence({ key: 'sleep', label: 'Poor sleep', reason: 'too-few-days', flaggedDays: 2, baseDays: 9 }),
    ).toBe('Poor sleep — only 2 logged days so far.');
    expect(
      factorNoteSentence({ key: 'sleep', label: 'Poor sleep', reason: 'too-few-days', flaggedDays: 1, baseDays: 9 }),
    ).toBe('Poor sleep — only 1 logged day so far.');
    expect(
      factorNoteSentence({ key: 'sleep', label: 'Poor sleep', reason: 'too-few-days', flaggedDays: 8, baseDays: 3 }),
    ).toBe('Poor sleep — only 3 days to compare against so far.');
    expect(
      factorNoteSentence({ key: 'stress', label: 'High stress', reason: 'nearly-always', flaggedDays: 18, baseDays: 2 }),
    ).toBe("High stress — flagged on nearly every day you logged it, so there's nothing to compare against.");
  });

  it('factorCaveatSentence', () => {
    expect(factorCaveatSentence({ key: 'stress', label: 'High stress', overlapping: 5, hits: 7 })).toBe(
      '5 of the 7 meals followed by a rough outcome were on high-stress days.',
    );
    expect(factorCaveatSentence({ key: 'alcohol', label: 'Alcohol', overlapping: 2, hits: 3 })).toBe(
      '2 of the 3 meals followed by a rough outcome were on days you had alcohol or the day after.',
    );
  });
});

// --- worked example --------------------------------------------------------------------

describe('worked example (fixture -> factor finding + caveat)', () => {
  it('stress: 6 of 10 high-stress days rough vs 3 of 15 other logged days, and a food card caveat', () => {
    // 10 high-stress days (offsets 0-9): days 0-5 each end in a rough symptom, and a "Cheese Pizza"
    // meal is eaten earlier on each of those six days.
    // 15 other days with stress logged at 2 (offsets 100-114): 3 rough.
    const entries: LogEntry[] = [];
    const rows: FactorRow[] = [];
    for (let i = 0; i < 10; i++) {
      entries.push(meal(i, { name: i < 6 ? 'Cheese Pizza' : 'Rice' }));
      if (i < 6) entries.push(symptom(i)); // evening symptom: within 24 h of the noon meal
      rows.push(row(i, { stress: i % 2 === 0 ? 5 : 4 }));
    }
    for (let i = 0; i < 15; i++) {
      entries.push(meal(100 + i));
      if (i < 3) entries.push(symptom(100 + i));
      rows.push(row(100 + i, { stress: 2 }));
    }

    const { findings, notes } = analyzeFactorDays(entries, [], rows, ON);
    expect(notes).toEqual([]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ key: 'stress', flaggedDays: 10, flaggedRough: 6, baseDays: 15, baseRough: 3 });
    const sentence = factorSentence(findings[0]);
    expect(sentence).toBe('Rough on 6 of 10 high-stress days (60%) vs 3 of 15 other days you logged stress (20%).');

    // The caveat on the "Cheese Pizza" food card: all 6 hit meals were on high-stress days.
    const instances = findingInstances(entries, 'food', 'Cheese Pizza');
    const caveat = factorCaveat(instances, factorDays(rows, ON));
    expect(caveat).toEqual({ key: 'stress', label: 'High stress', overlapping: 6, hits: 6 });
    const caveatLine = factorCaveatSentence(caveat!);
    expect(caveatLine).toBe('6 of the 6 meals followed by a rough outcome were on high-stress days.');
  });
});
