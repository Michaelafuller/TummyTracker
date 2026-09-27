import { desc } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { dayCheckIn, type DayCheckIn } from '@/db/schema';

/**
 * All day_check_in rows, newest date first, kept live via Drizzle's
 * expo-sqlite change listener — mirrors `useAllEntries`
 * (src/features/logging/useEntries.ts).
 */
export function useDayCheckIns(): DayCheckIn[] {
  const { data } = useLiveQuery(db.select().from(dayCheckIn).orderBy(desc(dayCheckIn.date)));
  return data ?? [];
}
