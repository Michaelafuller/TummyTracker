import type { Medication, MedicationReminder } from '@/db/schema';
import {
  buildMedication,
  hasDefaultDoseAndUnit,
  medicationToFormState,
  newReminderDraft,
  type MedicationFormState,
} from '../formModel';

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
    reminders: [],
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

describe('reminders in the form model (GitHub #29)', () => {
  const row = (overrides: Partial<MedicationReminder> = {}): MedicationReminder => ({
    id: 'r1',
    medicationId: 'med1',
    hour: 7,
    minute: 5,
    daysMask: 31,
    enabled: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  });

  it('a new reminder draft is 08:00, every day, on', () => {
    expect(newReminderDraft('k')).toEqual({ key: 'k', hour: 8, minute: 0, daysMask: 127, enabled: true });
  });

  it('seeds the edit form from the saved reminder rows and builds them back without the key', () => {
    const seeded = medicationToFormState(baseMedication(), [row(), row({ id: 'r2', hour: 20, minute: 30, daysMask: 127, enabled: true })]);
    expect(seeded.reminders.map((r) => r.key)).toEqual(['r1', 'r2']);

    const built = buildMedication(seeded);
    expect(built.valid).toBe(true);
    expect(built.reminders).toEqual([
      { hour: 7, minute: 5, daysMask: 31, enabled: false },
      { hour: 20, minute: 30, daysMask: 127, enabled: true },
    ]);
  });

  it('medicationToFormState without reminders seeds none', () => {
    expect(medicationToFormState(baseMedication()).reminders).toEqual([]);
  });

  it('builds an empty reminder list when there are none (so a save clears the old rows)', () => {
    expect(buildMedication(baseState()).reminders).toEqual([]);
  });

  it('fails with a per-row error when a reminder has no weekday, and keeps medication errors too', () => {
    const state = baseState({
      name: '',
      reminders: [newReminderDraft('a'), { ...newReminderDraft('b'), daysMask: 0 }],
    });
    const result = buildMedication(state);
    expect(result.valid).toBe(false);
    expect(result.reminders).toBeUndefined();
    expect(result.errors.reminders).toEqual({ 1: 'Pick at least one day.' });
    expect(result.errors.name).toBeTruthy();
  });

  it('flags an out-of-range time on its row', () => {
    const result = buildMedication(baseState({ reminders: [{ ...newReminderDraft('a'), hour: 24 }] }));
    expect(result.valid).toBe(false);
    expect(result.errors.reminders).toEqual({ 0: 'Pick a valid time.' });
  });

  it('hasDefaultDoseAndUnit needs a positive dose and a unit', () => {
    expect(hasDefaultDoseAndUnit(baseState({ defaultDose: '10', unitChoice: 'mg' }))).toBe(true);
    expect(hasDefaultDoseAndUnit(baseState({ defaultDose: '10', unitChoice: 'other', otherUnitText: 'sachet' }))).toBe(true);
    expect(hasDefaultDoseAndUnit(baseState({ defaultDose: '', unitChoice: 'mg' }))).toBe(false);
    expect(hasDefaultDoseAndUnit(baseState({ defaultDose: '10', unitChoice: null }))).toBe(false);
    expect(hasDefaultDoseAndUnit(baseState({ defaultDose: '0', unitChoice: 'mg' }))).toBe(false);
    expect(hasDefaultDoseAndUnit(baseState({ defaultDose: 'abc', unitChoice: 'mg' }))).toBe(false);
    expect(hasDefaultDoseAndUnit(baseState({ defaultDose: '10', unitChoice: 'other', otherUnitText: ' ' }))).toBe(false);
  });
});
