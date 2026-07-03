import { create } from 'zustand';

import type { ComponentFormState } from './componentFormModel';

// Minimal zustand store (CLAUDE.md §3): carries a pending component-form prefill
// from the barcode scanner to the meal/component confirm screen, mirroring
// prefillStore.ts (which stays dedicated to the single-item entry/new flow).
interface ComponentPrefillState {
  prefill: Partial<ComponentFormState> | null;
  setPrefill: (prefill: Partial<ComponentFormState>) => void;
  clearPrefill: () => void;
}

export const useComponentPrefillStore = create<ComponentPrefillState>((set) => ({
  prefill: null,
  setPrefill: (prefill) => set({ prefill }),
  clearPrefill: () => set({ prefill: null }),
}));
