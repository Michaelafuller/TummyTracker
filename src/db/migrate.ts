import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import { db } from './client';
import migrations from './migrations/migrations';

/**
 * Runs any pending Drizzle migrations against the on-device SQLite database and
 * reports progress. Call once near the app root and gate DB-dependent UI on
 * `success` before reading/writing entries.
 */
export function useDatabaseMigrations() {
  return useMigrations(db, migrations);
}
