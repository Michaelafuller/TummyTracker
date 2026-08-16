import { create } from 'zustand';

import { listGoals, removeGoal, upsertGoal } from '@/db/repository';
import type { Goal, GoalDirection } from '@/db/schema';
import { refreshCheckInIfEnabled } from '@/features/goals/checkInService';
import type { NutritionField } from '@/lib/validation';

/**
 * Minimal goals store (mirrors src/features/watchlist/watchlistStore.ts's
 * shape): `goals` mirrors the DB, `load` pulls it, `upsert`/`remove` write
 * through the repository then refresh state. Hydrated in app-providers.tsx's
 * MigrationGate success effect alongside the watchlist load, so reads never
 * race the migration gate.
 */
type GoalsStore = {
  goals: Goal[];
  loaded: boolean;
  load: () => Promise<void>;
  upsert: (nutrient: NutritionField, direction: GoalDirection, threshold: number) => Promise<void>;
  remove: (nutrient: NutritionField) => Promise<void>;
};

export const useGoalsStore = create<GoalsStore>((set) => ({
  goals: [],
  loaded: false,
  load: async () => {
    const goals = await listGoals();
    set({ goals, loaded: true });
  },
  upsert: async (nutrient, direction, threshold) => {
    await upsertGoal(nutrient, direction, threshold);
    set({ goals: await listGoals() });
    // A goal edit can change which floors are unmet — re-arm the check-in
    // with fresh copy (design contract: the check-in body is never stale).
    void refreshCheckInIfEnabled();
  },
  remove: async (nutrient) => {
    await removeGoal(nutrient);
    set({ goals: await listGoals() });
    void refreshCheckInIfEnabled();
  },
}));
