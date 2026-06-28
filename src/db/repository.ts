// Thin repository over Drizzle for log entries. Keeps DB access in one place so
// screens/components stay free of query details. Pure validation/shaping lives in
// lib/ and features/logging/formModel; this module just persists.
import { desc, eq, inArray } from 'drizzle-orm';

import { createId } from '@/lib/id';
import { db } from './client';
import { FOOD_TYPES, logEntry, type LogEntry, type NewLogEntry } from './schema';

/** Fields a caller supplies on create — id and timestamps are filled in here. */
export type CreateLogEntryInput = Omit<NewLogEntry, 'id' | 'createdAt' | 'updatedAt'>;

/** Fields a caller may patch. id/createdAt are immutable; updatedAt is managed here. */
export type UpdateLogEntryInput = Partial<Omit<NewLogEntry, 'id' | 'createdAt' | 'updatedAt'>>;

export async function createLogEntry(input: CreateLogEntryInput): Promise<LogEntry> {
  const now = Date.now();
  const row: NewLogEntry = {
    ...input,
    id: createId(),
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(logEntry).values(row);
  return row as LogEntry;
}

export async function getLogEntry(id: string): Promise<LogEntry | undefined> {
  const rows = await db.select().from(logEntry).where(eq(logEntry.id, id)).limit(1);
  return rows[0];
}

export async function listLogEntries(): Promise<LogEntry[]> {
  return db.select().from(logEntry).orderBy(desc(logEntry.loggedAt));
}

/**
 * Returns the most recent distinct-by-name food-type entries (newest first).
 * Used for the Home screen quick-add chips. Full rows are returned so the caller
 * can use `logEntryToFormState` to pre-fill a new entry with all prior nutrition.
 */
export async function listRecentFoodEntries(limit = 10): Promise<LogEntry[]> {
  const rows = await db
    .select()
    .from(logEntry)
    .where(inArray(logEntry.type, [...FOOD_TYPES]))
    .orderBy(desc(logEntry.loggedAt));

  const seen = new Set<string>();
  const result: LogEntry[] = [];
  for (const row of rows) {
    if (!seen.has(row.name) && result.length < limit) {
      seen.add(row.name);
      result.push(row);
    }
  }
  return result;
}

export async function updateLogEntry(id: string, patch: UpdateLogEntryInput): Promise<void> {
  await db
    .update(logEntry)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(logEntry.id, id));
}

export async function deleteLogEntry(id: string): Promise<void> {
  await db.delete(logEntry).where(eq(logEntry.id, id));
}
