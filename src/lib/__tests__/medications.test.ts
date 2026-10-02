import type { Medication, MedicationDose, MedicationEvent } from '@/db/schema';
import {
  filterDoseRecordsInRange,
  flattenDoseRecords,
  formatDoseSummary,
  groupDoseRecordsByMedication,
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
      { medicationId: 'a', dose: 10, doseUnit: 'mg' },
      { medicationId: 'b', dose: 0.5, doseUnit: 'tablet' },
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
