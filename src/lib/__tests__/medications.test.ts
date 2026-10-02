import type { Medication, MedicationDose, MedicationEvent } from '@/db/schema';
import {
  MAX_REASON_LENGTH,
  adherenceLine,
  adherenceSummary,
  adherenceWindow,
  doseDayKeys,
  doseDaysInMonth,
  filterDoseRecordsInRange,
  flattenDoseRecords,
  formatDoseAmount,
  formatDoseLabel,
  formatDoseSummary,
  groupDoseRecordsByMedication,
  pastReasons,
  reasonSuggestionsByMedication,
  validateReason,
  regularDoses,
  summarizeMedicationUse,
  validateMedication,
  wasTakenOn,
  type MedicationInput,
} from '../medications';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function baseInput(overrides: Partial<MedicationInput> = {}): MedicationInput {
  return { name: 'Omeprazole', ...overrides };
}

describe('validateMedication', () => {
  it('is valid for just a name', () => {
    const result = validateMedication(baseInput());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('rejects an empty (or whitespace-only) name', () => {
    expect(validateMedication(baseInput({ name: '' })).errors.name).toBeTruthy();
    expect(validateMedication(baseInput({ name: '   ' })).errors.name).toBeTruthy();
  });

  it('rejects a name over 100 characters', () => {
    const result = validateMedication(baseInput({ name: 'a'.repeat(101) }));
    expect(result.valid).toBe(false);
    expect(result.errors.name).toMatch(/100/);
  });

  it('accepts a name of exactly 100 characters', () => {
    const result = validateMedication(baseInput({ name: 'a'.repeat(100) }));
    expect(result.valid).toBe(true);
  });

  it('rejects a defaultDose of 0 or negative', () => {
    expect(
      validateMedication(baseInput({ defaultDose: 0, doseUnit: 'mg' })).errors.defaultDose,
    ).toBeTruthy();
    expect(
      validateMedication(baseInput({ defaultDose: -5, doseUnit: 'mg' })).errors.defaultDose,
    ).toBeTruthy();
  });

  it('rejects a non-finite defaultDose', () => {
    expect(
      validateMedication(baseInput({ defaultDose: NaN, doseUnit: 'mg' })).errors.defaultDose,
    ).toBeTruthy();
  });

  it('accepts a fractional defaultDose (partial doses allowed)', () => {
    const result = validateMedication(baseInput({ defaultDose: 0.5, doseUnit: 'tablet' }));
    expect(result.valid).toBe(true);
  });

  it('requires a unit when a dose is given', () => {
    const result = validateMedication(baseInput({ defaultDose: 10, doseUnit: null }));
    expect(result.valid).toBe(false);
    expect(result.errors.doseUnit).toBeTruthy();
  });

  it('does not require a unit when no dose is given', () => {
    const result = validateMedication(baseInput({ doseUnit: null }));
    expect(result.valid).toBe(true);
  });

  it('accepts an "Other" unit trimmed to 20 characters or fewer', () => {
    const result = validateMedication(baseInput({ defaultDose: 1, doseUnit: 'a'.repeat(20) }));
    expect(result.valid).toBe(true);
  });

  it('rejects an "Other" unit over 20 characters', () => {
    const result = validateMedication(baseInput({ defaultDose: 1, doseUnit: 'a'.repeat(21) }));
    expect(result.valid).toBe(false);
    expect(result.errors.doseUnit).toMatch(/20/);
  });

  it('rejects a whitespace-only unit as missing', () => {
    const result = validateMedication(baseInput({ defaultDose: 1, doseUnit: '   ' }));
    expect(result.valid).toBe(false);
    expect(result.errors.doseUnit).toBeTruthy();
  });

  it('requires endDate on or after startDate when both are set', () => {
    const result = validateMedication(baseInput({ startDate: 2000, endDate: 1000 }));
    expect(result.valid).toBe(false);
    expect(result.errors.endDate).toBeTruthy();
  });

  it('accepts endDate equal to startDate', () => {
    const result = validateMedication(baseInput({ startDate: 1000, endDate: 1000 }));
    expect(result.valid).toBe(true);
  });

  it('accepts an endDate with no startDate set, and vice versa', () => {
    expect(validateMedication(baseInput({ endDate: 1000 })).valid).toBe(true);
    expect(validateMedication(baseInput({ startDate: 1000 })).valid).toBe(true);
  });

  it('rejects notes over the 500-char cap', () => {
    const result = validateMedication(baseInput({ notes: 'a'.repeat(501) }));
    expect(result.valid).toBe(false);
    expect(result.errors.notes).toBeTruthy();
  });

  it('reports every failing field at once', () => {
    const result = validateMedication({
      name: '',
      defaultDose: -1,
      doseUnit: 'a'.repeat(21),
      startDate: 2000,
      endDate: 1000,
      notes: 'a'.repeat(501),
    });
    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(
      ['defaultDose', 'doseUnit', 'endDate', 'name', 'notes'].sort(),
    );
  });
});

describe('formatDoseSummary', () => {
  it('formats dose + unit + frequency', () => {
    expect(formatDoseSummary({ defaultDose: 10, doseUnit: 'mg', frequency: 'twice daily' })).toBe(
      '10 mg · twice daily',
    );
  });

  it('formats dose + unit alone', () => {
    expect(formatDoseSummary({ defaultDose: 10, doseUnit: 'mg', frequency: null })).toBe('10 mg');
  });

  it('formats frequency alone', () => {
    expect(formatDoseSummary({ defaultDose: null, doseUnit: null, frequency: 'twice daily' })).toBe(
      'twice daily',
    );
  });

  it('returns "" when neither dose nor frequency is set', () => {
    expect(formatDoseSummary({ defaultDose: null, doseUnit: null, frequency: null })).toBe('');
  });

  it('drops trailing zeros on a fractional dose', () => {
    expect(formatDoseSummary({ defaultDose: 0.5, doseUnit: 'tablet', frequency: null })).toBe(
      '0.5 tablet',
    );
  });

  it('does not show a dose when the unit is missing', () => {
    expect(formatDoseSummary({ defaultDose: 10, doseUnit: null, frequency: 'twice daily' })).toBe(
      'twice daily',
    );
  });

  it('treats a blank frequency as absent', () => {
    expect(formatDoseSummary({ defaultDose: 10, doseUnit: 'mg', frequency: '   ' })).toBe('10 mg');
  });
});

function makeEvent(overrides: Partial<MedicationEvent> = {}): MedicationEvent {
  return {
    id: 'evt1',
    takenAt: 0,
    timeKnown: true,
    notes: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeDose(overrides: Partial<MedicationDose> = {}): MedicationDose {
  return {
    id: 'dose1',
    eventId: 'evt1',
    medicationId: 'med1',
    dose: 10,
    doseUnit: 'mg',
    reason: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('flattenDoseRecords', () => {
  it('maps every #11 field, pulling notes from the event', () => {
    const events = [makeEvent({ id: 'evt1', takenAt: 500, timeKnown: false, notes: 'with food' })];
    const doses = [makeDose({ id: 'dose1', eventId: 'evt1', medicationId: 'med1', dose: 5, doseUnit: 'mL' })];

    const records = flattenDoseRecords(events, doses);

    expect(records).toEqual([
      {
        entryId: 'dose1',
        eventId: 'evt1',
        medicationId: 'med1',
        takenAt: 500,
        timeKnown: false,
        dose: 5,
        doseUnit: 'mL',
        reason: null,
        notes: 'with food',
        createdAt: 0,
        updatedAt: 0,
      },
    ]);
  });

  it('two doses in one event both share the eventId and event notes', () => {
    const events = [makeEvent({ id: 'evt1', notes: 'breakfast' })];
    const doses = [
      makeDose({ id: 'doseA', eventId: 'evt1', medicationId: 'medA' }),
      makeDose({ id: 'doseB', eventId: 'evt1', medicationId: 'medB' }),
    ];

    const records = flattenDoseRecords(events, doses);

    expect(records).toHaveLength(2);
    expect(records[0].eventId).toBe('evt1');
    expect(records[1].eventId).toBe('evt1');
    expect(records[0].notes).toBe('breakfast');
    expect(records[1].notes).toBe('breakfast');
    expect(records.map((r) => r.medicationId)).toEqual(['medA', 'medB']);
  });

  it('skips a dose whose event cannot be found', () => {
    const records = flattenDoseRecords([], [makeDose({ eventId: 'missing' })]);
    expect(records).toEqual([]);
  });
});

describe('filterDoseRecordsInRange', () => {
  const records = [
    { ...flattenDoseRecords([makeEvent({ id: 'e', takenAt: 0 })], [makeDose({ eventId: 'e' })])[0] },
  ];

  it('is half-open: includes start, excludes end', () => {
    const record = records[0];
    const atStart = { ...record, takenAt: 1000 };
    const atEnd = { ...record, takenAt: 2000 };
    const inside = { ...record, takenAt: 1500 };
    const before = { ...record, takenAt: 999 };

    const filtered = filterDoseRecordsInRange([atStart, atEnd, inside, before], { start: 1000, end: 2000 });

    expect(filtered.map((r) => r.takenAt).sort((a, b) => a - b)).toEqual([1000, 1500]);
  });
});

describe('groupDoseRecordsByMedication', () => {
  it('groups records under their medicationId', () => {
    const events = [makeEvent({ id: 'evt1' })];
    const doses = [
      makeDose({ id: 'd1', eventId: 'evt1', medicationId: 'medA' }),
      makeDose({ id: 'd2', eventId: 'evt1', medicationId: 'medB' }),
      makeDose({ id: 'd3', eventId: 'evt1', medicationId: 'medA' }),
    ];
    const groups = groupDoseRecordsByMedication(flattenDoseRecords(events, doses));

    expect(groups.get('medA')).toHaveLength(2);
    expect(groups.get('medB')).toHaveLength(1);
  });

  it('a renamed/inactive medication is irrelevant here — grouping is keyed only by id', () => {
    // DoseRecord carries no name/isActive at all; the medication's current
    // name or active state can change freely and its dose history still
    // groups under the same stable medicationId (#11 invariant).
    const events = [makeEvent({ id: 'evt1' })];
    const doses = [
      makeDose({ id: 'd1', eventId: 'evt1', medicationId: 'med-renamed-and-inactive' }),
      makeDose({ id: 'd2', eventId: 'evt1', medicationId: 'med-renamed-and-inactive' }),
    ];
    const groups = groupDoseRecordsByMedication(flattenDoseRecords(events, doses));

    expect(groups.get('med-renamed-and-inactive')).toHaveLength(2);
    expect(groups.size).toBe(1);
  });
});

describe('wasTakenOn', () => {
  const dayStart = 10 * DAY;

  it('is false when there is no record at all', () => {
    expect(wasTakenOn([], 'med1', dayStart)).toBe(false);
  });

  it('is true for a record at 23:59 that day', () => {
    const events = [makeEvent({ id: 'evt1', takenAt: dayStart + 23 * HOUR + 59 * 60 * 1000 })];
    const doses = [makeDose({ eventId: 'evt1', medicationId: 'med1' })];
    const records = flattenDoseRecords(events, doses);

    expect(wasTakenOn(records, 'med1', dayStart)).toBe(true);
  });

  it('is false for a record on the next day', () => {
    const events = [makeEvent({ id: 'evt1', takenAt: dayStart + DAY })];
    const doses = [makeDose({ eventId: 'evt1', medicationId: 'med1' })];
    const records = flattenDoseRecords(events, doses);

    expect(wasTakenOn(records, 'med1', dayStart)).toBe(false);
  });

  it('is false for a different medicationId on the same day', () => {
    const events = [makeEvent({ id: 'evt1', takenAt: dayStart + HOUR })];
    const doses = [makeDose({ eventId: 'evt1', medicationId: 'medOther' })];
    const records = flattenDoseRecords(events, doses);

    expect(wasTakenOn(records, 'med1', dayStart)).toBe(false);
  });
});

function makeMedication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 'med1',
    name: 'Omeprazole',
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

describe('validateMedication — regular (GitHub #26)', () => {
  it('requires a default dose when regular', () => {
    const result = validateMedication(baseInput({ isRegular: true }));
    expect(result.valid).toBe(false);
    expect(result.errors.defaultDose).toBe('A regular medication needs a default dose and unit.');
  });

  it('requires a unit when regular with a dose', () => {
    const result = validateMedication(baseInput({ isRegular: true, defaultDose: 5 }));
    expect(result.valid).toBe(false);
    expect(result.errors.doseUnit).toBeTruthy();
  });

  it('is valid when regular with a dose and unit, and not-regular needs neither', () => {
    expect(validateMedication(baseInput({ isRegular: true, defaultDose: 5, doseUnit: 'mg' })).valid).toBe(true);
    expect(validateMedication(baseInput({ isRegular: false })).valid).toBe(true);
  });
});

describe('regularDoses', () => {
  const reg = (id: string, overrides: Partial<Medication> = {}) =>
    makeMedication({ id, name: id, isRegular: true, defaultDose: 10, doseUnit: 'mg', ...overrides });

  it('returns only active, regular medications with a dose and unit, as dose inputs', () => {
    const doses = regularDoses([reg('a'), reg('b', { defaultDose: 0.5, doseUnit: 'tablet' })]);
    expect(doses).toEqual([
      { medicationId: 'a', dose: 10, doseUnit: 'mg', reason: null },
      { medicationId: 'b', dose: 0.5, doseUnit: 'tablet', reason: null },
    ]);
  });

  it('skips inactive, not-regular, and dose/unit-less medications', () => {
    const doses = regularDoses([
      reg('inactive', { isActive: false }),
      reg('notRegular', { isRegular: false }),
      reg('noDose', { defaultDose: null }),
      reg('zeroDose', { defaultDose: 0 }),
      reg('noUnit', { doseUnit: null }),
      reg('blankUnit', { doseUnit: '  ' }),
      reg('ok'),
    ]);
    expect(doses.map((d) => d.medicationId)).toEqual(['ok']);
  });

  it('preserves the input order and returns [] for none', () => {
    expect(regularDoses([reg('z'), reg('a'), reg('m')]).map((d) => d.medicationId)).toEqual(['z', 'a', 'm']);
    expect(regularDoses([])).toEqual([]);
  });
});

describe('summarizeMedicationUse', () => {
  it('counts only dose rows within the half-open range', () => {
    const meds = [makeMedication({ id: 'med1' })];
    const events = [
      makeEvent({ id: 'e1', takenAt: 1000 }),
      makeEvent({ id: 'e2', takenAt: 1999 }),
      makeEvent({ id: 'e3', takenAt: 2000 }), // at end -> excluded
      makeEvent({ id: 'e4', takenAt: 999 }), // before start -> excluded
    ];
    const doses = [
      makeDose({ id: 'd1', eventId: 'e1', medicationId: 'med1' }),
      makeDose({ id: 'd2', eventId: 'e2', medicationId: 'med1' }),
      makeDose({ id: 'd3', eventId: 'e3', medicationId: 'med1' }),
      makeDose({ id: 'd4', eventId: 'e4', medicationId: 'med1' }),
    ];

    const result = summarizeMedicationUse(meds, events, doses, { start: 1000, end: 2000 });

    expect(result).toHaveLength(1);
    expect(result[0].dosesLogged).toBe(2);
  });

  it('counts distinct local days with a dose, not dose rows (two doses one day = 1)', () => {
    // Local-date-constructed timestamps (not raw epoch/DAY multiples) so this
    // is correct regardless of the machine's timezone — DAY*n from the 1970
    // epoch isn't guaranteed to land on local midnight off-UTC.
    const meds = [makeMedication({ id: 'med1' })];
    const day = new Date(2026, 0, 5, 0, 0, 0, 0).getTime();
    const events = [
      makeEvent({ id: 'e1', takenAt: day + HOUR }),
      makeEvent({ id: 'e2', takenAt: day + 10 * HOUR }),
    ];
    const doses = [
      makeDose({ id: 'd1', eventId: 'e1', medicationId: 'med1' }),
      makeDose({ id: 'd2', eventId: 'e2', medicationId: 'med1' }),
    ];
    const start = new Date(2026, 0, 1, 0, 0, 0, 0).getTime();
    const end = new Date(2026, 0, 11, 0, 0, 0, 0).getTime();

    const result = summarizeMedicationUse(meds, events, doses, { start, end });

    expect(result[0].dosesLogged).toBe(2);
    expect(result[0].daysWithDose).toBe(1);
  });

  it('includes an inactive medication that has doses in range, flagged as inactive', () => {
    const meds = [makeMedication({ id: 'med1', isActive: false })];
    const events = [makeEvent({ id: 'e1', takenAt: 500 })];
    const doses = [makeDose({ id: 'd1', eventId: 'e1', medicationId: 'med1' })];

    const result = summarizeMedicationUse(meds, events, doses, { start: 0, end: 1000 });

    expect(result).toHaveLength(1);
    expect(result[0].isActive).toBe(false);
  });

  it('excludes an inactive medication with no doses in range', () => {
    const meds = [makeMedication({ id: 'med1', isActive: false })];

    const result = summarizeMedicationUse(meds, [], [], { start: 0, end: 1000 });

    expect(result).toHaveLength(0);
  });

  it('includes an active medication with no doses, all zero counts', () => {
    const meds = [makeMedication({ id: 'med1', isActive: true })];
    const start = new Date(2026, 0, 1, 0, 0, 0, 0).getTime();
    const end = new Date(2026, 0, 6, 0, 0, 0, 0).getTime(); // 5 local days

    const result = summarizeMedicationUse(meds, [], [], { start, end });

    expect(result).toHaveLength(1);
    expect(result[0].dosesLogged).toBe(0);
    expect(result[0].daysWithDose).toBe(0);
    expect(result[0].daysInRange).toBe(5);
    expect(result[0].amounts).toEqual([]);
  });

  it("clips daysInRange to the medication's own startDate/endDate (endDate inclusive of that day)", () => {
    const rangeStart = new Date(2026, 0, 1, 0, 0, 0, 0).getTime();
    const rangeEnd = new Date(2026, 0, 11, 0, 0, 0, 0).getTime(); // 10-day range
    const medStart = new Date(2026, 0, 3, 0, 0, 0, 0).getTime(); // Jan 3
    const medEnd = new Date(2026, 0, 5, 0, 0, 0, 0).getTime(); // Jan 5 (inclusive)
    const meds = [makeMedication({ id: 'med1', startDate: medStart, endDate: medEnd, isActive: true })];

    const result = summarizeMedicationUse(meds, [], [], { start: rangeStart, end: rangeEnd });

    // Jan 3, 4, 5 — endDate's own day counts.
    expect(result[0].daysInRange).toBe(3);
  });

  it('clamps daysInRange up to daysWithDose when a dose falls outside the stated dates', () => {
    const rangeStart = new Date(2026, 0, 1, 0, 0, 0, 0).getTime();
    const rangeEnd = new Date(2026, 0, 11, 0, 0, 0, 0).getTime();
    const medStart = new Date(2026, 0, 3, 0, 0, 0, 0).getTime();
    const medEnd = new Date(2026, 0, 3, 0, 0, 0, 0).getTime(); // just Jan 3
    const meds = [makeMedication({ id: 'med1', startDate: medStart, endDate: medEnd, isActive: true })];
    const events = [
      makeEvent({ id: 'e1', takenAt: new Date(2026, 0, 3, 9, 0, 0).getTime() }), // inside the stated single day
      makeEvent({ id: 'e2', takenAt: new Date(2026, 0, 8, 9, 0, 0).getTime() }), // well outside the stated end date
    ];
    const doses = [
      makeDose({ id: 'd1', eventId: 'e1', medicationId: 'med1' }),
      makeDose({ id: 'd2', eventId: 'e2', medicationId: 'med1' }),
    ];

    const result = summarizeMedicationUse(meds, events, doses, { start: rangeStart, end: rangeEnd });

    expect(result[0].daysWithDose).toBe(2);
    // Officially clipped to 1 day, but never less than the 2 days it actually has doses on.
    expect(result[0].daysInRange).toBe(2);
  });

  it('counts calendar days across a DST-spring-forward transition (date-stepping, not ms/86_400_000)', () => {
    const start = new Date(2026, 2, 1, 0, 0, 0, 0).getTime(); // March 1
    const end = new Date(2026, 2, 15, 0, 0, 0, 0).getTime(); // March 15 — 14 calendar days
    const meds = [makeMedication({ id: 'med1', isActive: true })];

    const result = summarizeMedicationUse(meds, [], [], { start, end });

    expect(result[0].daysInRange).toBe(14);
  });

  it("summarizes amounts from each dose's own snapshot, most frequent first (a later default change doesn't alter them)", () => {
    const meds = [makeMedication({ id: 'med1', defaultDose: 999, doseUnit: 'capsule' })];
    const events = [
      makeEvent({ id: 'e1', takenAt: 100 }),
      makeEvent({ id: 'e2', takenAt: 200 }),
      makeEvent({ id: 'e3', takenAt: 300 }),
    ];
    const doses = [
      makeDose({ id: 'd1', eventId: 'e1', medicationId: 'med1', dose: 20, doseUnit: 'mg' }),
      makeDose({ id: 'd2', eventId: 'e2', medicationId: 'med1', dose: 10, doseUnit: 'mg' }),
      makeDose({ id: 'd3', eventId: 'e3', medicationId: 'med1', dose: 20, doseUnit: 'mg' }),
    ];

    const result = summarizeMedicationUse(meds, events, doses, { start: 0, end: 1000 });

    expect(result[0].amounts).toEqual([
      { label: '20 mg', count: 2 },
      { label: '10 mg', count: 1 },
    ]);
  });

  it('orders medications with doses first (most dosesLogged first), then active-without-doses A–Z', () => {
    const meds = [
      makeMedication({ id: 'zeta', name: 'Zeta', isActive: true }),
      makeMedication({ id: 'alpha', name: 'Alpha', isActive: true }),
      makeMedication({ id: 'few', name: 'Few', isActive: true }),
      makeMedication({ id: 'many', name: 'Many', isActive: true }),
    ];
    const events = [
      makeEvent({ id: 'e1', takenAt: 100 }),
      makeEvent({ id: 'e2', takenAt: 200 }),
      makeEvent({ id: 'e3', takenAt: 300 }),
    ];
    const doses = [
      makeDose({ id: 'd1', eventId: 'e1', medicationId: 'few' }),
      makeDose({ id: 'd2', eventId: 'e2', medicationId: 'many' }),
      makeDose({ id: 'd3', eventId: 'e3', medicationId: 'many' }),
    ];

    const result = summarizeMedicationUse(meds, events, doses, { start: 0, end: 1000 });

    expect(result.map((r) => r.name)).toEqual(['Many', 'Few', 'Alpha', 'Zeta']);
  });

  it('never lets frequency affect any count (nothing is inferred from a schedule)', () => {
    const medWithFrequency = makeMedication({ id: 'med1', frequency: 'twice daily', isActive: true });
    const medWithout = makeMedication({ id: 'med2', name: 'Other', frequency: null, isActive: true });

    const result = summarizeMedicationUse([medWithFrequency, medWithout], [], [], { start: 0, end: DAY * 5 });

    expect(result.every((r) => r.dosesLogged === 0 && r.daysWithDose === 0)).toBe(true);
  });
});

describe('summarizeMedicationUse — end date on a DST day', () => {
  it('counts the end date once when it falls on the spring-forward day (23 h long)', () => {
    // 2026-03-08 is US spring-forward: endDate + 24 h lands at 01:00 on Mar 9,
    // which counted Mar 9 too. Over Mar 6 – Mar 12 the medication covers
    // Mar 6, 7 and 8: 3 days, not 4.
    const med: Medication = {
      id: 'm1',
      name: 'Course',
      defaultDose: null,
      doseUnit: null,
      frequency: null,
      startDate: null,
      endDate: new Date(2026, 2, 8).getTime(),
      isActive: true,
      isRegular: false,
      notes: null,
      createdAt: 0,
      updatedAt: 0,
    };
    const range = { start: new Date(2026, 2, 6).getTime(), end: new Date(2026, 2, 13).getTime() };
    const [row] = summarizeMedicationUse([med], [], [], range);
    expect(row.daysInRange).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// GitHub #28 — adherence view + as-needed reasons
// ---------------------------------------------------------------------------

const NOW = new Date(2026, 9, 15, 12, 0).getTime(); // Thu 2026-10-15 12:00 local
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
/** Local time `daysAgo` days before NOW's date, at the given hour (Date arithmetic, DST-safe). */
const daysAgoAt = (daysAgo: number, h = 12, min = 0) => new Date(2026, 9, 15 - daysAgo, h, min).getTime();

let seq = 0;
/** One event + one dose for `medicationId` at each timestamp. */
function logDoses(
  medicationId: string,
  times: number[],
  doseOverrides: Partial<MedicationDose> = {},
): { events: MedicationEvent[]; doses: MedicationDose[] } {
  const events: MedicationEvent[] = [];
  const doses: MedicationDose[] = [];
  for (const takenAt of times) {
    const eventId = `ev${seq++}`;
    events.push(makeEvent({ id: eventId, takenAt, createdAt: takenAt }));
    doses.push(makeDose({ id: `do${seq++}`, eventId, medicationId, createdAt: takenAt, ...doseOverrides }));
  }
  return { events, doses };
}

describe('formatDoseLabel / formatDoseAmount', () => {
  it('is the amount alone without a reason', () => {
    expect(formatDoseLabel(200, 'mg')).toBe('200 mg');
    expect(formatDoseLabel(200, 'mg', null)).toBe('200 mg');
    expect(formatDoseLabel(200, 'mg', '   ')).toBe('200 mg');
  });

  it('appends " — reason" and drops trailing zeros', () => {
    expect(formatDoseLabel(200, 'mg', 'headache')).toBe('200 mg — headache');
    expect(formatDoseLabel(0.5, 'tablet', ' cramps ')).toBe('0.5 tablet — cramps');
  });

  it('formatDoseAmount never includes a reason', () => {
    expect(formatDoseAmount(200, 'mg')).toBe('200 mg');
  });
});

describe('validateReason', () => {
  it('turns blank / missing into null and is valid', () => {
    expect(validateReason('')).toEqual({ valid: true, value: null });
    expect(validateReason('   ')).toEqual({ valid: true, value: null });
    expect(validateReason(null)).toEqual({ valid: true, value: null });
    expect(validateReason(undefined)).toEqual({ valid: true, value: null });
  });

  it('trims', () => {
    expect(validateReason('  headache ')).toEqual({ valid: true, value: 'headache' });
  });

  it('accepts exactly the max length and rejects one more', () => {
    expect(validateReason('a'.repeat(MAX_REASON_LENGTH)).valid).toBe(true);
    const over = validateReason('a'.repeat(MAX_REASON_LENGTH + 1));
    expect(over.valid).toBe(false);
    expect(over.error).toMatch(/60/);
  });

  it('measures the trimmed length', () => {
    expect(validateReason(` ${'a'.repeat(MAX_REASON_LENGTH)} `).valid).toBe(true);
  });
});

describe('adherenceWindow', () => {
  it('is the 30 local days ending today, today included', () => {
    const w = adherenceWindow(NOW);
    expect(w.start).toBe(at(2026, 9, 16, 0, 0));
    expect(w.end).toBe(at(2026, 10, 16, 0, 0));
  });

  it('is still 30 local days across a DST change (no 24 h arithmetic)', () => {
    // 2026-03-08 is US spring-forward; in a non-DST timezone this is simply 30 days too.
    const now = at(2026, 3, 20, 9, 0);
    const w = adherenceWindow(now);
    expect(w.start).toBe(at(2026, 2, 19, 0, 0));
    expect(w.end).toBe(at(2026, 3, 21, 0, 0));
  });
});

describe('adherenceSummary — day counting', () => {
  const med = makeMedication({ isRegular: false });

  it('counts a dose at 00:00 today, 29 days ago 00:00 — and not 30 days ago or tomorrow', () => {
    const { events, doses } = logDoses('med1', [
      daysAgoAt(0, 0, 0), // today 00:00 — in
      daysAgoAt(29, 0, 0), // window start — in
      daysAgoAt(30, 23, 59), // the day before the window — out
      at(2026, 10, 16, 0, 0), // tomorrow 00:00 — out
    ]);
    expect(adherenceSummary(med, events, doses, NOW)).toEqual({ daysWithDose: 2, denominator: null });
  });

  it('counts a day once however many doses it has', () => {
    const { events, doses } = logDoses('med1', [daysAgoAt(3, 8), daysAgoAt(3, 14), daysAgoAt(3, 21), daysAgoAt(1, 9)]);
    expect(adherenceSummary(med, events, doses, NOW).daysWithDose).toBe(2);
  });

  it("ignores other medications' doses", () => {
    const mine = logDoses('med1', [daysAgoAt(2)]);
    const other = logDoses('med2', [daysAgoAt(4), daysAgoAt(5)]);
    const summary = adherenceSummary(med, [...mine.events, ...other.events], [...mine.doses, ...other.doses], NOW);
    expect(summary.daysWithDose).toBe(1);
  });

  it('is 0 with no doses', () => {
    expect(adherenceSummary(med, [], [], NOW)).toEqual({ daysWithDose: 0, denominator: null });
  });
});

describe('adherenceSummary — regular medications', () => {
  const regular = makeMedication({ isRegular: true, defaultDose: 20, doseUnit: 'mg' });

  it('uses the full 30 days once the first dose is at or before the window start', () => {
    const times = [daysAgoAt(45), daysAgoAt(29), daysAgoAt(20), daysAgoAt(0)];
    const { events, doses } = logDoses('med1', times);
    expect(adherenceSummary(regular, events, doses, NOW)).toEqual({ daysWithDose: 3, denominator: 30 });
  });

  it('starts counting at the first dose ever for a younger medication', () => {
    // First dose 9 days ago -> today + 9 earlier days = 10 days.
    const { events, doses } = logDoses('med1', [daysAgoAt(9), daysAgoAt(5), daysAgoAt(0)]);
    expect(adherenceSummary(regular, events, doses, NOW)).toEqual({ daysWithDose: 3, denominator: 10 });
  });

  it('clips to a later startDate than the first dose', () => {
    const med = { ...regular, startDate: daysAgoAt(5, 0, 0) };
    const { events, doses } = logDoses('med1', [daysAgoAt(20), daysAgoAt(2)]);
    // Window clipped to start 5 days ago -> 6 days; the dose 20 days ago is still counted, and the
    // denominator never drops below the days that have a dose.
    expect(adherenceSummary(med, events, doses, NOW)).toEqual({ daysWithDose: 2, denominator: 6 });
  });

  it('clips to an earlier endDate (inclusive of that day)', () => {
    const med = { ...regular, endDate: daysAgoAt(10, 0, 0) };
    const { events, doses } = logDoses('med1', [daysAgoAt(40), daysAgoAt(25), daysAgoAt(11)]);
    // Window start (29 ago) .. end date (10 ago) inclusive = 20 days.
    expect(adherenceSummary(med, events, doses, NOW)).toEqual({ daysWithDose: 2, denominator: 20 });
  });

  it('never lets the denominator drop below the days with a dose (a dose after the endDate still counts)', () => {
    const med = { ...regular, endDate: daysAgoAt(28, 0, 0) };
    const { events, doses } = logDoses('med1', [daysAgoAt(40), daysAgoAt(10), daysAgoAt(5), daysAgoAt(0)]);
    // Window start .. endDate = 2 days, but 3 days have doses.
    expect(adherenceSummary(med, events, doses, NOW)).toEqual({ daysWithDose: 3, denominator: 3 });
  });

  it('keeps 30 across a DST change (counts local days, not 24 h blocks)', () => {
    const now = at(2026, 3, 20, 9, 0);
    const { events, doses } = logDoses('med1', [at(2026, 2, 10), at(2026, 3, 20, 7)]);
    expect(adherenceSummary(regular, events, doses, now)).toEqual({ daysWithDose: 1, denominator: 30 });
  });

  it('agrees with the report (summarizeMedicationUse) for the same window when nothing clips it', () => {
    const { events, doses } = logDoses('med1', [daysAgoAt(35), daysAgoAt(29), daysAgoAt(12), daysAgoAt(12, 20), daysAgoAt(0)]);
    const summary = adherenceSummary(regular, events, doses, NOW);
    const [row] = summarizeMedicationUse([regular], events, doses, adherenceWindow(NOW));
    expect(summary.daysWithDose).toBe(row.daysWithDose);
    expect(summary.denominator).toBe(row.daysInRange);
  });
});

describe('adherenceLine', () => {
  const regular = { isRegular: true };
  const asNeeded = { isRegular: false };

  it('regular, full window: "Logged on N of the last 30 days"', () => {
    expect(adherenceLine(regular, { daysWithDose: 26, denominator: 30 })).toBe('Logged on 26 of the last 30 days');
  });

  it('regular, younger medication: "Logged on N of the last M days"', () => {
    expect(adherenceLine(regular, { daysWithDose: 4, denominator: 10 })).toBe('Logged on 4 of the last 10 days');
  });

  it('as-needed: "Logged on N days in the last 30", singular for 1', () => {
    expect(adherenceLine(asNeeded, { daysWithDose: 4, denominator: null })).toBe('Logged on 4 days in the last 30');
    expect(adherenceLine(asNeeded, { daysWithDose: 1, denominator: null })).toBe('Logged on 1 day in the last 30');
  });

  it('nothing logged: "No doses logged in the last 30 days" for both kinds', () => {
    expect(adherenceLine(regular, { daysWithDose: 0, denominator: 30 })).toBe('No doses logged in the last 30 days');
    expect(adherenceLine(asNeeded, { daysWithDose: 0, denominator: null })).toBe('No doses logged in the last 30 days');
  });

  it('uses neutral logged-days wording and no percentage', () => {
    const lines = [
      adherenceLine(regular, { daysWithDose: 26, denominator: 30 }),
      adherenceLine(regular, { daysWithDose: 4, denominator: 10 }),
      adherenceLine(asNeeded, { daysWithDose: 4, denominator: null }),
      adherenceLine(asNeeded, { daysWithDose: 0, denominator: null }),
    ];
    for (const line of lines) expect(line).not.toMatch(/missed|skipped|%/i);
  });

  it('worked example: a regular and an as-needed medication', () => {
    const reg = makeMedication({ id: 'reg', isRegular: true, defaultDose: 20, doseUnit: 'mg' });
    const prn = makeMedication({ id: 'prn', isRegular: false });
    const regDoses = logDoses('reg', [daysAgoAt(29), ...Array.from({ length: 25 }, (_, i) => daysAgoAt(i))]);
    const prnDoses = logDoses('prn', [daysAgoAt(1), daysAgoAt(1, 20), daysAgoAt(6), daysAgoAt(12), daysAgoAt(30)]);
    const events = [...regDoses.events, ...prnDoses.events];
    const doses = [...regDoses.doses, ...prnDoses.doses];
    expect(adherenceLine(reg, adherenceSummary(reg, events, doses, NOW))).toBe('Logged on 26 of the last 30 days');
    expect(adherenceLine(prn, adherenceSummary(prn, events, doses, NOW))).toBe('Logged on 3 days in the last 30');
  });
});

describe('doseDayKeys / doseDaysInMonth', () => {
  it('lists the local days with a dose of this medication only', () => {
    const mine = logDoses('med1', [at(2026, 10, 3, 8), at(2026, 10, 3, 20), at(2026, 9, 30, 23, 30)]);
    const other = logDoses('med2', [at(2026, 10, 9)]);
    const events = [...mine.events, ...other.events];
    const doses = [...mine.doses, ...other.doses];
    expect(Array.from(doseDayKeys('med1', events, doses)).sort()).toEqual(['2026-09-30', '2026-10-03']);
  });

  it('limits to the requested month (1-12)', () => {
    const { events, doses } = logDoses('med1', [at(2026, 10, 3), at(2026, 9, 30), at(2025, 10, 4)]);
    expect(Array.from(doseDaysInMonth('med1', events, doses, 2026, 10))).toEqual(['2026-10-03']);
    expect(Array.from(doseDaysInMonth('med1', events, doses, 2026, 9))).toEqual(['2026-09-30']);
    expect(doseDaysInMonth('med1', events, doses, 2026, 11).size).toBe(0);
  });

  it('keys a late-night dose by its local day', () => {
    const { events, doses } = logDoses('med1', [at(2026, 10, 3, 23, 59)]);
    expect(Array.from(doseDayKeys('med1', events, doses))).toEqual(['2026-10-03']);
  });
});

describe('pastReasons', () => {
  function withReasons(entries: [number, string | null][], medicationId = 'med1') {
    const out = { events: [] as MedicationEvent[], doses: [] as MedicationDose[] };
    for (const [takenAt, reason] of entries) {
      const one = logDoses(medicationId, [takenAt], { reason });
      out.events.push(...one.events);
      out.doses.push(...one.doses);
    }
    return out;
  }

  it('lists distinct reasons, most recent first', () => {
    const { events, doses } = withReasons([
      [daysAgoAt(10), 'cramps'],
      [daysAgoAt(2), 'headache'],
      [daysAgoAt(5), 'back pain'],
    ]);
    expect(pastReasons('med1', events, doses)).toEqual(['headache', 'back pain', 'cramps']);
  });

  it('de-duplicates case-insensitively, keeping the most recent casing', () => {
    const { events, doses } = withReasons([
      [daysAgoAt(9), 'headache'],
      [daysAgoAt(3), 'Headache'],
      [daysAgoAt(1), 'nausea'],
    ]);
    expect(pastReasons('med1', events, doses)).toEqual(['nausea', 'Headache']);
  });

  it('is capped at 5', () => {
    const { events, doses } = withReasons(Array.from({ length: 8 }, (_, i) => [daysAgoAt(i), `r${i}`] as [number, string]));
    expect(pastReasons('med1', events, doses)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4']);
  });

  it('skips doses without a reason and other medications', () => {
    const mine = withReasons([
      [daysAgoAt(1), null],
      [daysAgoAt(2), 'cramps'],
    ]);
    const other = withReasons([[daysAgoAt(0), 'other med reason']], 'med2');
    expect(pastReasons('med1', [...mine.events, ...other.events], [...mine.doses, ...other.doses])).toEqual(['cramps']);
  });

  it('is empty with no history', () => {
    expect(pastReasons('med1', [], [])).toEqual([]);
  });
});

describe('flattenDoseRecords — reason', () => {
  it('carries the dose reason through', () => {
    const events = [makeEvent({ id: 'evt1', takenAt: 5 })];
    const doses = [makeDose({ eventId: 'evt1', reason: 'headache' })];
    expect(flattenDoseRecords(events, doses)[0].reason).toBe('headache');
  });
});

describe('summarizeMedicationUse — reasons never change the amounts', () => {
  it('counts "200 mg" once whatever the reasons', () => {
    const med = makeMedication({ isActive: true });
    const { events, doses } = logDoses('med1', [daysAgoAt(1), daysAgoAt(2)], { dose: 200, doseUnit: 'mg' });
    doses[0] = { ...doses[0], reason: 'headache' };
    doses[1] = { ...doses[1], reason: 'cramps' };
    const [row] = summarizeMedicationUse([med], events, doses, adherenceWindow(NOW));
    expect(row.amounts).toEqual([{ label: '200 mg', count: 2 }]);
  });
});

describe('reasonSuggestionsByMedication', () => {
  it('maps non-regular medications that have past reasons, and leaves regular / reasonless ones out', () => {
    const prn = makeMedication({ id: 'prn', isRegular: false });
    const reg = makeMedication({ id: 'reg', isRegular: true });
    const none = makeMedication({ id: 'none', isRegular: false });
    const a = logDoses('prn', [daysAgoAt(2)], { reason: 'headache' });
    const b = logDoses('reg', [daysAgoAt(2)], { reason: 'legacy' });
    const c = logDoses('none', [daysAgoAt(2)]);
    const map = reasonSuggestionsByMedication(
      [prn, reg, none],
      [...a.events, ...b.events, ...c.events],
      [...a.doses, ...b.doses, ...c.doses],
    );
    expect(map).toEqual({ prn: ['headache'] });
  });
});
