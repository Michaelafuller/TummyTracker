import { create } from 'zustand';

import type { LogEntryFormState } from './formModel';

// Minimal zustand store (CLAUDE.md §3): carries a pending form prefill from the
// barcode scanner to the entry form, avoiding JSON-in-URL params.
interface PrefillState {
  prefill: Partial<LogEntryFormState> | null;
  setPrefill: (prefill: Partial<LogEntryFormState>) => void;
  clearPrefill: () => void;
}

export const usePrefillStore = create<PrefillState>((set) => ({
  prefill: null,
  setPrefill: (prefill) => set({ prefill }),
  clearPrefill: () => set({ prefill: null }),
}));
