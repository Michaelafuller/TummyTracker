import type { Experiment, LogEntry, Medication, MedicationDose, MedicationEvent } from '@/db/schema';
import { buildReportHtml, escapeHtml, REPORT_RANGES } from '../report';

let seq = 0;
function makeEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: `e${seq++}`,
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

const HOUR = 60 * 60 * 1000;

// "Now" = local Aug 24, 2026, 10:00 — the 30-day window ending today (inclusive)
// spans [Jul 26 00:00, Aug 25 00:00).
const NOW = new Date(2026, 7, 24, 10, 0, 0).getTime();

describe('REPORT_RANGES', () => {
  it('is exactly 14, 30, 90', () => {
    expect(REPORT_RANGES).toEqual([14, 30, 90]);
  });
});

describe('escapeHtml', () => {
  it('escapes &, <, >, double quotes, and single quotes', () => {
    expect(escapeHtml(`<b>Tom & Jerry's "great" show</b>`)).toBe(
      '&lt;b&gt;Tom &amp; Jerry&#39;s &quot;great&quot; show&lt;/b&gt;',
    );
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Rice and beans')).toBe('Rice and beans');
  });
});

describe('buildReportHtml — range filtering', () => {
  it('includes an entry logged at the start of the window (inclusive) and one logged today', () => {
    const windowStart = new Date(2026, 6, 26, 0, 0, 0).getTime(); // Jul 26 00:00, exactly 30 days back
    const entries = [
      makeEntry({ name: 'WindowStart', loggedAt: windowStart }),
      makeEntry({ name: 'Today', loggedAt: NOW }),
    ];
    const html = buildReportHtml(entries, NOW, 30);
    expect(html).toContain('WindowStart');
    expect(html).toContain('Today');
  });

  it('excludes an entry logged just before the window and one logged in the future', () => {
    const windowStart = new Date(2026, 6, 26, 0, 0, 0).getTime();
    const entries = [
      makeEntry({ name: 'TooOld', loggedAt: windowStart - 1 }),
      makeEntry({ name: 'Future', loggedAt: new Date(2026, 7, 25, 0, 0, 0).getTime() }), // Aug 25 00:00 — outside [..., Aug 25 00:00)
    ];
    const html = buildReportHtml(entries, NOW, 30);
    expect(html).not.toContain('TooOld');
    expect(html).not.toContain('Future');
    expect(html).toContain('No entries in this range.');
  });
});

describe('buildReportHtml — escaping', () => {
  it('renders a malicious entry name only in its escaped form', () => {
    const entries = [makeEntry({ name: 'Rice<script>alert(1)</script>', loggedAt: NOW, notes: '<img src=x onerror=alert(2)>' })];
    const html = buildReportHtml(entries, NOW, 30);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain(escapeHtml('Rice<script>alert(1)</script>'));
    expect(html).toContain(escapeHtml('<img src=x onerror=alert(2)>'));
  });
});

describe('buildReportHtml — summary', () => {
  it('includes the entries/food/BM/symptoms/rough-outcomes summary numbers', () => {
    const entries = [
      makeEntry({ type: 'meal', name: 'Toast', loggedAt: NOW }),
      makeEntry({ type: 'bowel_movement', name: 'BM', loggedAt: NOW, bristolScale: 1 }), // bad Bristol -> rough outcome
      makeEntry({ type: 'symptom', name: 'Cramps', loggedAt: NOW, severity: 4 }),
    ];
    const html = buildReportHtml(entries, NOW, 30);
    expect(html).toContain('3 entries');
    expect(html).toContain('1 food');
    expect(html).toContain('1 BM');
    expect(html).toContain('1 symptoms');
    expect(html).toContain('2 rough outcomes');
  });
});

describe('buildReportHtml — findings', () => {
  it('produces a finding sentence for a seeded ingredient-outcome pattern', () => {
    // Same fixture shape as analyzeIngredientOutcomes's proven case
    // (analysis/__tests__/insights.test.ts): "lactose" meals all followed by a
    // symptom within 24h, vs a control group that's never followed by one.
    // All timestamps sit in the past relative to NOW (offset from a base ~16.6
    // days back) so nothing falls outside the 30-day report window, which never
    // includes entries logged after "today".
    const BASE = NOW - 400 * HOUR;
    const lactoseMeals = [
      makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: BASE }),
      makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: BASE + 48 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: BASE + 96 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["rice"]', loggedAt: BASE + 200 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["rice"]', loggedAt: BASE + 248 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["rice"]', loggedAt: BASE + 296 * HOUR }),
      makeEntry({ type: 'symptom', severity: 4, loggedAt: BASE + 1 * HOUR }),
      makeEntry({ type: 'symptom', severity: 4, loggedAt: BASE + 49 * HOUR }),
      makeEntry({ type: 'symptom', severity: 4, loggedAt: BASE + 97 * HOUR }),
    ];
    const html = buildReportHtml(lactoseMeals, NOW, 30);
    expect(html).toContain('Ingredients');
    expect(html).toContain('lactose: 3 of 3 meals');
    expect(html).toContain('confidence');
  });

  it('shows "No patterns stand out yet." when there are no findings (and no journal rows) for an empty range', () => {
    const html = buildReportHtml([], NOW, 30);
    expect(html).toContain('No patterns stand out yet.');
    expect(html).toContain('No entries in this range.');
  });
});

describe('buildReportHtml — entryDetail', () => {
  it("prints a BM's feel rating alongside Bristol", () => {
    const entries = [
      makeEntry({ type: 'bowel_movement', name: 'BM', loggedAt: NOW, bristolScale: 4, sentiment: 2 }),
    ];
    const html = buildReportHtml(entries, NOW, 30);
    expect(html).toContain('Felt');
    expect(html).toContain('Bristol 4');
  });

  it('does not print a sentiment/feel label for a meal or snack', () => {
    const entries = [makeEntry({ type: 'meal', name: 'Toast', loggedAt: NOW, sentiment: 4 })];
    const html = buildReportHtml(entries, NOW, 30);
    expect(html).not.toContain('Felt');
  });
});

describe('buildReportHtml — disclaimer', () => {
  it('includes the exact observation-framing disclaimer', () => {
    const html = buildReportHtml([], NOW, 30);
    expect(html).toContain(
      "These are observations from the user's own logs — patterns, not medical advice.",
    );
  });
});

let medSeq = 0;
function makeMedication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: `med${medSeq++}`,
    name: 'Omeprazole',
    defaultDose: null,
    doseUnit: null,
    frequency: null,
    startDate: null,
    endDate: null,
    isActive: true,
    notes: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

let eventSeq = 0;
function makeMedicationEvent(overrides: Partial<MedicationEvent> = {}): MedicationEvent {
  return {
    id: `evt${eventSeq++}`,
    takenAt: NOW,
    timeKnown: true,
    notes: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

let doseSeq = 0;
function makeMedicationDose(overrides: Partial<MedicationDose> = {}): MedicationDose {
  return {
    id: `dose${doseSeq++}`,
    eventId: 'evt0',
    medicationId: 'med0',
    dose: 20,
    doseUnit: 'mg',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('buildReportHtml — medications (GitHub #17)', () => {
  it('omits the Medications section entirely when no medication data is passed', () => {
    const html = buildReportHtml([makeEntry({ loggedAt: NOW })], NOW, 30);
    expect(html).not.toContain('<h2>Medications</h2>');
    expect(html).not.toContain('Medications');
  });

  it('adds a Medications section with a table row for a medication with doses in range', () => {
    const med = makeMedication({ id: 'med1', name: 'Omeprazole', frequency: 'once daily', isActive: true });
    const event = makeMedicationEvent({ id: 'evt1', takenAt: NOW });
    const dose = makeMedicationDose({ id: 'd1', eventId: 'evt1', medicationId: 'med1', dose: 20, doseUnit: 'mg' });

    const html = buildReportHtml([], NOW, 30, { meds: [med], events: [event], doses: [dose] });

    expect(html).toContain('<h2>Medications</h2>');
    expect(html).toContain('Omeprazole');
    expect(html).toContain('20 mg ×1');
    expect(html).toContain('once daily');
    expect(html).toContain('1 of 30'); // 1 day with a logged dose, out of the 30-day window (no start/end dates set)
  });

  it('shows "0 of N" and "No doses logged in this range" for an active medication with none', () => {
    const med = makeMedication({ id: 'med1', name: 'Ibuprofen', isActive: true });

    const html = buildReportHtml([], NOW, 30, { meds: [med], events: [], doses: [] });

    expect(html).toContain('Ibuprofen');
    expect(html).toContain('0 of 30');
    expect(html).toContain('No doses logged in this range');
  });

  it('marks an inactive medication with "(inactive)"', () => {
    const med = makeMedication({ id: 'med1', name: 'Old Med', isActive: false });
    const event = makeMedicationEvent({ id: 'evt1', takenAt: NOW });
    const dose = makeMedicationDose({ id: 'd1', eventId: 'evt1', medicationId: 'med1' });

    const html = buildReportHtml([], NOW, 30, { meds: [med], events: [event], doses: [dose] });

    expect(html).toContain('Old Med (inactive)');
  });

  it('uses "logged" wording only — never "missed" or "skipped"', () => {
    const med = makeMedication({ id: 'med1', name: 'Ibuprofen', isActive: true });

    const html = buildReportHtml([], NOW, 30, { meds: [med], events: [], doses: [] });

    expect(html).toContain('logged');
    expect(html).not.toContain('missed');
    expect(html).not.toContain('skipped');
  });

  it('escapes a hostile medication name, unit, frequency, and event note', () => {
    const med = makeMedication({
      id: 'med1',
      name: '<script>alert(1)</script>',
      frequency: '<b>daily</b>',
      isActive: true,
    });
    const event = makeMedicationEvent({ id: 'evt1', takenAt: NOW, notes: '<img src=x onerror=alert(2)>' });
    const dose = makeMedicationDose({
      id: 'd1',
      eventId: 'evt1',
      medicationId: 'med1',
      dose: 5,
      doseUnit: '<i>units</i>',
    });

    const html = buildReportHtml([], NOW, 30, { meds: [med], events: [event], doses: [dose] });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>daily</b>');
    expect(html).not.toContain('<i>units</i>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain(escapeHtml('<script>alert(1)</script>'));
    expect(html).toContain(escapeHtml('<b>daily</b>'));
    expect(html).toContain(escapeHtml('<i>units</i>'));
    expect(html).toContain(escapeHtml('<img src=x onerror=alert(2)>'));
  });

  it('interleaves medication events into the Journal day table by time, alongside log entries', () => {
    const entry = makeEntry({ name: 'Toast', loggedAt: new Date(2026, 7, 24, 8, 0, 0).getTime() });
    const med = makeMedication({ id: 'med1', name: 'Omeprazole', isActive: true });
    const event = makeMedicationEvent({
      id: 'evt1',
      takenAt: new Date(2026, 7, 24, 9, 0, 0).getTime(),
      timeKnown: true,
    });
    const dose = makeMedicationDose({ id: 'd1', eventId: 'evt1', medicationId: 'med1', dose: 20, doseUnit: 'mg' });

    const html = buildReportHtml([entry], NOW, 30, { meds: [med], events: [event], doses: [dose] });

    expect(html).toContain('Toast');
    expect(html).toContain('Medication');
    expect(html).toContain('Omeprazole 20 mg');
  });

  it('shows "time not set" for a medication event without a known time', () => {
    const med = makeMedication({ id: 'med1', name: 'Omeprazole', isActive: true });
    const event = makeMedicationEvent({ id: 'evt1', takenAt: NOW, timeKnown: false });
    const dose = makeMedicationDose({ id: 'd1', eventId: 'evt1', medicationId: 'med1' });

    const html = buildReportHtml([], NOW, 30, { meds: [med], events: [event], doses: [dose] });

    expect(html).toContain('time not set');
  });

  it('still shows the empty Journal state when medication data is passed but nothing falls in range', () => {
    const html = buildReportHtml([], NOW, 30, { meds: [], events: [], doses: [] });
    expect(html).toContain('No entries in this range.');
  });

  it('adds "· N medication doses" to the summary line only when N > 0', () => {
    const medWithDose = makeMedication({ id: 'med1', name: 'Omeprazole', isActive: true });
    const event = makeMedicationEvent({ id: 'evt1', takenAt: NOW });
    const dose = makeMedicationDose({ id: 'd1', eventId: 'evt1', medicationId: 'med1' });

    const htmlWithDoses = buildReportHtml([], NOW, 30, { meds: [medWithDose], events: [event], doses: [dose] });
    expect(htmlWithDoses).toContain('1 medication doses');

    const medWithout = makeMedication({ id: 'med2', name: 'Ibuprofen', isActive: true });
    const htmlWithout = buildReportHtml([], NOW, 30, { meds: [medWithout], events: [], doses: [] });
    expect(htmlWithout).not.toContain('medication doses');
  });
});

describe('buildReportHtml — window across a DST change', () => {
  // 30 local days ending 2026-03-20 include the US spring-forward day
  // (2026-03-08, 23 hours long). The window must still be exactly 30 local
  // days: starting at local midnight on Feb 19, not at 23:00 on Feb 18.
  const MARCH_NOW = new Date(2026, 2, 20, 12, 0, 0).getTime();

  it('reports "of 30" for an active medication with no doses, not "of 31"', () => {
    const med = makeMedication({ id: 'med1', name: 'Ibuprofen', isActive: true, startDate: null, endDate: null });
    const html = buildReportHtml([], MARCH_NOW, 30, { meds: [med], events: [], doses: [] });
    expect(html).toContain('0 of 30');
    expect(html).not.toContain('0 of 31');
  });

  it('excludes an entry logged late on the day before the window', () => {
    const lateBefore = makeEntry({ id: 'x', name: 'Late snack', loggedAt: new Date(2026, 1, 18, 23, 30).getTime() });
    const firstDay = makeEntry({ id: 'y', name: 'First-day toast', loggedAt: new Date(2026, 1, 19, 8, 0).getTime() });
    const html = buildReportHtml([lateBefore, firstDay], MARCH_NOW, 30);
    expect(html).not.toContain('Late snack');
    expect(html).toContain('First-day toast');
  });
});

function makeExperiment(overrides: Partial<Experiment> = {}): Experiment {
  return {
    id: `x${seq++}`,
    term: 'lactose',
    startDate: '2026-07-27', // 14/3/3 -> last day 2026-08-15
    baselineDays: 14,
    eliminationDays: 14,
    challengeDays: 3,
    observationDays: 3,
    status: 'completed',
    verdictJson: null,
    endedAt: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const TRIGGER_VERDICT = JSON.stringify({
  kind: 'likely-trigger',
  confidence: 'high',
  reason: 'Rough days dropped while avoiding it and came back after reintroducing it.',
  baselineRate: 0.71,
  eliminationRate: 0,
  reintroductionRate: 0.83,
});

describe('buildReportHtml — experiments (GitHub #19)', () => {
  it('is unchanged when the experiments argument is omitted or empty', () => {
    const entries = [makeEntry({ loggedAt: NOW })];
    const base = buildReportHtml(entries, NOW, 30);
    expect(buildReportHtml(entries, NOW, 30, undefined, undefined)).toBe(base);
    expect(buildReportHtml(entries, NOW, 30, undefined, [])).toBe(base);
    expect(base).not.toContain('Elimination experiments');
  });

  it('adds a section for an experiment overlapping the range, with the sentence and a completed row', () => {
    const html = buildReportHtml([], NOW, 30, undefined, [
      makeExperiment({ status: 'completed', verdictJson: TRIGGER_VERDICT }),
    ]);

    expect(html).toContain('<h2>Elimination experiments</h2>');
    expect(html).toContain(
      'Elimination experiments the user ran. Verdicts are observations from their own logs, not diagnoses.',
    );
    expect(html).toContain('<th>Tested</th><th>Dates</th><th>Status</th><th>Result</th>');
    expect(html).toContain('<td>lactose</td>');
    expect(html).toContain('<td>Jul 27 – Aug 15</td>');
    expect(html).toContain('<td>Completed</td>');
    expect(html).toContain('Likely a trigger · high');
    expect(html).toContain('Rough days: before 71% · while avoiding 0% · after reintroducing 83%');
  });

  it('places the section after Medications and before the Journal', () => {
    const med = makeMedication({ id: 'med1', name: 'Omeprazole' });
    const event = makeMedicationEvent({ id: 'evt1', takenAt: NOW });
    const dose = makeMedicationDose({ id: 'd1', eventId: 'evt1', medicationId: 'med1' });
    const html = buildReportHtml([], NOW, 30, { meds: [med], events: [event], doses: [dose] }, [
      makeExperiment({ status: 'completed', verdictJson: TRIGGER_VERDICT }),
    ]);

    const medsAt = html.indexOf('<h2>Medications</h2>');
    const expAt = html.indexOf('<h2>Elimination experiments</h2>');
    const journalAt = html.indexOf('<h2>Journal</h2>');
    expect(medsAt).toBeGreaterThan(-1);
    expect(expAt).toBeGreaterThan(medsAt);
    expect(journalAt).toBeGreaterThan(expAt);
  });

  it('omits the section when nothing overlaps the range and nothing is active', () => {
    const html = buildReportHtml([], NOW, 30, undefined, [
      makeExperiment({ startDate: '2026-01-01', status: 'completed', verdictJson: TRIGGER_VERDICT }),
      makeExperiment({ startDate: '2026-01-01', status: 'abandoned' }),
    ]);
    expect(html).not.toContain('Elimination experiments');
  });

  it('applies the overlap rule at both edges of the window', () => {
    // 30-day window = Jul 26 .. Aug 24. Ends exactly on the first day: included.
    const endsOnFirstDay = makeExperiment({ term: 'edge-start', startDate: '2026-07-07' }); // last day 07-26
    // Ends the day before the window: excluded.
    const endsBefore = makeExperiment({ term: 'too-early', startDate: '2026-07-06' }); // last day 07-25
    // Starts on the last day of the window: included. Starts the day after: excluded.
    const startsOnLastDay = makeExperiment({ term: 'edge-end', startDate: '2026-08-24' });
    const startsAfter = makeExperiment({ term: 'too-late', startDate: '2026-08-25' });

    const html = buildReportHtml([], NOW, 30, undefined, [endsOnFirstDay, endsBefore, startsOnLastDay, startsAfter]);

    expect(html).toContain('<td>edge-start</td>');
    expect(html).toContain('<td>edge-end</td>');
    expect(html).not.toContain('too-early');
    expect(html).not.toContain('too-late');
  });

  it('respects the range: a 14-day report drops an experiment that finished before it', () => {
    const exp = makeExperiment({ startDate: '2026-07-07', status: 'completed', verdictJson: TRIGGER_VERDICT }); // ends 07-26
    expect(buildReportHtml([], NOW, 30, undefined, [exp])).toContain('<td>lactose</td>');
    expect(buildReportHtml([], NOW, 14, undefined, [exp])).not.toContain('Elimination experiments');
  });

  it('always includes an active experiment, with its current phase', () => {
    const html = buildReportHtml([], NOW, 14, undefined, [
      // Started long ago and still marked active: the schedule is finished, so a verdict is waiting.
      makeExperiment({ status: 'active', startDate: '2026-01-01', endedAt: null }),
      makeExperiment({ term: 'soy', status: 'active', startDate: '2026-08-20', endedAt: null }),
    ]);
    expect(html).toContain('In progress — Verdict ready');
    expect(html).toContain('In progress — Avoiding · day 5 of 14');
    expect(html).toContain('<td>soy</td>');
  });

  it('shows an abandoned experiment as ended early with no result', () => {
    const html = buildReportHtml([], NOW, 30, undefined, [makeExperiment({ status: 'abandoned' })]);
    expect(html).toContain('<td>Ended early</td><td>—</td>');
  });

  it('reads the FROZEN verdict, even when the current entries would evaluate differently', () => {
    // Entries that, evaluated today, contain no rough days at all — a live
    // evaluation could never say "likely a trigger". The frozen verdict wins.
    const entries = [makeEntry({ loggedAt: new Date(2026, 7, 5, 12).getTime(), name: 'Plain rice' })];
    const html = buildReportHtml(entries, NOW, 30, undefined, [
      makeExperiment({ status: 'completed', verdictJson: TRIGGER_VERDICT }),
    ]);
    expect(html).toContain('Likely a trigger · high');
    expect(html).not.toContain('Inconclusive');
  });

  it('falls back to a dash when a completed row has no readable verdict', () => {
    const html = buildReportHtml([], NOW, 30, undefined, [
      makeExperiment({ status: 'completed', verdictJson: '{oops' }),
    ]);
    expect(html).toContain('<td>Completed</td><td>—</td>');
  });

  it('escapes the user-authored term everywhere it appears', () => {
    const html = buildReportHtml([], NOW, 30, undefined, [
      makeExperiment({ term: '<img src=x onerror=1> & "q"', status: 'completed', verdictJson: TRIGGER_VERDICT }),
    ]);
    expect(html).toContain('&lt;img src=x onerror=1&gt; &amp; &quot;q&quot;');
    expect(html).not.toContain('<img src=x');
  });
});
