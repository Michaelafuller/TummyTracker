import type { DayCheckIn, LogEntry } from '@/db/schema';
import {
  DEFAULT_PROTOCOL,
  baselinePreview,
  currentPhase,
  dayFacts,
  evaluateExperiment,
  experimentSchedule,
  MAX_SLIP_RATIO,
  NOT_TRIGGER_MIN_CHALLENGE_EXPOSURE,
  VERDICT_REASON_NOT_ENOUGH_DAYS,
  VERDICT_REASON_NO_BASELINE_ROUGH_DAYS,
  VERDICT_REASON_NO_CHALLENGE_EXPOSURE,
  VERDICT_REASON_NOT_TRIGGER,
  VERDICT_REASON_TOO_MANY_SLIPS,
  VERDICT_REASON_TRIGGER,
  type ExperimentLike,
} from '../engine';

const TERM = 'lactose';

function baseExp(overrides: Partial<ExperimentLike> = {}): ExperimentLike {
  return {
    term: TERM,
    startDate: '2026-04-01',
    baselineDays: DEFAULT_PROTOCOL.baselineDays,
    eliminationDays: DEFAULT_PROTOCOL.eliminationDays,
    challengeDays: DEFAULT_PROTOCOL.challengeDays,
    observationDays: DEFAULT_PROTOCOL.observationDays,
    ...overrides,
  };
}

function dateKeyToMs(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
}

let idCounter = 0;

function foodEntry(day: string, overrides: Partial<LogEntry> = {}): LogEntry {
  idCounter++;
  return {
    id: `food-${idCounter}`,
    type: 'meal',
    mealSlot: null,
    name: 'Meal',
    barcode: null,
    loggedAt: dateKeyToMs(day),
    sentiment: null,
    bristolScale: null,
    symptomType: null,
    severity: null,
    notes: null,
    ingredientsText: null,
    tagsJson: null,
    servingG: null,
    calories: null,
    fatG: null,
    saturatedFatG: null,
    carbsG: null,
    proteinG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    componentCount: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function bmEntry(day: string, overrides: Partial<LogEntry> = {}): LogEntry {
  idCounter++;
  return {
    ...foodEntry(day),
    id: `bm-${idCounter}`,
    type: 'bowel_movement',
    bristolScale: 1, // bad Bristol -> isOutcome
    ...overrides,
  };
}

function checkInOn(date: string, status: DayCheckIn['status']): DayCheckIn {
  return { id: `ci-${date}`, date, status, createdAt: 0, updatedAt: 0 };
}

/** Builds entries for a list of days: each day gets a covering food entry
 * (optionally tagged with TERM for "exposed"), and a bad-Bristol BM entry
 * when marked "rough". */
function daysEntries(
  days: readonly string[],
  { rough = new Set<string>(), exposed = new Set<string>() }: { rough?: Set<string>; exposed?: Set<string> } = {},
): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const day of days) {
    entries.push(foodEntry(day, exposed.has(day) ? { tagsJson: JSON.stringify([TERM]) } : {}));
    if (rough.has(day)) entries.push(bmEntry(day));
  }
  return entries;
}

function daysSet(days: readonly string[], count: number): Set<string> {
  return new Set(days.slice(0, count));
}

describe('experimentSchedule', () => {
  it('builds the four phases from startDate, matching the start-screen example dates', () => {
    const schedule = experimentSchedule(baseExp({ startDate: '2026-09-28', eliminationDays: 14 }));
    expect(schedule.elimination[0]).toBe('2026-09-28');
    expect(schedule.elimination[schedule.elimination.length - 1]).toBe('2026-10-11');
    expect(schedule.challenge).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
    expect(schedule.observation).toEqual(['2026-10-15', '2026-10-16', '2026-10-17']);
    expect(schedule.lastDay).toBe('2026-10-17');
  });

  it('baseline is the baselineDays days immediately before startDate', () => {
    const schedule = experimentSchedule(baseExp({ startDate: '2026-04-15', baselineDays: 14 }));
    expect(schedule.baseline).toHaveLength(14);
    expect(schedule.baseline[0]).toBe('2026-04-01');
    expect(schedule.baseline[13]).toBe('2026-04-14');
  });

  it('handles a DST-crossing elimination window (US spring-forward, 2026-03-08)', () => {
    const schedule = experimentSchedule(baseExp({ startDate: '2026-03-01', eliminationDays: 14 }));
    expect(schedule.elimination).toHaveLength(14);
    expect(schedule.elimination[0]).toBe('2026-03-01');
    expect(schedule.elimination).toContain('2026-03-08');
    expect(schedule.elimination[schedule.elimination.length - 1]).toBe('2026-03-14');
  });

  it('handles a month-boundary elimination window', () => {
    const schedule = experimentSchedule(baseExp({ startDate: '2026-01-25', eliminationDays: 14 }));
    expect(schedule.elimination[0]).toBe('2026-01-25');
    expect(schedule.elimination[schedule.elimination.length - 1]).toBe('2026-02-07');
  });

  it('respects a shorter elimination choice (7 days)', () => {
    const schedule = experimentSchedule(baseExp({ startDate: '2026-04-01', eliminationDays: 7 }));
    expect(schedule.elimination).toHaveLength(7);
    expect(schedule.challenge[0]).toBe('2026-04-08');
  });
});

describe('currentPhase', () => {
  const exp = baseExp({ startDate: '2026-04-01', eliminationDays: 14, challengeDays: 3, observationDays: 3 });
  // elimination: 04-01..04-14, challenge: 04-15..04-17, observation: 04-18..04-20

  it('treats a today before startDate as elimination day 1 (defensive)', () => {
    expect(currentPhase(exp, '2026-03-25')).toEqual({ phase: 'elimination', dayOfPhase: 1, phaseLength: 14 });
  });

  it('startDate itself is elimination day 1', () => {
    expect(currentPhase(exp, '2026-04-01')).toEqual({ phase: 'elimination', dayOfPhase: 1, phaseLength: 14 });
  });

  it('last elimination day is elimination day 14', () => {
    expect(currentPhase(exp, '2026-04-14')).toEqual({ phase: 'elimination', dayOfPhase: 14, phaseLength: 14 });
  });

  it('first challenge day is challenge day 1', () => {
    expect(currentPhase(exp, '2026-04-15')).toEqual({ phase: 'challenge', dayOfPhase: 1, phaseLength: 3 });
  });

  it('last challenge day is challenge day 3', () => {
    expect(currentPhase(exp, '2026-04-17')).toEqual({ phase: 'challenge', dayOfPhase: 3, phaseLength: 3 });
  });

  it('first observation day is observation day 1', () => {
    expect(currentPhase(exp, '2026-04-18')).toEqual({ phase: 'observation', dayOfPhase: 1, phaseLength: 3 });
  });

  it('last observation day is observation day 3', () => {
    expect(currentPhase(exp, '2026-04-20')).toEqual({ phase: 'observation', dayOfPhase: 3, phaseLength: 3 });
  });

  it('the day after the last observation day is ready', () => {
    expect(currentPhase(exp, '2026-04-21')).toEqual({ phase: 'ready', dayOfPhase: 3, phaseLength: 3 });
  });

  it('well after the schedule is still ready', () => {
    expect(currentPhase(exp, '2026-06-01').phase).toBe('ready');
  });
});

describe('dayFacts', () => {
  it('is covered by a check-in alone (no log entry that day)', () => {
    const facts = dayFacts([], [checkInOn('2026-04-01', 'fine')], TERM);
    expect(facts.get('2026-04-01')).toEqual({ covered: true, rough: false, exposed: false });
  });

  it('is rough from a check-in alone', () => {
    const facts = dayFacts([], [checkInOn('2026-04-01', 'rough')], TERM);
    expect(facts.get('2026-04-01')?.rough).toBe(true);
  });

  it('an isOutcome entry beats a same-day "fine" check-in — rough stays true', () => {
    const facts = dayFacts([bmEntry('2026-04-01')], [checkInOn('2026-04-01', 'fine')], TERM);
    expect(facts.get('2026-04-01')).toEqual({ covered: true, rough: true, exposed: false });
  });

  it('exposure only comes from a food entry matching the term', () => {
    const matchingFood = foodEntry('2026-04-01', { tagsJson: JSON.stringify([TERM]) });
    const nonFood = bmEntry('2026-04-02', { tagsJson: JSON.stringify([TERM]) });
    const facts = dayFacts([matchingFood, nonFood], [], TERM);
    expect(facts.get('2026-04-01')?.exposed).toBe(true);
    expect(facts.get('2026-04-02')?.exposed).toBe(false); // BM entries never count as exposure
  });

  it('a day with no entry and no check-in is simply absent (uncovered)', () => {
    const facts = dayFacts([], [], TERM);
    expect(facts.get('2026-04-01')).toBeUndefined();
  });
});

describe('evaluateExperiment — slip exclusion', () => {
  it('excludes a slip day AND the day after it from elimination stats, but not the day after that', () => {
    const exp = baseExp({ startDate: '2026-04-01', eliminationDays: 7 });
    const schedule = experimentSchedule(exp);
    // Slip on day 3 (2026-04-03). Every elimination day is covered and rough
    // except the slip day itself, so the exclusion is visible in the counts.
    const rough = new Set(schedule.elimination);
    rough.delete('2026-04-03');
    const entries = daysEntries(schedule.elimination, { rough, exposed: new Set(['2026-04-03']) });
    const evaluation = evaluateExperiment(exp, entries, [], '2026-04-07');

    expect(evaluation.slipDays).toEqual(['2026-04-03']);
    // 7 elimination days minus the slip day and the day right after it = 5 counted.
    expect(evaluation.elimination.days).toBe(5);
    expect(evaluation.elimination.covered).toBe(5);
    // 2026-04-05 (two days after the slip) is still counted and still rough.
    expect(evaluation.elimination.rough).toBe(5);
  });

  it('rate is null when a phase has no covered days at all', () => {
    const exp = baseExp({ startDate: '2026-04-01' });
    const evaluation = evaluateExperiment(exp, [], [], '2026-04-01');
    expect(evaluation.baseline).toEqual({ days: 14, covered: 0, rough: 0, rate: null });
    expect(evaluation.elimination.rate).toBeNull();
    expect(evaluation.verdict).toBeNull(); // phase isn't 'ready' yet
  });
});

describe('evaluateExperiment — verdict rules, evaluated in order', () => {
  const exp = baseExp({ startDate: '2026-04-01', eliminationDays: 14, challengeDays: 3, observationDays: 3 });
  const schedule = experimentSchedule(exp);
  const readyToday = '2026-04-21'; // the day after schedule.lastDay

  it('rule 1 — too many slips makes it inconclusive', () => {
    // maxSlips = max(1, floor(14 * 0.15)) = 2; use 3 slip days.
    expect(Math.max(1, Math.floor(14 * MAX_SLIP_RATIO))).toBe(2);
    const exposed = daysSet(schedule.elimination, 3);
    const entries = [
      ...daysEntries(schedule.elimination, { exposed }),
      ...daysEntries(schedule.challenge, { exposed: new Set(schedule.challenge) }),
      ...daysEntries(schedule.observation),
    ];
    const evaluation = evaluateExperiment(exp, entries, [], readyToday);
    expect(evaluation.slipDays).toHaveLength(3);
    expect(evaluation.verdict).toEqual(
      expect.objectContaining({ kind: 'inconclusive', confidence: null, reason: VERDICT_REASON_TOO_MANY_SLIPS }),
    );
  });

  it('rule 2 — no logged exposure on any challenge day is inconclusive', () => {
    const entries = [
      ...daysEntries(schedule.elimination),
      ...daysEntries(schedule.challenge), // never exposed
      ...daysEntries(schedule.observation),
    ];
    const evaluation = evaluateExperiment(exp, entries, [], readyToday);
    expect(evaluation.challengeExposureDays).toBe(0);
    expect(evaluation.verdict).toEqual(
      expect.objectContaining({ kind: 'inconclusive', confidence: null, reason: VERDICT_REASON_NO_CHALLENGE_EXPOSURE }),
    );
  });

  it('rule 3 — not enough baseline days logged is inconclusive', () => {
    const entries = [
      ...daysEntries(schedule.baseline.slice(0, 3)), // only 3 of 14 baseline days covered
      ...daysEntries(schedule.elimination),
      ...daysEntries(schedule.challenge, { exposed: new Set(schedule.challenge) }),
      ...daysEntries(schedule.observation),
    ];
    const evaluation = evaluateExperiment(exp, entries, [], readyToday);
    expect(evaluation.baseline.covered).toBe(3);
    expect(evaluation.verdict).toEqual(
      expect.objectContaining({ kind: 'inconclusive', confidence: null, reason: VERDICT_REASON_NOT_ENOUGH_DAYS }),
    );
  });

  it('rule 4 — no rough days in the baseline is inconclusive (nothing to improve)', () => {
    const entries = [
      ...daysEntries(schedule.baseline), // covered, never rough
      ...daysEntries(schedule.elimination),
      ...daysEntries(schedule.challenge, { exposed: new Set(schedule.challenge) }),
      ...daysEntries(schedule.observation),
    ];
    const evaluation = evaluateExperiment(exp, entries, [], readyToday);
    expect(evaluation.baseline.rough).toBe(0);
    expect(evaluation.verdict).toEqual(
      expect.objectContaining({ kind: 'inconclusive', confidence: null, reason: VERDICT_REASON_NO_BASELINE_ROUGH_DAYS }),
    );
  });

  it('rule 5 — mixed results ("improved but did not clearly return") when only the drop half moved', () => {
    // baseline 6/14 rough, elimination 2/14 rough (drop = 0.286 >= 0.2),
    // reintroduction 1/6 rough (rise = 0.024 < 0.1) — neither trigger nor not-trigger.
    const entries = [
      ...daysEntries(schedule.baseline, { rough: daysSet(schedule.baseline, 6) }),
      ...daysEntries(schedule.elimination, { rough: daysSet(schedule.elimination, 2) }),
      ...daysEntries(schedule.challenge, { exposed: new Set(schedule.challenge) }),
      ...daysEntries(schedule.observation, { rough: daysSet(schedule.observation, 1) }),
    ];
    const evaluation = evaluateExperiment(exp, entries, [], readyToday);
    expect(evaluation.verdict?.kind).toBe('inconclusive');
    expect(evaluation.verdict?.confidence).toBeNull();
    expect(evaluation.verdict?.reason).toMatch(/^Mixed results: it improved/);
  });

  it('rule 5/6 — likely-trigger with HIGH confidence when both bounds clear', () => {
    // Reintroduction needs a high enough rate (5/6, via 2 of 3 challenge days
    // + all 3 observation days) for its Wilson lower bound to clear the
    // elimination phase's (0/14) Wilson upper bound, same as the baseline's.
    const entries = [
      ...daysEntries(schedule.baseline, { rough: daysSet(schedule.baseline, 10) }), // 10/14
      ...daysEntries(schedule.elimination), // 0/14 rough
      ...daysEntries(schedule.challenge, { exposed: new Set(schedule.challenge), rough: daysSet(schedule.challenge, 2) }),
      ...daysEntries(schedule.observation, { rough: new Set(schedule.observation) }),
    ];
    const evaluation = evaluateExperiment(exp, entries, [], readyToday);
    expect(evaluation.reintroduction.rough).toBe(5);
    expect(evaluation.verdict).toEqual(
      expect.objectContaining({ kind: 'likely-trigger', confidence: 'high', reason: VERDICT_REASON_TRIGGER }),
    );
  });

  it('rule 5/6 — likely-trigger with MEDIUM confidence when exactly one bound clears', () => {
    // Same reintroduction rate (5/6) as the HIGH case, but a thinner baseline
    // (3/14) whose own Wilson lower bound no longer clears the elimination
    // phase's upper bound — only the reintroduction side does.
    const entries = [
      ...daysEntries(schedule.baseline, { rough: daysSet(schedule.baseline, 3) }), // 3/14
      ...daysEntries(schedule.elimination), // 0/14
      ...daysEntries(schedule.challenge, { exposed: new Set(schedule.challenge), rough: daysSet(schedule.challenge, 2) }),
      ...daysEntries(schedule.observation, { rough: new Set(schedule.observation) }),
    ];
    const evaluation = evaluateExperiment(exp, entries, [], readyToday);
    expect(evaluation.reintroduction.rough).toBe(5);
    expect(evaluation.verdict).toEqual(
      expect.objectContaining({ kind: 'likely-trigger', confidence: 'medium', reason: VERDICT_REASON_TRIGGER }),
    );
  });

  it('rule 5/6 — likely-trigger with LOW confidence when neither bound clears', () => {
    const entries = [
      ...daysEntries(schedule.baseline, { rough: daysSet(schedule.baseline, 5) }), // 5/14
      ...daysEntries(schedule.elimination, { rough: daysSet(schedule.elimination, 1) }), // 1/14
      ...daysEntries(schedule.challenge, { exposed: new Set(schedule.challenge), rough: daysSet(schedule.challenge, 1) }),
      ...daysEntries(schedule.observation, { rough: daysSet(schedule.observation, 1) }), // total reintroduction 2/6
    ];
    const evaluation = evaluateExperiment(exp, entries, [], readyToday);
    expect(evaluation.reintroduction.rough).toBe(2);
    expect(evaluation.verdict).toEqual(
      expect.objectContaining({ kind: 'likely-trigger', confidence: 'low', reason: VERDICT_REASON_TRIGGER }),
    );
  });

  it('rule 5/6 — likely-not-trigger with MEDIUM confidence', () => {
    const entries = [
      ...daysEntries(schedule.baseline, { rough: daysSet(schedule.baseline, 2) }), // 2/14 = 0.143
      ...daysEntries(schedule.elimination, { rough: daysSet(schedule.elimination, 2) }), // 2/14 = 0.143
      ...daysEntries(schedule.challenge, { exposed: new Set(schedule.challenge) }), // 3 exposed days >= NOT_TRIGGER_MIN_CHALLENGE_EXPOSURE
      ...daysEntries(schedule.observation, { rough: daysSet(schedule.observation, 1) }), // reintroduction 1/6 = 0.167
    ];
    expect(NOT_TRIGGER_MIN_CHALLENGE_EXPOSURE).toBeLessThanOrEqual(3);
    const evaluation = evaluateExperiment(exp, entries, [], readyToday);
    expect(evaluation.verdict).toEqual(
      expect.objectContaining({ kind: 'likely-not-trigger', confidence: 'medium', reason: VERDICT_REASON_NOT_TRIGGER }),
    );
  });

  it('rule 5/6 — likely-not-trigger with LOW confidence when challenge exposure is too thin', () => {
    const entries = [
      ...daysEntries(schedule.baseline, { rough: daysSet(schedule.baseline, 2) }),
      ...daysEntries(schedule.elimination, { rough: daysSet(schedule.elimination, 2) }),
      ...daysEntries(schedule.challenge, { exposed: daysSet(schedule.challenge, 1) }), // only 1 exposed challenge day
      ...daysEntries(schedule.observation, { rough: daysSet(schedule.observation, 1) }),
    ];
    const evaluation = evaluateExperiment(exp, entries, [], readyToday);
    expect(evaluation.challengeExposureDays).toBe(1);
    expect(evaluation.verdict).toEqual(
      expect.objectContaining({ kind: 'likely-not-trigger', confidence: 'low', reason: VERDICT_REASON_NOT_TRIGGER }),
    );
  });
});

describe('baselinePreview', () => {
  it('matches evaluateExperiment’s own baseline stats for an experiment starting today', () => {
    const today = '2026-04-15';
    const exp = baseExp({ startDate: today });
    const schedule = experimentSchedule(exp);
    const entries = daysEntries(schedule.baseline, { rough: daysSet(schedule.baseline, 4) });

    const preview = baselinePreview(entries, [], TERM, today);
    const evaluation = evaluateExperiment(exp, entries, [], today);

    expect(preview).toEqual(evaluation.baseline);
    expect(preview).toEqual({ days: 14, covered: 14, rough: 4, rate: 4 / 14 });
  });

  it('is all-null-ish when nothing was logged', () => {
    expect(baselinePreview([], [], TERM, '2026-04-15')).toEqual({ days: 14, covered: 0, rough: 0, rate: null });
  });
});
