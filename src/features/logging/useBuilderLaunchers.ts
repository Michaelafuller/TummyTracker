import { useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';

import { getMealComponents } from '@/db/repository';
import type { LogEntry, MealSlot } from '@/db/schema';
import { entryToComponentDrafts } from '@/lib/mealAggregate';
import { savedMealToDrafts, type SavedMealWithComponents } from '@/lib/savedMeals';
import { useMealBuilderStore } from './mealBuilderStore';

export interface BuilderLaunchersOptions {
  /**
   * A meal slot that overrides the one on the meal being opened (GitHub #26):
   * the quick-log screen opened from a "Breakfast" reminder says "this is
   * breakfast" even when the saved meal carries another slot. Omit (or pass
   * null) to keep each meal's own slot — Home's behaviour.
   */
  slot?: MealSlot | null;
}

/**
 * The three ways Home (and the quick-log screen) open the meal builder from an
 * existing meal: a Recent row, a My meals row, and a My meals "Edit". Shared so
 * both screens copy items into the builder the same way (copy, never link —
 * GitHub #25) and share one in-flight guard against a fast second tap.
 */
export function useBuilderLaunchers(options: BuilderLaunchersOptions = {}) {
  const { slot = null } = options;
  const router = useRouter();
  const loadBuilder = useMealBuilderStore((s) => s.load);
  const loadSavedMealForEdit = useMealBuilderStore((s) => s.loadSavedMealForEdit);
  const inFlight = useRef(false);

  const onRecentTap = useCallback(
    async (entry: LogEntry) => {
      // Guard against a fast second tap (same row or another) while the first
      // is still loading — without this, both taps race to loadBuilder/push.
      if (inFlight.current) {
        return;
      }
      inFlight.current = true;
      try {
        // Copy, never edit (owner decision): re-loading a past entry starts a
        // new draft meal seeded with its items, never touches the saved row.
        const rows = await getMealComponents(entry.id);
        loadBuilder(entryToComponentDrafts(entry, rows), {
          name: entry.name,
          type: entry.type,
          mealSlot: slot ?? entry.mealSlot,
        });
        router.push('/meal/review');
      } catch {
        Alert.alert("Couldn't open that meal", 'Something went wrong loading it — try again.');
      } finally {
        inFlight.current = false;
      }
    },
    [loadBuilder, router, slot],
  );

  // Tapping a saved meal ("My meals", GitHub #25) behaves exactly like a Recent
  // row: its items are COPIED into a fresh builder session (time = now), the
  // template itself is never touched or linked to the meal that gets logged.
  const onMyMealTap = useCallback(
    (item: SavedMealWithComponents) => {
      if (inFlight.current) {
        return;
      }
      inFlight.current = true;
      try {
        loadBuilder(savedMealToDrafts(item.components), {
          name: item.meal.name,
          type: item.meal.type,
          mealSlot: slot ?? item.meal.mealSlot,
        });
        router.push('/meal/review');
      } catch {
        Alert.alert("Couldn't open that meal", 'Something went wrong loading it — try again.');
      } finally {
        inFlight.current = false;
      }
    },
    [loadBuilder, router, slot],
  );

  // Editing a template never takes the slot override: the template keeps its own slot.
  const onMyMealEdit = useCallback(
    (item: SavedMealWithComponents) => {
      loadSavedMealForEdit(item.meal.id, savedMealToDrafts(item.components), {
        name: item.meal.name,
        type: item.meal.type,
        mealSlot: item.meal.mealSlot,
      });
      router.push('/meal/review');
    },
    [loadSavedMealForEdit, router],
  );

  return { onRecentTap, onMyMealTap, onMyMealEdit };
}
