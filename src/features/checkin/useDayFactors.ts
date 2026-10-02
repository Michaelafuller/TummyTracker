import { desc } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { dayFactor, type DayFactor } from '@/db/schema';

/**
 * All day_factor rows (GitHub #23), newest date first, kept live via
 * Drizzle's expo-sqlite change listener — mirrors `useDayCheckIns`.
 */
export function useDayFactors(): DayFactor[] {
  const { data } = useLiveQuery(db.select().from(dayFactor).orderBy(desc(dayFactor.date)));
  return data ?? [];
}
