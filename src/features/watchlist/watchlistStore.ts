import { create } from 'zustand';

import { addWatchlistItem, listWatchlistItems, removeWatchlistItem } from '@/db/repository';
import type { WatchlistItem } from '@/db/schema';

/**
 * Minimal watchlist store (mirrors src/features/prefs/prefsStore.ts's shape):
 * `items` mirrors the DB, `load` pulls it, `add`/`remove` write through the
 * repository then refresh state. Hydrated in app-providers.tsx's
 * MigrationGate success effect so reads never race the migration gate.
 */
type WatchlistStore = {
  items: WatchlistItem[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (term: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export const useWatchlistStore = create<WatchlistStore>((set) => ({
  items: [],
  loaded: false,
  load: async () => {
    const items = await listWatchlistItems();
    set({ items, loaded: true });
  },
  add: async (term: string) => {
    await addWatchlistItem(term);
    set({ items: await listWatchlistItems() });
  },
  remove: async (id: string) => {
    await removeWatchlistItem(id);
    set({ items: await listWatchlistItems() });
  },
}));
