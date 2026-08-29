import { create } from 'zustand';

import { addWatchlistItem, listWatchlistItems, removeWatchlistItem, renameWatchlistItem } from '@/db/repository';
import type { WatchlistItem } from '@/db/schema';

/**
 * Minimal watchlist store (mirrors src/features/prefs/prefsStore.ts's shape):
 * `items` mirrors the DB, `load` pulls it, `add`/`remove`/`rename` write
 * through the repository then refresh state. Hydrated in app-providers.tsx's
 * MigrationGate success effect so reads never race the migration gate.
 */
type WatchlistStore = {
  items: WatchlistItem[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (term: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, term: string) => Promise<void>;
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
  rename: async (id: string, term: string) => {
    // Mirrors add: the caller (WatchlistSection) pre-checks for a duplicate
    // term against the in-memory `items` list before calling this, the same
    // contract handleAdd uses. If a duplicate slips through anyway, the
    // UNIQUE index on `term` throws and that propagates to the caller as-is —
    // this store does no catching/translation of its own.
    await renameWatchlistItem(id, term);
    set({ items: await listWatchlistItems() });
  },
}));
