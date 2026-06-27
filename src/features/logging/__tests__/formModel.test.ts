import {
  buildLogEntry,
  emptyNutritionInputs,
  type LogEntryFormState,
} from '../formModel';

function baseState(overrides: Partial<LogEntryFormState> = {}): LogEntryFormState {
  return {
    type: 'meal',
    name: 'Oatmeal',
    mealSlot: 'breakfast',
    dateInput: '2026-06-27',
    timeInput: '08:30',
    sentiment: 4,
    notes: 'tasty',
    nutrition: emptyNutritionInputs(),
    barcode: null,
    ...overrides,
  };
}

describe('buildLogEntry', () => {
  it('builds a valid entry from good input', () => {
    const result = buildLogEntry(baseState({ nutrition: { ...emptyNutritionInputs(), calories: '150', fatG: '3' } }));
    expect(result.valid).toBe(true);
    expect(result.entry).toMatchObject({
      type: 'meal',
      name: 'Oatmeal',
      mealSlot: 'breakfast',
      sentiment: 4,
      notes: 'tasty',
      calories: 150,
      fatG: 3,
      carbsG: null,
    });
    expect(result.entry?.loggedAt).toBe(new Date(2026, 5, 27, 8, 30).getTime());
  });

  it('trims the name and rejects an empty one', () => {
    expect(buildLogEntry(baseState({ name: '   ' })).errors.name).toBeDefined();
    const ok = buildLogEntry(baseState({ name: '  Soup  ' }));
    expect(ok.entry?.name).toBe('Soup');
  });

  it('nulls out empty notes and rejects notes over 200 chars', () => {
    expect(buildLogEntry(baseState({ notes: '   ' })).entry?.notes).toBeNull();
    expect(buildLogEntry(baseState({ notes: 'x'.repeat(201) })).errors.notes).toBeDefined();
  });

  it('reports an invalid date/time', () => {
    const result = buildLogEntry(baseState({ dateInput: '2026-02-30' }));
    expect(result.valid).toBe(false);
    expect(result.errors.loggedAt).toBeDefined();
  });

  it('reports per-field nutrition errors (non-numeric, negative)', () => {
    const result = buildLogEntry(
      baseState({ nutrition: { ...emptyNutritionInputs(), calories: 'abc', fatG: '-2' } }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.nutrition.calories).toBeDefined();
    expect(result.errors.nutrition.fatG).toBeDefined();
  });

  it('allows a null sentiment (rate later) and a barcode passthrough', () => {
    const result = buildLogEntry(baseState({ sentiment: null, barcode: '0123456789012' }));
    expect(result.valid).toBe(true);
    expect(result.entry?.sentiment).toBeNull();
    expect(result.entry?.barcode).toBe('0123456789012');
  });
});
