import type { MedicationDose, MedicationEvent } from '@/db/schema';
import {
  filterDoseRecordsInRange,
  flattenDoseRecords,
  formatDoseSummary,
  groupDoseRecordsByMedication,
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
