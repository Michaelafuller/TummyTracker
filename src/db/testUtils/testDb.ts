// Shared helper for repository tests — NOT a Jest test file itself.
//
// Deviation from docs/HANDOFF.md §1 (noted per the execute-session
// instructions): the spec suggested `src/db/__tests__/testDb.ts`, but Jest's
// default `testMatch` (jest-expo/@react-native/jest-preset set neither
// `testMatch` nor `testRegex`, so Jest's own default applies) is
// `**/__tests__/**/*.[jt]s?(x)` — ANY file inside a `__tests__` directory,
// regardless of name, is collected as a test suite. Verified empirically
// (`npx jest --listTests` picked up a no-op probe file dropped in
// `src/db/__tests__/`). A helper with no `it(...)` in that directory fails
// Jest with "must contain at least one test." Living beside `client.ts`
// under `src/db/testUtils/` keeps it colocated without tripping that.
//
// Each repository test file mocks `expo-sqlite` with `jest/expo-sqlite-node`
// (see that file's header) BEFORE importing anything here — Jest hoists
// `jest.mock(...)`, so this module's own `import { db } from '../client'`
// picks up the fake. Every test file gets its own in-memory database: Jest
// isolates the module registry per test file, so `../client`'s
// module-scoped `openDatabaseSync(...)` call runs fresh each time.
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import { db, sqlite } from '../client';
import migrations from '../migrations/migrations';
import {
  dayCheckIn,
  goal,
  logEntry,
  mealComponent,
  medication,
  medicationDose,
  medicationEvent,
  watchlistItem,
} from '../schema';

/** Applies every Drizzle migration (the real, generated SQL) to the fresh in-memory test database. */
export async function migrateTestDb(): Promise<void> {
  await migrate(db, migrations);
}

// Every app table declared in schema.ts — keep this list in sync when a table
// is added. Deliberately excludes `__drizzle_migrations` (drizzle's own
// bookkeeping table): clearing it would make a later `migrateTestDb()` call
// replay migrations that already ran against this database.
const APP_TABLES = [
  logEntry,
  mealComponent,
  watchlistItem,
  goal,
  medication,
  medicationEvent,
  medicationDose,
  dayCheckIn,
];

/** Deletes every row from every app table. Call in `beforeEach` for a clean slate within one file's shared in-memory DB. */
export async function resetTestDb(): Promise<void> {
  for (const table of APP_TABLES) {
    await db.delete(table);
  }
}

/**
 * Closes the in-memory node:sqlite database backing this test file. Call in
 * `afterAll` — without it Jest warns that a worker process failed to exit
 * gracefully (node:sqlite's native handle keeps the process referenced).
 */
export function closeTestDb(): void {
  sqlite.closeSync();
}
