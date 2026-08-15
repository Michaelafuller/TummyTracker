import { fireEvent, render } from '@testing-library/react-native';

import { addWatchlistItem, listWatchlistItems } from '@/db/repository';
import type { WatchlistItem } from '@/db/schema';
import { useWatchlistStore } from '../watchlistStore';
import { WatchButton } from '../WatchButton';

jest.mock('@/db/repository', () => ({
  listWatchlistItems: jest.fn(),
  addWatchlistItem: jest.fn(),
  removeWatchlistItem: jest.fn(),
}));

beforeEach(() => {
  useWatchlistStore.setState({ items: [], loaded: false });
  jest.clearAllMocks();
});

describe('WatchButton', () => {
  it('shows "Watch" and adds the normalized tag when not already watched', async () => {
    (addWatchlistItem as jest.Mock).mockResolvedValue({ id: 'w1', term: 'soybeans', createdAt: 0 });
    (listWatchlistItems as jest.Mock).mockResolvedValue([{ id: 'w1', term: 'soybeans', createdAt: 0 }]);
    const { getByLabelText } = await render(<WatchButton tag="soybeans" />);
    expect(getByLabelText('Watch soybeans')).toBeTruthy();
    await fireEvent.press(getByLabelText('Watch soybeans'));
    expect(addWatchlistItem).toHaveBeenCalledWith('soybeans');
  });

  it('shows "Watching" and is disabled when a watched term already covers the tag', async () => {
    const soy: WatchlistItem = { id: 'w1', term: 'soy', createdAt: 0 };
    useWatchlistStore.setState({ items: [soy], loaded: true });
    const { getByLabelText } = await render(<WatchButton tag="soybeans" />);
    expect(getByLabelText('Watching soybeans')).toBeTruthy();
    await fireEvent.press(getByLabelText('Watching soybeans'));
    expect(addWatchlistItem).not.toHaveBeenCalled();
  });

  it('does not show "Watching" for a tag the watched term does not cover (buttermilk case)', async () => {
    const milk: WatchlistItem = { id: 'w1', term: 'milk', createdAt: 0 };
    useWatchlistStore.setState({ items: [milk], loaded: true });
    const { getByLabelText } = await render(<WatchButton tag="buttermilk" />);
    expect(getByLabelText('Watch buttermilk')).toBeTruthy();
  });
});
