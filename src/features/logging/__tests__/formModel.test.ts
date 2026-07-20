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
    servingG: '',
    nutritionBase: null,
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

  it('nulls out empty notes and rejects notes over 500 chars', () => {
    expect(buildLogEntry(baseState({ notes: '   ' })).entry?.notes).toBeNull();
    expect(buildLogEntry(baseState({ notes: 'x'.repeat(501) })).errors.notes).toBeDefined();
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

  it('parses a valid servingG and persists it', () => {
    const result = buildLogEntry(baseState({ servingG: '150' }));
    expect(result.valid).toBe(true);
    expect(result.entry?.servingG).toBe(150);
  });

  it('sets servingG to null when the field is empty or zero', () => {
    expect(buildLogEntry(baseState({ servingG: '' })).entry?.servingG).toBeNull();
    expect(buildLogEntry(baseState({ servingG: '0' })).entry?.servingG).toBeNull();
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
    symptomType: null,
    severity: null,
    notes: 'a handful',
    calories: 160,
    fatG: 14,
    saturatedFatG: null,
    carbsG: 6,
    proteinG: 6,
    fiberG: 3,
    sugarG: 1,
    sodiumMg: 0,
    servingG: 40,
    ingredientsText: 'oats, water',
    tagsJson: '["oats","water"]',
    componentCount: null,
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

  it('hydrates servingG from the persisted entry', () => {
    const state = logEntryToFormState(entry);
    expect(state.servingG).toBe('40');
  });

  it('sets servingG to empty string when null in the persisted entry', () => {
    const state = logEntryToFormState({ ...entry, servingG: null });
    expect(state.servingG).toBe('');
  });
});

describe('buildLogEntry — ingredient tags', () => {
  it('keeps pre-computed OFF tags when the ingredient text is unchanged (no new tags to add)', () => {
    const result = buildLogEntry(
      baseState({ ingredientsText: 'wheat flour', tagsJson: '["gluten","wheat flour"]' }),
    );
    expect(result.valid).toBe(true);
    expect(result.entry?.tagsJson).toBe('["gluten","wheat flour"]');
  });

  it('merges new tags tokenized from user-edited ingredient text into the existing OFF tags', () => {
    const result = buildLogEntry(
      baseState({ ingredientsText: 'wheat flour, hot sauce', tagsJson: '["gluten","wheat flour"]' }),
    );
    expect(result.valid).toBe(true);
    const tags = JSON.parse(result.entry?.tagsJson ?? '[]') as string[];
    // Existing (OFF) tags keep their lead position; the newly-typed ingredient
    // becomes a tag instead of being silently dropped.
    expect(tags).toEqual(['gluten', 'wheat flour', 'hot sauce']);
  });

  it('tokenizes ingredientsText when tagsJson is empty', () => {
    const result = buildLogEntry(baseState({ ingredientsText: 'oats, honey', tagsJson: '' }));
    expect(result.valid).toBe(true);
    const tags = JSON.parse(result.entry?.tagsJson ?? '[]') as string[];
    expect(tags).toContain('oats');
    expect(tags).toContain('honey');
  });

  it('keeps existing tags unchanged when the ingredient text is blank (OFF-only path)', () => {
    const result = buildLogEntry(baseState({ ingredientsText: '', tagsJson: '["gluten","wheat flour"]' }));
    expect(result.valid).toBe(true);
    expect(result.entry?.tagsJson).toBe('["gluten","wheat flour"]');
  });

  it('sets ingredientsText and tagsJson to null when both are empty', () => {
    const result = buildLogEntry(baseState({ ingredientsText: '', tagsJson: '' }));
    expect(result.valid).toBe(true);
    expect(result.entry?.ingredientsText).toBeNull();
    expect(result.entry?.tagsJson).toBeNull();
  });
});
