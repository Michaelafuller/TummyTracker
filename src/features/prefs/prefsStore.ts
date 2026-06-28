import { create } from 'zustand';

import { loadPrefs, savePrefs, type AppPrefs } from '@/lib/prefs';

type PrefsStore = AppPrefs & {
  loaded: boolean;
  load: () => Promise<void>;
  setOfflineMode: (value: boolean) => void;
};

export const usePrefsStore = create<PrefsStore>((set, get) => ({
  offlineMode: false,
  loaded: false,
  load: async () => {
    const prefs = await loadPrefs();
    set({ ...prefs, loaded: true });
  },
  setOfflineMode: (value) => {
    set({ offlineMode: value });
    savePrefs({ ...get(), offlineMode: value });
  },
}));
