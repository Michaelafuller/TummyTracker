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
  buildSymptomEntries,
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
    symptomTypes: ['bloating'],
    severity: 2,
    notes: '',
    ...overrides,
  };
}

describe('buildSymptomEntries', () => {
  it('builds a single symptom entry with no food fields', () => {
    const result = buildSymptomEntries(baseState());
    expect(result.valid).toBe(true);
    expect(result.entries).toHaveLength(1);
    expect(result.entries?.[0]).toMatchObject({
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

  it('fans out one entry per selected type, sharing loggedAt/severity/notes', () => {
    const result = buildSymptomEntries(
      baseState({ symptomTypes: ['nausea', 'bloating'], notes: 'after lunch' }),
    );
    expect(result.valid).toBe(true);
    expect(result.entries).toHaveLength(2);

    const [first, second] = result.entries!;
    expect(first).toMatchObject({ type: 'symptom', name: 'Nausea', symptomType: 'nausea' });
    expect(second).toMatchObject({ type: 'symptom', name: 'Bloating', symptomType: 'bloating' });
    for (const entry of result.entries!) {
      expect(entry.type).toBe('symptom');
      expect(entry.mealSlot).toBeNull();
      expect(entry.barcode).toBeNull();
      expect(entry.loggedAt).toBe(new Date(2026, 5, 27, 8, 30).getTime());
      expect(entry.severity).toBe(2);
      expect(entry.notes).toBe('after lunch');
    }
  });

  it('allows an empty selection (optional) — exactly one generic "Symptom" entry', () => {
    const result = buildSymptomEntries(baseState({ symptomTypes: [], severity: null }));
    expect(result.valid).toBe(true);
    expect(result.entries).toHaveLength(1);
    expect(result.entries?.[0]).toMatchObject({ symptomType: null, severity: null, name: 'Symptom' });
  });

  it('preserves non-empty notes', () => {
    const result = buildSymptomEntries(baseState({ notes: 'after lunch' }));
    expect(result.valid).toBe(true);
    expect(result.entries?.[0].notes).toBe('after lunch');
  });

  it('reports invalid date and over-long notes, with no entries', () => {
    const invalidDate = buildSymptomEntries(baseState({ dateInput: '2026-02-30' }));
    expect(invalidDate.valid).toBe(false);
    expect(invalidDate.errors.loggedAt).toBeDefined();
    expect(invalidDate.entries).toBeUndefined();

    const longNotes = buildSymptomEntries(baseState({ notes: 'x'.repeat(501) }));
    expect(longNotes.valid).toBe(false);
    expect(longNotes.errors.notes).toBeDefined();
    expect(longNotes.entries).toBeUndefined();
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
      symptomTypes: ['bloating'],
      severity: 3,
      notes: 'after lunch',
      timeInput: '08:30',
    });
    const rebuilt = buildSymptomEntries(state);
    expect(rebuilt.entries).toHaveLength(1);
    expect(rebuilt.entries?.[0]).toMatchObject({
      symptomType: 'bloating',
      severity: 3,
      notes: 'after lunch',
    });
  });
});
