import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

// On-device SQLite database. Local-first: all data stays on the device (CLAUDE.md §1).
export const sqlite = openDatabaseSync('tummytracker.db', {
  enableChangeListener: true,
});

export const db = drizzle(sqlite, { schema });

export type DB = typeof db;
