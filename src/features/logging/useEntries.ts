import { desc } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { logEntry, type LogEntry } from '@/db/schema';

/**
 * All log entries, newest first, kept live via Drizzle's expo-sqlite change
 * listener — the list re-renders automatically when entries are added or edited.
 */
export function useAllEntries(): LogEntry[] {
  const { data } = useLiveQuery(db.select().from(logEntry).orderBy(desc(logEntry.loggedAt)));
  return data ?? [];
}
