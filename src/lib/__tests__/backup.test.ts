import type { LogEntry, MealComponent } from '@/db/schema';
import { entriesToJson, parseBackupJson } from '../backup';

const BASE_ENTRY: LogEntry = {
  id: 'abc123',
  type: 'meal',
  mealSlot: 'breakfast',
  name: 'Oatmeal',
  barcode: null,
  loggedAt: 1000,
  sentiment: 4,
  bristolScale: null,
  symptomType: null,
  severity: null,
  notes: 'tasty',
  ingredientsText: 'oats, water',
  tagsJson: '["oats","water"]',
  calories: 150,
  fatG: 3,
  saturatedFatG: null,
  carbsG: 25,
  proteinG: 5,
  fiberG: 2,
  sugarG: 1,
  sodiumMg: 50,
  servingG: 150,
  componentCount: null,
  createdAt: 1,
  updatedAt: 2,
};

const BASE_COMPONENT: MealComponent = {
  id: 'comp1',
  entryId: 'abc123',
  name: 'Peas',
  barcode: null,
  servings: 2,
  servingG: 80,
  calories: 50,
  fatG: 0.2,
  saturatedFatG: null,
  carbsG: 9,
  proteinG: 3,
  fiberG: 4,
  sugarG: 3,
  sodiumMg: 2,
  ingredientsText: 'peas',
  tagsJson: '["peas"]',
  sortOrder: 0,
  createdAt: 5,
};

describe('entriesToJson / parseBackupJson roundtrip', () => {
  it('roundtrips a single entry intact', () => {
    const json = entriesToJson([BASE_ENTRY]);
    const result = parseBackupJson(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toEqual(BASE_ENTRY);
    expect(result.mealComponents).toHaveLength(0);
  });

  it('roundtrips multiple entries', () => {
    const second: LogEntry = { ...BASE_ENTRY, id: 'def456', name: 'Soup' };
    const json = entriesToJson([BASE_ENTRY, second]);
    const result = parseBackupJson(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(2);
    expect(result.entries[1].name).toBe('Soup');
  });

  it('roundtrips an empty list', () => {
    const json = entriesToJson([]);
    const result = parseBackupJson(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(0);
    expect(result.mealComponents).toHaveLength(0);
  });

  it('roundtrips entries with their mealComponent rows intact', () => {
    const json = entriesToJson([BASE_ENTRY], [BASE_COMPONENT]);
    const result = parseBackupJson(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mealComponents).toHaveLength(1);
    expect(result.mealComponents[0]).toEqual(BASE_COMPONENT);
  });
});

describe('legacy v1 backup import (no mealComponents key)', () => {
  it('imports a v1-shaped file with an empty mealComponents array', () => {
    const legacy = { version: 1, entries: [BASE_ENTRY] };
    const result = parseBackupJson(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(1);
    expect(result.mealComponents).toEqual([]);
  });

  it('imports a bare entries array (pre-version format) with no components', () => {
    const result = parseBackupJson(JSON.stringify([BASE_ENTRY]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mealComponents).toEqual([]);
  });
});

describe('mealComponent validation', () => {
  it('rejects a mealComponent missing an id', () => {
    const bad = { ...BASE_COMPONENT, id: '' };
    const result = parseBackupJson(JSON.stringify({ version: 2, entries: [BASE_ENTRY], mealComponents: [bad] }));
    expect(result.ok).toBe(false);
  });

  it('rejects a mealComponent missing entryId', () => {
    const bad = { ...BASE_COMPONENT, entryId: undefined };
    const result = parseBackupJson(JSON.stringify({ version: 2, entries: [BASE_ENTRY], mealComponents: [bad] }));
    expect(result.ok).toBe(false);
  });

  it('defaults servings to 1 and sortOrder to 0 when absent', () => {
    const minimal = {
      id: 'c1',
      entryId: 'abc123',
      name: 'Rice',
      createdAt: 1,
    };
    const result = parseBackupJson(
      JSON.stringify({ version: 2, entries: [BASE_ENTRY], mealComponents: [minimal] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mealComponents[0].servings).toBe(1);
    expect(result.mealComponents[0].sortOrder).toBe(0);
    expect(result.mealComponents[0].barcode).toBeNull();
  });
});

describe('parseBackupJson error cases', () => {
  it('rejects invalid JSON', () => {
    const result = parseBackupJson('not json {{{');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/JSON/i);
  });

  it('rejects a file with no entries field and no array', () => {
    const result = parseBackupJson(JSON.stringify({ foo: 'bar' }));
    expect(result.ok).toBe(false);
  });

  it('rejects an entry missing the required id field', () => {
    const bad = { ...BASE_ENTRY, id: '' };
    const result = parseBackupJson(JSON.stringify({ version: 1, entries: [bad] }));
    expect(result.ok).toBe(false);
  });

  it('rejects an entry with an unknown type', () => {
    const bad = { ...BASE_ENTRY, type: 'pizza' };
    const result = parseBackupJson(JSON.stringify({ version: 1, entries: [bad] }));
    expect(result.ok).toBe(false);
  });

  it('rejects an entry with a non-numeric loggedAt', () => {
    const bad = { ...BASE_ENTRY, loggedAt: '2026-06-28' };
    const result = parseBackupJson(JSON.stringify({ version: 1, entries: [bad] }));
    expect(result.ok).toBe(false);
  });

  it('normalises absent optional fields to null', () => {
    const minimal = {
      id: 'min01',
      type: 'snack',
      name: 'Apple',
      loggedAt: 100,
      createdAt: 1,
      updatedAt: 1,
    };
    const result = parseBackupJson(JSON.stringify({ version: 1, entries: [minimal] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0].barcode).toBeNull();
    expect(result.entries[0].calories).toBeNull();
    expect(result.entries[0].servingG).toBeNull();
  });
});
