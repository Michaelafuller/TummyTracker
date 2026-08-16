import { create } from 'zustand';

import { listGoals, removeGoal, upsertGoal } from '@/db/repository';
import type { Goal, GoalDirection } from '@/db/schema';
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
  },
  remove: async (nutrient) => {
    await removeGoal(nutrient);
    set({ goals: await listGoals() });
  },
}));
