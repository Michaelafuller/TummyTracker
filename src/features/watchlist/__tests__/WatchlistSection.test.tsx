import { fireEvent, render } from '@testing-library/react-native';

import { addWatchlistItem, listWatchlistItems, removeWatchlistItem } from '@/db/repository';
import type { LogEntry, WatchlistItem } from '@/db/schema';
import { useWatchlistStore } from '../watchlistStore';
import { WatchlistSection } from '../WatchlistSection';

jest.mock('@/db/repository', () => ({
  listWatchlistItems: jest.fn(),
  addWatchlistItem: jest.fn(),
  removeWatchlistItem: jest.fn(),
}));

const DAY = 24 * 60 * 60 * 1000;

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'e1',
    type: 'meal',
    mealSlot: null,
    name: 'Meal',
    barcode: null,
    loggedAt: 0,
    sentiment: null,
    bristolScale: null,
    symptomType: null,
    severity: null,
    notes: null,
    ingredientsText: null,
    tagsJson: null,
    servingG: null,
    calories: null,
    fatG: null,
    saturatedFatG: null,
    carbsG: null,
    proteinG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    componentCount: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  useWatchlistStore.setState({ items: [], loaded: false });
  jest.clearAllMocks();
});

describe('WatchlistSection', () => {
  it('renders the empty state when there are no watched items', async () => {
    const { getByText } = await render(<WatchlistSection entries={[]} now={0} />);
    expect(getByText(/Add a suspect ingredient below/)).toBeTruthy();
  });

  it('renders each watched item with its term and stats sentence', async () => {
    const soy: WatchlistItem = { id: 'w1', term: 'soy', createdAt: 0 };
    useWatchlistStore.setState({ items: [soy], loaded: true });
    const entries = [
      entry({ id: 'e1', tagsJson: '["soybeans"]', loggedAt: 1 * DAY, sentiment: 4 }),
      entry({ id: 'e2', tagsJson: '["soybeans"]', loggedAt: 2 * DAY, sentiment: 2 }),
    ];
    const { getByText } = await render(<WatchlistSection entries={entries} now={5 * DAY} />);
    expect(getByText(/soy/)).toBeTruthy();
    expect(getByText(/2 times since watching/)).toBeTruthy();
    expect(getByText(/avg sentiment 3\.0/)).toBeTruthy();
  });

  it('normalizes and persists a manually added term', async () => {
    (addWatchlistItem as jest.Mock).mockResolvedValue({ id: 'w1', term: 'dairy', createdAt: 0 });
    (listWatchlistItems as jest.Mock).mockResolvedValue([{ id: 'w1', term: 'dairy', createdAt: 0 }]);
    const { getByLabelText } = await render(<WatchlistSection entries={[]} now={0} />);
    await fireEvent.changeText(getByLabelText('New watchlist term'), '  DAIRY! ');
    await fireEvent.press(getByLabelText('Add to watchlist'));
    expect(addWatchlistItem).toHaveBeenCalledWith('dairy');
  });

  it('rejects a duplicate term without calling the repository', async () => {
    const dairy: WatchlistItem = { id: 'w1', term: 'dairy', createdAt: 0 };
    useWatchlistStore.setState({ items: [dairy], loaded: true });
    const { getByLabelText, getByText } = await render(<WatchlistSection entries={[]} now={0} />);
    await fireEvent.changeText(getByLabelText('New watchlist term'), 'dairy');
    await fireEvent.press(getByLabelText('Add to watchlist'));
    expect(addWatchlistItem).not.toHaveBeenCalled();
    expect(getByText(/Already watching/)).toBeTruthy();
  });

  it('removing an item calls the repository with its id', async () => {
    const soy: WatchlistItem = { id: 'w1', term: 'soy', createdAt: 0 };
    useWatchlistStore.setState({ items: [soy], loaded: true });
    (removeWatchlistItem as jest.Mock).mockResolvedValue(undefined);
    (listWatchlistItems as jest.Mock).mockResolvedValue([]);
    const { getByLabelText } = await render(<WatchlistSection entries={[]} now={0} />);
    await fireEvent.press(getByLabelText('Stop watching soy'));
    expect(removeWatchlistItem).toHaveBeenCalledWith('w1');
  });
});
