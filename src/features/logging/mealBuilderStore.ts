import { create } from 'zustand';

import type { MealComponentDraft } from '@/lib/mealAggregate';

// Minimal zustand store (CLAUDE.md §3): accumulates component drafts across a
// multi-scan meal-building session (scan → confirm → "Add & scan next" → scan → ...
// → "Finish meal" → review). Cleared once the meal is saved.
interface MealBuilderState {
  components: MealComponentDraft[];
  addComponent: (component: MealComponentDraft) => void;
  updateComponent: (index: number, patch: Partial<MealComponentDraft>) => void;
  removeComponent: (index: number) => void;
  clear: () => void;
}

export const useMealBuilderStore = create<MealBuilderState>((set) => ({
  components: [],
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
  clear: () => set({ components: [] }),
}));
