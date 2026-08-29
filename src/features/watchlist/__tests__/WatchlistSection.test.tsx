import { fireEvent, render } from '@testing-library/react-native';

import { addWatchlistItem, listWatchlistItems, removeWatchlistItem, renameWatchlistItem } from '@/db/repository';
import type { LogEntry, WatchlistItem } from '@/db/schema';
import { useWatchlistStore } from '../watchlistStore';
import { WatchlistSection } from '../WatchlistSection';

jest.mock('@/db/repository', () => ({
  listWatchlistItems: jest.fn(),
  addWatchlistItem: jest.fn(),
  removeWatchlistItem: jest.fn(),
  renameWatchlistItem: jest.fn(),
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
      entry({ id: 'e1', tagsJson: '["soybeans"]', loggedAt: 1 * DAY }),
      entry({
        id: 'bm1',
        type: 'bowel_movement',
        tagsJson: null,
        bristolScale: 1,
        loggedAt: 1 * DAY + 1,
      }),
      entry({ id: 'e2', tagsJson: '["soybeans"]', loggedAt: 2 * DAY }),
    ];
    const { getByText } = await render(<WatchlistSection entries={entries} now={5 * DAY} />);
    expect(getByText(/soy/)).toBeTruthy();
    expect(getByText(/2 times since watching/)).toBeTruthy();
    expect(getByText(/1 of 2 followed by a rough outcome/)).toBeTruthy();
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

  it('tapping Edit expands an editor seeded with the current term', async () => {
    const soy: WatchlistItem = { id: 'w1', term: 'soy', createdAt: 0 };
    useWatchlistStore.setState({ items: [soy], loaded: true });
    const { getByLabelText } = await render(<WatchlistSection entries={[]} now={0} />);
    await fireEvent.press(getByLabelText('Edit soy'));
    expect(getByLabelText('Edit watchlist term').props.defaultValue).toBe('soy');
  });

  it('tapping Edit again on the open row collapses it', async () => {
    const soy: WatchlistItem = { id: 'w1', term: 'soy', createdAt: 0 };
    useWatchlistStore.setState({ items: [soy], loaded: true });
    const { getByLabelText, queryByLabelText } = await render(<WatchlistSection entries={[]} now={0} />);
    await fireEvent.press(getByLabelText('Edit soy'));
    await fireEvent.press(getByLabelText('Edit soy'));
    expect(queryByLabelText('Edit watchlist term')).toBeNull();
  });

  it('saving a rename calls the store with the normalized term and collapses', async () => {
    const oinon: WatchlistItem = { id: 'w1', term: 'oinon', createdAt: 0 };
    useWatchlistStore.setState({ items: [oinon], loaded: true });
    (renameWatchlistItem as jest.Mock).mockResolvedValue(undefined);
    (listWatchlistItems as jest.Mock).mockResolvedValue([{ id: 'w1', term: 'onion', createdAt: 0 }]);
    const { getByLabelText, queryByLabelText } = await render(<WatchlistSection entries={[]} now={0} />);
    await fireEvent.press(getByLabelText('Edit oinon'));
    await fireEvent.changeText(getByLabelText('Edit watchlist term'), '  ONION! ');
    await fireEvent.press(getByLabelText('Save watchlist term'));
    expect(renameWatchlistItem).toHaveBeenCalledWith('w1', 'onion');
    expect(queryByLabelText('Edit watchlist term')).toBeNull();
  });

  it('an invalid rename shows an inline error without touching the add row', async () => {
    const soy: WatchlistItem = { id: 'w1', term: 'soy', createdAt: 0 };
    useWatchlistStore.setState({ items: [soy], loaded: true });
    const { getByLabelText, getByText, queryByText } = await render(<WatchlistSection entries={[]} now={0} />);
    await fireEvent.press(getByLabelText('Edit soy'));
    await fireEvent.changeText(getByLabelText('Edit watchlist term'), '!');
    await fireEvent.press(getByLabelText('Save watchlist term'));
    expect(getByText('Enter at least 2 letters or numbers.')).toBeTruthy();
    expect(renameWatchlistItem).not.toHaveBeenCalled();
    // The add row's own error slot stays empty — this is the edit editor's error.
    expect(queryByText(/Already watching/)).toBeNull();
  });

  it('renaming to an existing term shows a duplicate error and does not call the repository', async () => {
    const soy: WatchlistItem = { id: 'w1', term: 'soy', createdAt: 0 };
    const dairy: WatchlistItem = { id: 'w2', term: 'dairy', createdAt: 0 };
    useWatchlistStore.setState({ items: [soy, dairy], loaded: true });
    const { getByLabelText, getByText } = await render(<WatchlistSection entries={[]} now={0} />);
    await fireEvent.press(getByLabelText('Edit soy'));
    await fireEvent.changeText(getByLabelText('Edit watchlist term'), 'dairy');
    await fireEvent.press(getByLabelText('Save watchlist term'));
    expect(getByText(/Already watching "dairy"/)).toBeTruthy();
    expect(renameWatchlistItem).not.toHaveBeenCalled();
  });

  it('Cancel collapses the editor without calling rename', async () => {
    const soy: WatchlistItem = { id: 'w1', term: 'soy', createdAt: 0 };
    useWatchlistStore.setState({ items: [soy], loaded: true });
    const { getByLabelText, queryByLabelText } = await render(<WatchlistSection entries={[]} now={0} />);
    await fireEvent.press(getByLabelText('Edit soy'));
    await fireEvent.changeText(getByLabelText('Edit watchlist term'), 'onion');
    await fireEvent.press(getByLabelText('Cancel editing soy'));
    expect(renameWatchlistItem).not.toHaveBeenCalled();
    expect(queryByLabelText('Edit watchlist term')).toBeNull();
  });

  it('saving with an unchanged (normalized) term just collapses without calling rename', async () => {
    const soy: WatchlistItem = { id: 'w1', term: 'soy', createdAt: 0 };
    useWatchlistStore.setState({ items: [soy], loaded: true });
    const { getByLabelText, queryByLabelText } = await render(<WatchlistSection entries={[]} now={0} />);
    await fireEvent.press(getByLabelText('Edit soy'));
    await fireEvent.changeText(getByLabelText('Edit watchlist term'), '  SOY  ');
    await fireEvent.press(getByLabelText('Save watchlist term'));
    expect(renameWatchlistItem).not.toHaveBeenCalled();
    expect(queryByLabelText('Edit watchlist term')).toBeNull();
  });

  it('the collapsed card still renders the plain term text (Maestro assertVisible contract)', async () => {
    const soy: WatchlistItem = { id: 'w1', term: 'soy', createdAt: 0 };
    useWatchlistStore.setState({ items: [soy], loaded: true });
    const { getByText } = await render(<WatchlistSection entries={[]} now={0} />);
    expect(getByText('soy')).toBeTruthy();
  });
});
