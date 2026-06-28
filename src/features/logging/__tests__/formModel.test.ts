import type { LogEntry } from '@/db/schema';
import {
  buildLogEntry,
  emptyNutritionInputs,
  type LogEntryFormState,
  logEntryToFormState,
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
    ingredientsText: '',
    tagsJson: '',
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

describe('logEntryToFormState (edit round-trip)', () => {
  const entry: LogEntry = {
    id: 'abc',
    type: 'snack',
    mealSlot: null,
    name: 'Almonds',
    barcode: '0123456789012',
    loggedAt: new Date(2026, 5, 27, 15, 5).getTime(),
    sentiment: 3,
    bristolScale: null,
    notes: 'a handful',
    calories: 160,
    fatG: 14,
    saturatedFatG: null,
    carbsG: 6,
    proteinG: 6,
    fiberG: 3,
    sugarG: 1,
    sodiumMg: 0,
    ingredientsText: 'oats, water',
    tagsJson: '["oats","water"]',
    createdAt: 1,
    updatedAt: 2,
  };

  it('hydrates form state and rebuilds to the same persisted values', () => {
    const state = logEntryToFormState(entry);
    expect(state.dateInput).toBe('2026-06-27');
    expect(state.timeInput).toBe('15:05');
    expect(state.nutrition.calories).toBe('160');
    expect(state.sentiment).toBe(3);

    const rebuilt = buildLogEntry(state);
    expect(rebuilt.valid).toBe(true);
    expect(rebuilt.entry).toMatchObject({
      type: 'snack',
      name: 'Almonds',
      barcode: '0123456789012',
      loggedAt: entry.loggedAt,
      sentiment: 3,
      notes: 'a handful',
      calories: 160,
      sodiumMg: 0,
    });
  });

  it('hydrates ingredientsText and tagsJson from the persisted entry', () => {
    const state = logEntryToFormState(entry);
    expect(state.ingredientsText).toBe('oats, water');
    expect(state.tagsJson).toBe('["oats","water"]');
  });

  it('coerces an out-of-range stored sentiment to null', () => {
    const state = logEntryToFormState({ ...entry, sentiment: 9 });
    expect(state.sentiment).toBeNull();
  });
});

describe('buildLogEntry — ingredient tags', () => {
  it('carries pre-computed OFF tagsJson through without re-tokenizing', () => {
    const result = buildLogEntry(
      baseState({ ingredientsText: 'wheat flour', tagsJson: '["gluten","wheat flour"]' }),
    );
    expect(result.valid).toBe(true);
    expect(result.entry?.tagsJson).toBe('["gluten","wheat flour"]');
  });

  it('tokenizes ingredientsText when tagsJson is empty', () => {
    const result = buildLogEntry(baseState({ ingredientsText: 'oats, honey', tagsJson: '' }));
    expect(result.valid).toBe(true);
    const tags = JSON.parse(result.entry?.tagsJson ?? '[]') as string[];
    expect(tags).toContain('oats');
    expect(tags).toContain('honey');
  });

  it('sets ingredientsText and tagsJson to null when both are empty', () => {
    const result = buildLogEntry(baseState({ ingredientsText: '', tagsJson: '' }));
    expect(result.valid).toBe(true);
    expect(result.entry?.ingredientsText).toBeNull();
    expect(result.entry?.tagsJson).toBeNull();
  });
});
