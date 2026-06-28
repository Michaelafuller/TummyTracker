import type { LogEntry } from '@/db/schema';
import {
  SEVERITY_SCALE,
  SEVERITY_VALUES,
  isSeverityValue,
  severityLabel,
} from '../severity';
import {
  SYMPTOM_TYPES,
  SYMPTOM_TYPE_VALUES,
  isSymptomTypeValue,
  symptomTypeLabel,
} from '../symptomTypes';
import {
  buildSymptomEntry,
  symptomEntryName,
  symptomEntryToFormState,
  type SymptomFormState,
} from '../formModel';

describe('severity scale', () => {
  it('covers values 1..5 with labels', () => {
    expect(SEVERITY_SCALE.map((o) => o.value)).toEqual([1, 2, 3, 4, 5]);
    expect(SEVERITY_VALUES).toEqual([1, 2, 3, 4, 5]);
    for (const v of SEVERITY_VALUES) {
      expect(severityLabel(v).length).toBeGreaterThan(0);
    }
  });

  it('guards valid values', () => {
    expect(isSeverityValue(1)).toBe(true);
    expect(isSeverityValue(5)).toBe(true);
    expect(isSeverityValue(0)).toBe(false);
    expect(isSeverityValue(6)).toBe(false);
    expect(isSeverityValue('3')).toBe(false);
  });
});

describe('symptom types', () => {
  it('has 9 options with labels', () => {
    expect(SYMPTOM_TYPES).toHaveLength(9);
    expect(SYMPTOM_TYPE_VALUES).toHaveLength(9);
    for (const option of SYMPTOM_TYPES) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(isSymptomTypeValue(option.value)).toBe(true);
    }
  });

  it('guards valid values', () => {
    expect(isSymptomTypeValue('bloating')).toBe(true);
    expect(isSymptomTypeValue('fatigue')).toBe(true);
    expect(isSymptomTypeValue('headache')).toBe(false);
    expect(isSymptomTypeValue('')).toBe(false);
    expect(isSymptomTypeValue(null)).toBe(false);
  });

  it('has a label accessor for each value', () => {
    expect(symptomTypeLabel('bloating')).toBe('Bloating');
    expect(symptomTypeLabel('nausea')).toBe('Nausea');
    expect(symptomTypeLabel('upset_stomach')).toBe('Upset stomach');
  });
});

describe('symptomEntryName', () => {
  it('returns the label when a type is provided', () => {
    expect(symptomEntryName('cramps')).toBe('Cramps');
  });

  it('falls back to "Symptom" when type is null', () => {
    expect(symptomEntryName(null)).toBe('Symptom');
  });
});

function baseState(overrides: Partial<SymptomFormState> = {}): SymptomFormState {
  return {
    dateInput: '2026-06-27',
    timeInput: '08:30',
    symptomType: 'bloating',
    severity: 2,
    notes: '',
    ...overrides,
  };
}

describe('buildSymptomEntry', () => {
  it('builds a symptom entry with no food fields', () => {
    const result = buildSymptomEntry(baseState());
    expect(result.valid).toBe(true);
    expect(result.entry).toMatchObject({
      type: 'symptom',
      name: 'Bloating',
      mealSlot: null,
      barcode: null,
      symptomType: 'bloating',
      severity: 2,
      notes: null,
      loggedAt: new Date(2026, 5, 27, 8, 30).getTime(),
    });
  });

  it('allows null symptom type and severity (optional)', () => {
    const result = buildSymptomEntry(baseState({ symptomType: null, severity: null }));
    expect(result.valid).toBe(true);
    expect(result.entry?.symptomType).toBeNull();
    expect(result.entry?.severity).toBeNull();
    expect(result.entry?.name).toBe('Symptom');
  });

  it('preserves non-empty notes', () => {
    const result = buildSymptomEntry(baseState({ notes: 'after lunch' }));
    expect(result.valid).toBe(true);
    expect(result.entry?.notes).toBe('after lunch');
  });

  it('reports invalid date and over-long notes', () => {
    expect(buildSymptomEntry(baseState({ dateInput: '2026-02-30' })).errors.loggedAt).toBeDefined();
    expect(buildSymptomEntry(baseState({ notes: 'x'.repeat(201) })).errors.notes).toBeDefined();
  });

  it('round-trips through symptomEntryToFormState', () => {
    const entry = {
      id: 'sym1',
      type: 'symptom',
      mealSlot: null,
      name: 'Bloating',
      barcode: null,
      loggedAt: new Date(2026, 5, 27, 8, 30).getTime(),
      sentiment: null,
      bristolScale: null,
      symptomType: 'bloating',
      severity: 3,
      notes: 'after lunch',
      calories: null,
      fatG: null,
      saturatedFatG: null,
      carbsG: null,
      proteinG: null,
      fiberG: null,
      sugarG: null,
      sodiumMg: null,
      ingredientsText: null,
      tagsJson: null,
      createdAt: 1,
      updatedAt: 2,
    } as LogEntry;

    const state = symptomEntryToFormState(entry);
    expect(state).toMatchObject({
      symptomType: 'bloating',
      severity: 3,
      notes: 'after lunch',
      timeInput: '08:30',
    });
    expect(buildSymptomEntry(state).entry).toMatchObject({
      symptomType: 'bloating',
      severity: 3,
      notes: 'after lunch',
    });
  });
});
