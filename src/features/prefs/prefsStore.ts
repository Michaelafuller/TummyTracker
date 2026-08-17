import { create } from 'zustand';

import { loadPrefs, savePrefs, type AppPrefs } from '@/lib/prefs';

type PrefsStore = AppPrefs & {
  loaded: boolean;
  load: () => Promise<void>;
  setOfflineMode: (value: boolean) => void;
  /** The only write path for check-in prefs (design contract, HANDOFF.md
   * Cycle A) — sets store state and persists in one call. */
  setCheckIn: (enabled: boolean, hour: number, minute: number) => void;
};

export const usePrefsStore = create<PrefsStore>((set, get) => ({
  offlineMode: false,
  tagBackfillV1Done: false,
  checkInEnabled: false,
  checkInHour: 20,
  checkInMinute: 0,
  checkInAdoptedV1: false,
  loaded: false,
  load: async () => {
    const prefs = await loadPrefs();
    set({ ...prefs, loaded: true });
  },
  setOfflineMode: (value) => {
    set({ offlineMode: value });
    savePrefs({ ...get(), offlineMode: value });
  },
  setCheckIn: (enabled, hour, minute) => {
    set({ checkInEnabled: enabled, checkInHour: hour, checkInMinute: minute, checkInAdoptedV1: true });
    savePrefs({ ...get(), checkInEnabled: enabled, checkInHour: hour, checkInMinute: minute, checkInAdoptedV1: true });
  },
}));
