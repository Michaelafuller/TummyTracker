import type { Medication, MedicationDose, MedicationEvent } from '@/db/schema';
import { formatDateInput, formatTimeInput } from '@/lib/datetime';
import {
  buildMedicationEntry,
  defaultEntryState,
  entryStateFromEvent,
  type MedicationEntryFormState,
} from '../medicationEntry';

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

function makeEvent(overrides: Partial<MedicationEvent> = {}): MedicationEvent {
  return {
    id: 'evt1',
    takenAt: 1_000,
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

describe('defaultEntryState', () => {
  const now = new Date(2026, 8, 26, 14, 30).getTime();

  it('sets date/time to now and timeKnown true', () => {
    const state = defaultEntryState([], now);
    expect(state.dateInput).toBe(formatDateInput(now));
    expect(state.timeInput).toBe(formatTimeInput(now));
    expect(state.timeKnown).toBe(true);
    expect(state.notes).toBe('');
  });

  it('creates one unselected line per active medication, in the given order', () => {
    const meds = [
      makeMedication({ id: 'med1', name: 'A' }),
      makeMedication({ id: 'med2', name: 'B' }),
    ];
    const state = defaultEntryState(meds, now);

    expect(state.lines.map((l) => l.medicationId)).toEqual(['med1', 'med2']);
    expect(state.lines.every((l) => l.selected === false)).toBe(true);
  });

  it('pre-fills each line with the medication\'s own default dose/unit', () => {
    const meds = [makeMedication({ id: 'med1', defaultDose: 10, doseUnit: 'mg' })];
    const state = defaultEntryState(meds, now);

    expect(state.lines[0]).toEqual({
      medicationId: 'med1',
      selected: false,
      doseInput: '10',
      doseUnit: 'mg',
    });
  });

  it('leaves dose/unit blank when the medication has no default', () => {
    const meds = [makeMedication({ id: 'med1', defaultDose: null, doseUnit: null })];
    const state = defaultEntryState(meds, now);

    expect(state.lines[0].doseInput).toBe('');
    expect(state.lines[0].doseUnit).toBe('');
  });

  it('formats a fractional default dose without trailing zeros', () => {
    const meds = [makeMedication({ id: 'med1', defaultDose: 0.5, doseUnit: 'tablet' })];
    const state = defaultEntryState(meds, now);
    expect(state.lines[0].doseInput).toBe('0.5');
  });
});

describe('entryStateFromEvent', () => {
  it('includes a selected line for every medication in the event, including an inactive one', () => {
    const event = makeEvent({ takenAt: 1_000, timeKnown: true, notes: 'with food' });
    const doses = [makeDose({ medicationId: 'med1', dose: 20, doseUnit: 'mg' })];
    const meds = [makeMedication({ id: 'med1', isActive: false, name: 'Old Med' })];

    const state = entryStateFromEvent(event, doses, meds);

    expect(state.lines).toEqual([
      { medicationId: 'med1', selected: true, doseInput: '20', doseUnit: 'mg' },
    ]);
    expect(state.notes).toBe('with food');
    expect(state.timeKnown).toBe(true);
  });

  it('appends the other active medications, unselected', () => {
    const event = makeEvent();
    const doses = [makeDose({ medicationId: 'med1' })];
    const meds = [
      makeMedication({ id: 'med1', name: 'Logged' }),
      makeMedication({ id: 'med2', name: 'Also active', defaultDose: 5, doseUnit: 'mL' }),
      makeMedication({ id: 'med3', name: 'Inactive, not logged', isActive: false }),
    ];

    const state = entryStateFromEvent(event, doses, meds);

    expect(state.lines.map((l) => l.medicationId)).toEqual(['med1', 'med2']);
    expect(state.lines[1]).toEqual({ medicationId: 'med2', selected: false, doseInput: '5', doseUnit: 'mL' });
  });

  it('sets timeKnown false and empty notes from the event', () => {
    const event = makeEvent({ timeKnown: false, notes: null });
    const state = entryStateFromEvent(event, [], []);
    expect(state.timeKnown).toBe(false);
    expect(state.notes).toBe('');
  });
});

function baseState(overrides: Partial<MedicationEntryFormState> = {}): MedicationEntryFormState {
  return {
    dateInput: '2026-09-26',
    timeInput: '14:30',
    timeKnown: true,
    lines: [{ medicationId: 'med1', selected: true, doseInput: '10', doseUnit: 'mg' }],
    notes: '',
    ...overrides,
  };
}

describe('buildMedicationEntry', () => {
  it('builds a valid event + doses payload', () => {
    const result = buildMedicationEntry(baseState());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.event).toEqual({
      takenAt: new Date(2026, 8, 26, 14, 30).getTime(),
      timeKnown: true,
      notes: null,
    });
    expect(result.doses).toEqual([{ medicationId: 'med1', dose: 10, doseUnit: 'mg' }]);
  });

  it('rejects when no line is selected', () => {
    const result = buildMedicationEntry(baseState({ lines: [{ medicationId: 'med1', selected: false, doseInput: '10', doseUnit: 'mg' }] }));
    expect(result.valid).toBe(false);
    expect(result.errors.lines).toBeTruthy();
  });

  it('accepts a partial dose like 0.5', () => {
    const result = buildMedicationEntry(
      baseState({ lines: [{ medicationId: 'med1', selected: true, doseInput: '0.5', doseUnit: 'tablet' }] }),
    );
    expect(result.valid).toBe(true);
    expect(result.doses).toEqual([{ medicationId: 'med1', dose: 0.5, doseUnit: 'tablet' }]);
  });

  it('rejects a selected line with a dose of 0', () => {
    const result = buildMedicationEntry(
      baseState({ lines: [{ medicationId: 'med1', selected: true, doseInput: '0', doseUnit: 'mg' }] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.doseErrors?.med1).toBeTruthy();
  });

  it('rejects a selected line with a non-numeric dose', () => {
    const result = buildMedicationEntry(
      baseState({ lines: [{ medicationId: 'med1', selected: true, doseInput: 'abc', doseUnit: 'mg' }] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.doseErrors?.med1).toBeTruthy();
  });

  it('rejects a selected line with an empty dose', () => {
    const result = buildMedicationEntry(
      baseState({ lines: [{ medicationId: 'med1', selected: true, doseInput: '', doseUnit: 'mg' }] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.doseErrors?.med1).toBeTruthy();
  });

  it('rejects a selected line with a valid dose but missing unit', () => {
    const result = buildMedicationEntry(
      baseState({ lines: [{ medicationId: 'med1', selected: true, doseInput: '10', doseUnit: '' }] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.doseErrors?.med1).toBeTruthy();
  });

  it('ignores dose/unit problems on an unselected line', () => {
    const result = buildMedicationEntry(
      baseState({
        lines: [
          { medicationId: 'med1', selected: true, doseInput: '10', doseUnit: 'mg' },
          { medicationId: 'med2', selected: false, doseInput: 'garbage', doseUnit: '' },
        ],
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.doses).toEqual([{ medicationId: 'med1', dose: 10, doseUnit: 'mg' }]);
  });

  it('reports every failing selected line at once', () => {
    const result = buildMedicationEntry(
      baseState({
        lines: [
          { medicationId: 'med1', selected: true, doseInput: '', doseUnit: 'mg' },
          { medicationId: 'med2', selected: true, doseInput: '10', doseUnit: '' },
        ],
      }),
    );
    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors.doseErrors ?? {}).sort()).toEqual(['med1', 'med2']);
  });

  it('rejects an invalid date', () => {
    const result = buildMedicationEntry(baseState({ dateInput: 'not-a-date' }));
    expect(result.valid).toBe(false);
    expect(result.errors.loggedAt).toBeTruthy();
  });

  it('rejects notes over the 500-char cap', () => {
    const result = buildMedicationEntry(baseState({ notes: 'a'.repeat(501) }));
    expect(result.valid).toBe(false);
    expect(result.errors.notes).toBeTruthy();
  });

  it('takenAt lands on local noon when timeKnown is false, ignoring timeInput', () => {
    const result = buildMedicationEntry(baseState({ timeKnown: false, timeInput: '23:59' }));
    expect(result.valid).toBe(true);
    expect(result.event?.takenAt).toBe(new Date(2026, 8, 26, 12, 0).getTime());
    expect(result.event?.timeKnown).toBe(false);
  });

  it('trims notes and maps empty notes to null', () => {
    expect(buildMedicationEntry(baseState({ notes: '  with food  ' })).event?.notes).toBe('with food');
    expect(buildMedicationEntry(baseState({ notes: '   ' })).event?.notes).toBeNull();
  });

  it('does not mutate the medication objects used to build the initial state', () => {
    const meds = [makeMedication({ id: 'med1', defaultDose: 10, doseUnit: 'mg' })];
    const before = JSON.parse(JSON.stringify(meds));

    const state = defaultEntryState(meds, 1_000);
    const selectedState: MedicationEntryFormState = {
      ...state,
      lines: state.lines.map((line) => ({ ...line, selected: true, doseInput: '5' })),
    };
    buildMedicationEntry(selectedState);

    expect(meds).toEqual(before);
  });

  it('a dose override (half the default) never alters the input medication objects', () => {
    const meds = [makeMedication({ id: 'med1', defaultDose: 10, doseUnit: 'mg' })];
    const before = JSON.parse(JSON.stringify(meds));

    const state = defaultEntryState(meds, 1_000);
    const overridden: MedicationEntryFormState = {
      ...state,
      lines: [{ ...state.lines[0], selected: true, doseInput: '5' }],
    };
    const result = buildMedicationEntry(overridden);

    expect(result.doses).toEqual([{ medicationId: 'med1', dose: 5, doseUnit: 'mg' }]);
    expect(meds).toEqual(before);
  });
});
