import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

// On-device SQLite database. Local-first: all data stays on the device (CLAUDE.md §1).
// The typed `schema` is wired into drizzle() in Phase 1a once the first table exists.
export const sqlite = openDatabaseSync('tummytracker.db', {
  enableChangeListener: true,
});

export const db = drizzle(sqlite);

export type DB = typeof db;
