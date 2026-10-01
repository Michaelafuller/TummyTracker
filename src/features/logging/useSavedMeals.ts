import { useMemo } from 'react';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { savedMeal, savedMealComponent } from '@/db/schema';
import { groupSavedMeals, type SavedMealWithComponents } from '@/lib/savedMeals';

/**
 * Every saved meal ("My meals", GitHub #25) with its items, A-Z by name, kept
 * live via Drizzle's expo-sqlite change listener — mirrors `useDayFactors`.
 */
export function useSavedMeals(): SavedMealWithComponents[] {
  const { data: meals } = useLiveQuery(db.select().from(savedMeal));
  const { data: components } = useLiveQuery(db.select().from(savedMealComponent));
  return useMemo(() => groupSavedMeals(meals ?? [], components ?? []), [meals, components]);
}
