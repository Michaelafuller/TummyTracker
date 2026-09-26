import { create } from 'zustand';

import type { MealComponentDraft } from '@/lib/mealAggregate';
import type { MealReviewFormState } from './mealReviewFormModel';

// Minimal zustand store (CLAUDE.md §3): accumulates component drafts across a
// multi-scan meal-building session (scan → confirm → "Add & scan next" → scan → ...
// → "Finish meal" → review). Cleared once the meal is saved.
//
// `reviewPrefill` seeds the review screen's meal-level fields (name/type/slot)
// when the builder was loaded from a past entry ("re-log with changes",
// HANDOFF.md GitHub #1) rather than built up from scratch via the scanner —
// `load` sets both atomically so the review screen's initial useState can read
// them together.
interface MealBuilderState {
  components: MealComponentDraft[];
  reviewPrefill: Partial<MealReviewFormState> | null;
  addComponent: (component: MealComponentDraft) => void;
  updateComponent: (index: number, patch: Partial<MealComponentDraft>) => void;
  removeComponent: (index: number) => void;
  /** Replace the whole builder (never append) — used when seeding from history. */
  load: (components: MealComponentDraft[], reviewPrefill: Partial<MealReviewFormState>) => void;
  clear: () => void;
}

export const useMealBuilderStore = create<MealBuilderState>((set) => ({
  components: [],
  reviewPrefill: null,
  addComponent: (component) =>
    set((state) => ({ components: [...state.components, component] })),
  updateComponent: (index, patch) =>
    set((state) => ({
      components: state.components.map((component, i) =>
        i === index ? { ...component, ...patch } : component,
      ),
    })),
  removeComponent: (index) =>
    set((state) => ({ components: state.components.filter((_, i) => i !== index) })),
  load: (components, reviewPrefill) => set({ components, reviewPrefill }),
  clear: () => set({ components: [], reviewPrefill: null }),
}));
