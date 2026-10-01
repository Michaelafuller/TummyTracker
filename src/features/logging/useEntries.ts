import { desc } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { logEntry, mealComponent, type LogEntry, type MealComponent } from '@/db/schema';

/**
 * All log entries, newest first, kept live via Drizzle's expo-sqlite change
 * listener — the list re-renders automatically when entries are added or edited.
 */
export function useAllEntries(): LogEntry[] {
  const { data } = useLiveQuery(db.select().from(logEntry).orderBy(desc(logEntry.loggedAt)));
  return data ?? [];
}

/**
 * Every meal component row (the per-item servings behind grouped meals), kept
 * live like `useAllEntries`. Screens group them by `entryId` once; the
 * dose-response analysis (analysis/doseResponse.ts) reads the servings.
 */
export function useAllMealComponents(): MealComponent[] {
  const { data } = useLiveQuery(db.select().from(mealComponent));
  return data ?? [];
}
