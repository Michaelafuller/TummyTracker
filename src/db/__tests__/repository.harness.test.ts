// Harness sanity (docs/HANDOFF.md §3): proves the fake expo-sqlite + real
// migrations + real schema combination actually works before any repository
// test relies on it.
import { sql } from 'drizzle-orm';

import { db } from '../client';
import { closeTestDb, migrateTestDb } from '../testUtils/testDb';

// Jest hoists jest.mock(...) above the imports above at transform time
// (babel-plugin-jest-hoist), so '../client's `openDatabaseSync` call already
// sees the fake.
jest.mock('expo-sqlite', () => require('../../../jest/expo-sqlite-node'));

afterAll(closeTestDb);

// Table names as declared in schema.ts's sqliteTable(...) calls — kept in
// sync with that file, not derived from it, so this test independently
// verifies the real .sql migrations actually create what schema.ts expects.
const EXPECTED_TABLES = [
  'log_entry',
  'meal_component',
  'watchlist_item',
  'goal',
  'medication',
  'medication_event',
  'medication_dose',
  'day_check_in',
];

describe('repository test harness', () => {
  it('applies every migration to an empty database without throwing', async () => {
    await expect(migrateTestDb()).resolves.toBeUndefined();
  });

  it('creates every table declared in schema.ts', async () => {
    await migrateTestDb();

    const rows = await db.all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table'`);
    const tableNames = new Set(rows.map((row) => row.name));

    for (const table of EXPECTED_TABLES) {
      expect(tableNames.has(table)).toBe(true);
    }
  });
});
