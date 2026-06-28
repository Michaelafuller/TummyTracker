import type { LogEntry } from '@/db/schema';
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
  createdAt: 1,
  updatedAt: 2,
};

describe('entriesToJson / parseBackupJson roundtrip', () => {
  it('roundtrips a single entry intact', () => {
    const json = entriesToJson([BASE_ENTRY]);
    const result = parseBackupJson(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toEqual(BASE_ENTRY);
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
