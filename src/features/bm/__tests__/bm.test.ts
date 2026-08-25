import type { LogEntry } from '@/db/schema';
import { BAD_BRISTOL_VALUES, BRISTOL_SCALE, BRISTOL_VALUES, bristolLabel, isBadBristol, isBristolValue } from '../bristol';
import { BM_ENTRY_NAME, bmEntryToFormState, buildBmEntry, type BmFormState } from '../formModel';

describe('bristol scale', () => {
  it('covers values 1..7 with labels', () => {
    expect(BRISTOL_SCALE.map((o) => o.value)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(BRISTOL_VALUES).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const v of BRISTOL_VALUES) {
      expect(bristolLabel(v).length).toBeGreaterThan(0);
    }
  });

  it('guards valid values', () => {
    expect(isBristolValue(1)).toBe(true);
    expect(isBristolValue(7)).toBe(true);
    expect(isBristolValue(0)).toBe(false);
    expect(isBristolValue(8)).toBe(false);
    expect(isBristolValue('4')).toBe(false);
  });
});

describe('BAD_BRISTOL_VALUES / isBadBristol', () => {
  it('marks hard (1, 2) and loose (6, 7) readings as bad', () => {
    expect(BAD_BRISTOL_VALUES).toEqual([1, 2, 6, 7]);
    expect(isBadBristol(1)).toBe(true);
    expect(isBadBristol(7)).toBe(true);
  });

  it('does not mark typical readings as bad', () => {
    expect(isBadBristol(3)).toBe(false);
    expect(isBadBristol(4)).toBe(false);
    expect(isBadBristol(5)).toBe(false);
  });

  it('guards null and non-numeric input', () => {
    expect(isBadBristol(null)).toBe(false);
    expect(isBadBristol('2')).toBe(false);
  });
});

function baseState(overrides: Partial<BmFormState> = {}): BmFormState {
  return {
    dateInput: '2026-06-27',
    timeInput: '07:45',
    bristol: 4,
    sentiment: 3,
    notes: '',
    ...overrides,
  };
}

describe('buildBmEntry', () => {
  it('builds a bowel_movement entry with the fixed name and no food fields', () => {
    const result = buildBmEntry(baseState());
    expect(result.valid).toBe(true);
    expect(result.entry).toMatchObject({
      type: 'bowel_movement',
      name: BM_ENTRY_NAME,
      mealSlot: null,
      barcode: null,
      bristolScale: 4,
      sentiment: 3,
      notes: null,
      loggedAt: new Date(2026, 5, 27, 7, 45).getTime(),
    });
  });

  it('allows null bristol and sentiment (optional)', () => {
    const result = buildBmEntry(baseState({ bristol: null, sentiment: null }));
    expect(result.valid).toBe(true);
    expect(result.entry?.bristolScale).toBeNull();
    expect(result.entry?.sentiment).toBeNull();
  });

  it('reports invalid date and over-long notes', () => {
    expect(buildBmEntry(baseState({ dateInput: '2026-02-30' })).errors.loggedAt).toBeDefined();
    expect(buildBmEntry(baseState({ notes: 'x'.repeat(501) })).errors.notes).toBeDefined();
  });

  it('round-trips through bmEntryToFormState', () => {
    const entry = {
      id: 'bm1',
      type: 'bowel_movement',
      mealSlot: null,
      name: BM_ENTRY_NAME,
      barcode: null,
      loggedAt: new Date(2026, 5, 27, 7, 45).getTime(),
      sentiment: 2,
      bristolScale: 6,
      symptomType: null,
      severity: null,
      notes: 'urgent',
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

    const state = bmEntryToFormState(entry);
    expect(state).toMatchObject({ bristol: 6, sentiment: 2, notes: 'urgent', timeInput: '07:45' });
    expect(buildBmEntry(state).entry).toMatchObject({ bristolScale: 6, sentiment: 2, notes: 'urgent' });
  });
});
