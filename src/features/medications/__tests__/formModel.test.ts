import type { Medication } from '@/db/schema';
import { buildMedication, medicationToFormState, type MedicationFormState } from '../formModel';

function baseState(overrides: Partial<MedicationFormState> = {}): MedicationFormState {
  return {
    name: 'Omeprazole',
    defaultDose: '',
    unitChoice: null,
    otherUnitText: '',
    frequency: '',
    startDateInput: '',
    endDateInput: '',
    notes: '',
    isRegular: false,
    ...overrides,
  };
}

describe('buildMedication', () => {
  it('builds a medication from just a name', () => {
    const result = buildMedication(baseState());
    expect(result.valid).toBe(true);
    expect(result.medication).toEqual({
      name: 'Omeprazole',
      defaultDose: null,
      doseUnit: null,
      frequency: null,
      startDate: null,
      endDate: null,
      notes: null,
      isRegular: false,
    });
  });

  it('trims the name', () => {
    const result = buildMedication(baseState({ name: '  Omeprazole  ' }));
    expect(result.medication?.name).toBe('Omeprazole');
  });

  it('parses a dose + a fixed unit chip', () => {
    const result = buildMedication(baseState({ defaultDose: '10', unitChoice: 'mg' }));
    expect(result.valid).toBe(true);
    expect(result.medication?.defaultDose).toBe(10);
    expect(result.medication?.doseUnit).toBe('mg');
  });

  it('parses a dose + the "Other" unit, using the trimmed free-text value', () => {
    const result = buildMedication(
      baseState({ defaultDose: '1', unitChoice: 'other', otherUnitText: '  sachet  ' }),
    );
    expect(result.valid).toBe(true);
    expect(result.medication?.doseUnit).toBe('sachet');
  });

  it('fails validation when "Other" is chosen but left blank, given a dose', () => {
    const result = buildMedication(baseState({ defaultDose: '1', unitChoice: 'other', otherUnitText: '  ' }));
    expect(result.valid).toBe(false);
    expect(result.errors.doseUnit).toBeTruthy();
  });

  it('treats a blank frequency as absent', () => {
    const result = buildMedication(baseState({ frequency: '   ' }));
    expect(result.medication?.frequency).toBeNull();
  });

  it('keeps a non-blank frequency, trimmed', () => {
    const result = buildMedication(baseState({ frequency: '  twice daily  ' }));
    expect(result.medication?.frequency).toBe('twice daily');
  });

  it('parses start/end dates as local-midnight epoch ms', () => {
    const result = buildMedication(
      baseState({ startDateInput: '2026-01-01', endDateInput: '2026-06-01' }),
    );
    expect(result.valid).toBe(true);
    expect(new Date(result.medication!.startDate!).getHours()).toBe(0);
    expect(new Date(result.medication!.startDate!).getDate()).toBe(1);
    expect(result.medication!.endDate!).toBeGreaterThan(result.medication!.startDate!);
  });

  it('rejects an end date before the start date', () => {
    const result = buildMedication(
      baseState({ startDateInput: '2026-06-01', endDateInput: '2026-01-01' }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.endDate).toBeTruthy();
  });

  it('rejects an empty name', () => {
    const result = buildMedication(baseState({ name: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeTruthy();
  });

  it('rejects notes over the 500-char cap', () => {
    const result = buildMedication(baseState({ notes: 'a'.repeat(501) }));
    expect(result.valid).toBe(false);
    expect(result.errors.notes).toBeTruthy();
  });

  it('trims notes and treats a blank value as null', () => {
    expect(buildMedication(baseState({ notes: '  take with food  ' })).medication?.notes).toBe(
      'take with food',
    );
    expect(buildMedication(baseState({ notes: '   ' })).medication?.notes).toBeNull();
  });
});

function baseMedication(overrides: Partial<Medication> = {}): Medication {
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

describe('medicationToFormState', () => {
  it('maps a fixed-unit medication to its chip choice', () => {
    const state = medicationToFormState(
      baseMedication({ defaultDose: 10, doseUnit: 'mg', frequency: 'twice daily' }),
    );
    expect(state.unitChoice).toBe('mg');
    expect(state.defaultDose).toBe('10');
    expect(state.otherUnitText).toBe('');
    expect(state.frequency).toBe('twice daily');
  });

  it('maps a custom (non-DOSE_UNITS) unit to the "other" chip, with the text preserved', () => {
    const state = medicationToFormState(baseMedication({ defaultDose: 1, doseUnit: 'sachet' }));
    expect(state.unitChoice).toBe('other');
    expect(state.otherUnitText).toBe('sachet');
  });

  it('maps a medication with no unit at all to unitChoice null', () => {
    const state = medicationToFormState(baseMedication());
    expect(state.unitChoice).toBeNull();
    expect(state.defaultDose).toBe('');
  });

  it('formats start/end dates back to YYYY-MM-DD, and leaves them "" when unset', () => {
    const withDates = medicationToFormState(
      baseMedication({ startDate: new Date(2026, 0, 1).getTime(), endDate: null }),
    );
    expect(withDates.startDateInput).toBe('2026-01-01');
    expect(withDates.endDateInput).toBe('');
  });

  it('round-trips through buildMedication for an edit with no changes', () => {
    const med = baseMedication({ defaultDose: 0.5, doseUnit: 'tablet', frequency: 'as needed', notes: 'with food' });
    const state = medicationToFormState(med);
    const result = buildMedication(state);
    expect(result.valid).toBe(true);
    expect(result.medication).toEqual({
      name: 'Omeprazole',
      defaultDose: 0.5,
      doseUnit: 'tablet',
      frequency: 'as needed',
      startDate: null,
      endDate: null,
      notes: 'with food',
      isRegular: false,
    });
  });

  it('carries isRegular through build and the edit-form seed (GitHub #26)', () => {
    const built = buildMedication(baseState({ defaultDose: '50', unitChoice: 'mcg', isRegular: true }));
    expect(built.valid).toBe(true);
    expect(built.medication?.isRegular).toBe(true);

    const seeded = medicationToFormState(baseMedication({ defaultDose: 50, doseUnit: 'mcg', isRegular: true }));
    expect(seeded.isRegular).toBe(true);
    expect(medicationToFormState(baseMedication()).isRegular).toBe(false);
  });

  it('rejects a regular medication with no default dose, on the dose field', () => {
    const result = buildMedication(baseState({ isRegular: true }));
    expect(result.valid).toBe(false);
    expect(result.errors.defaultDose).toBe('A regular medication needs a default dose and unit.');
  });

  it('rejects a regular medication with a dose but no unit, on the unit field', () => {
    const result = buildMedication(baseState({ isRegular: true, defaultDose: '5' }));
    expect(result.valid).toBe(false);
    expect(result.errors.doseUnit).toBeTruthy();
  });
});
