import { addWatchlistItem, listWatchlistItems, removeWatchlistItem, renameWatchlistItem } from '@/db/repository';
import type { WatchlistItem } from '@/db/schema';
import { useWatchlistStore } from '../watchlistStore';

jest.mock('@/db/repository', () => ({
  listWatchlistItems: jest.fn(),
  addWatchlistItem: jest.fn(),
  removeWatchlistItem: jest.fn(),
  renameWatchlistItem: jest.fn(),
}));

const SOY: WatchlistItem = { id: 'w1', term: 'soy', createdAt: 100 };
const DAIRY: WatchlistItem = { id: 'w2', term: 'dairy', createdAt: 200 };

beforeEach(() => {
  useWatchlistStore.setState({ items: [], loaded: false });
  jest.clearAllMocks();
});

describe('watchlistStore.load', () => {
  it('reads from listWatchlistItems and marks loaded:true', async () => {
    (listWatchlistItems as jest.Mock).mockResolvedValue([SOY]);
    await useWatchlistStore.getState().load();
    expect(useWatchlistStore.getState().items).toEqual([SOY]);
    expect(useWatchlistStore.getState().loaded).toBe(true);
  });
});

describe('watchlistStore.add', () => {
  it('calls addWatchlistItem then refreshes items from the repository', async () => {
    (addWatchlistItem as jest.Mock).mockResolvedValue(SOY);
    (listWatchlistItems as jest.Mock).mockResolvedValue([SOY]);
    await useWatchlistStore.getState().add('soy');
    expect(addWatchlistItem).toHaveBeenCalledWith('soy');
    expect(useWatchlistStore.getState().items).toEqual([SOY]);
  });
});

describe('watchlistStore.remove', () => {
  it('calls removeWatchlistItem then refreshes items from the repository', async () => {
    useWatchlistStore.setState({ items: [SOY, DAIRY], loaded: true });
    (removeWatchlistItem as jest.Mock).mockResolvedValue(undefined);
    (listWatchlistItems as jest.Mock).mockResolvedValue([DAIRY]);
    await useWatchlistStore.getState().remove('w1');
    expect(removeWatchlistItem).toHaveBeenCalledWith('w1');
    expect(useWatchlistStore.getState().items).toEqual([DAIRY]);
  });
});

describe('watchlistStore.rename', () => {
  it('calls renameWatchlistItem then refreshes items from the repository', async () => {
    const renamed: WatchlistItem = { id: 'w1', term: 'onion', createdAt: 100 };
    useWatchlistStore.setState({ items: [SOY, DAIRY], loaded: true });
    (renameWatchlistItem as jest.Mock).mockResolvedValue(undefined);
    (listWatchlistItems as jest.Mock).mockResolvedValue([renamed, DAIRY]);
    await useWatchlistStore.getState().rename('w1', 'onion');
    expect(renameWatchlistItem).toHaveBeenCalledWith('w1', 'onion');
    expect(useWatchlistStore.getState().items).toEqual([renamed, DAIRY]);
  });

  it('propagates a duplicate-term rejection from the repository', async () => {
    useWatchlistStore.setState({ items: [SOY, DAIRY], loaded: true });
    (renameWatchlistItem as jest.Mock).mockRejectedValue(new Error('UNIQUE constraint failed: watchlist_item.term'));
    await expect(useWatchlistStore.getState().rename('w1', 'dairy')).rejects.toThrow('UNIQUE constraint failed');
  });
});
