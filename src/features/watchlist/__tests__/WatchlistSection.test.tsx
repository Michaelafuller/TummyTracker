import { fireEvent, render } from '@testing-library/react-native';

import { addWatchlistItem, listWatchlistItems, removeWatchlistItem, renameWatchlistItem } from '@/db/repository';
import type { Experiment, LogEntry, WatchlistItem } from '@/db/schema';
import { useWatchlistStore } from '../watchlistStore';
import { WatchlistSection } from '../WatchlistSection';

jest.mock('@/db/repository', () => ({
  listWatchlistItems: jest.fn(),
  addWatchlistItem: jest.fn(),
  removeWatchlistItem: jest.fn(),
  renameWatchlistItem: jest.fn(),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// GitHub #19: the Watchlist section's "Start experiment" / "Experiment
// running" entry point reads the active experiment live — mocked here like
// every other live-query hook this component doesn't own.
let mockActiveExperiment: Experiment | undefined;
let mockExperiments: Experiment[] = [];
jest.mock('@/features/experiments/useExperiments', () => ({
  useActiveExperiment: () => mockActiveExperiment,
  useExperiments: () => mockExperiments,
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

function experimentRow(overrides: Partial<Experiment> = {}): Experiment {
  return {
    id: 'exp1',
    term: 'soy',
    startDate: '2026-04-01',
    baselineDays: 14,
    eliminationDays: 14,
    challengeDays: 3,
    observationDays: 3,
    status: 'active',
    verdictJson: null,
    endedAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  useWatchlistStore.setState({ items: [], loaded: false });
  mockActiveExperiment = undefined;
  mockExperiments = [];
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

describe('WatchlistSection — elimination-experiment entry point (GitHub #19)', () => {
  it('shows "Start experiment" on every item when no experiment is active', async () => {
    const soy: WatchlistItem = { id: 'w1', term: 'soy', createdAt: 0 };
    const dairy: WatchlistItem = { id: 'w2', term: 'dairy', createdAt: 0 };
    useWatchlistStore.setState({ items: [soy, dairy], loaded: true });
    const { getByLabelText } = await render(<WatchlistSection entries={[]} now={0} />);
    expect(getByLabelText('Start experiment on soy')).toBeTruthy();
    expect(getByLabelText('Start experiment on dairy')).toBeTruthy();
  });

  it('tapping "Start experiment" navigates to the new-experiment screen with the term', async () => {
    const soy: WatchlistItem = { id: 'w1', term: 'soy', createdAt: 0 };
    useWatchlistStore.setState({ items: [soy], loaded: true });
    const { getByLabelText } = await render(<WatchlistSection entries={[]} now={0} />);
    await fireEvent.press(getByLabelText('Start experiment on soy'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/experiment/new', params: { term: 'soy' } });
  });

  it('the item under test shows "Experiment running" instead, linking to it', async () => {
    const soy: WatchlistItem = { id: 'w1', term: 'soy', createdAt: 0 };
    const dairy: WatchlistItem = { id: 'w2', term: 'dairy', createdAt: 0 };
    useWatchlistStore.setState({ items: [soy, dairy], loaded: true });
    mockActiveExperiment = experimentRow({ id: 'exp1', term: 'soy' });
    const { getByLabelText, queryByLabelText } = await render(<WatchlistSection entries={[]} now={0} />);

    await fireEvent.press(getByLabelText('Open soy experiment'));
    expect(mockPush).toHaveBeenCalledWith('/experiment/exp1');

    // Neither the running item nor any other item offers "Start experiment"
    // while one is already active (at most one active, invariant).
    expect(queryByLabelText('Start experiment on soy')).toBeNull();
    expect(queryByLabelText('Start experiment on dairy')).toBeNull();
  });
});

describe('WatchlistSection — last experiment and past-experiments link (GitHub #19, Cycle B)', () => {
  const soy: WatchlistItem = { id: 'w1', term: 'soy', createdAt: 0 };
  const verdict = (kind: string, confidence: string | null) =>
    JSON.stringify({ kind, confidence, reason: 'x', baselineRate: 0.7, eliminationRate: 0, reintroductionRate: 0.8 });
  const finishedAt = new Date(2026, 9, 17, 12, 0, 0).getTime(); // Oct 17

  it('shows the latest finished experiment for the term under the stats line, opening it', async () => {
    useWatchlistStore.setState({ items: [soy], loaded: true });
    mockExperiments = [
      // Newest first — the newer completed one wins over the older one.
      experimentRow({
        id: 'exp-new',
        status: 'completed',
        verdictJson: verdict('likely-trigger', 'medium'),
        endedAt: finishedAt,
      }),
      experimentRow({
        id: 'exp-old',
        status: 'completed',
        verdictJson: verdict('inconclusive', null),
        endedAt: new Date(2026, 5, 1, 12).getTime(),
      }),
    ];
    const { getByText, getByLabelText } = await render(<WatchlistSection entries={[]} now={0} />);

    expect(getByText('Last experiment: Likely a trigger · medium (Oct 17)')).toBeTruthy();
    await fireEvent.press(getByLabelText('Open last soy experiment'));
    expect(mockPush).toHaveBeenCalledWith('/experiment/exp-new');
  });

  it('shows an inconclusive result without a confidence tier', async () => {
    useWatchlistStore.setState({ items: [soy], loaded: true });
    mockExperiments = [
      experimentRow({ status: 'completed', verdictJson: verdict('inconclusive', null), endedAt: finishedAt }),
    ];
    const { getByText } = await render(<WatchlistSection entries={[]} now={0} />);
    expect(getByText('Last experiment: Inconclusive (Oct 17)')).toBeTruthy();
  });

  it('shows no last-experiment line for abandoned, active or other-term experiments', async () => {
    useWatchlistStore.setState({ items: [soy], loaded: true });
    mockExperiments = [
      experimentRow({ id: 'a', status: 'abandoned', endedAt: finishedAt }),
      experimentRow({ id: 'b', status: 'active' }),
      experimentRow({
        id: 'c',
        term: 'dairy',
        status: 'completed',
        verdictJson: verdict('likely-trigger', 'high'),
        endedAt: finishedAt,
      }),
    ];
    const { queryByText } = await render(<WatchlistSection entries={[]} now={0} />);
    expect(queryByText(/Last experiment/)).toBeNull();
  });

  it('keeps the Start experiment link alongside the last-experiment line', async () => {
    useWatchlistStore.setState({ items: [soy], loaded: true });
    mockExperiments = [
      experimentRow({ status: 'completed', verdictJson: verdict('likely-trigger', 'high'), endedAt: finishedAt }),
    ];
    const { getByLabelText } = await render(<WatchlistSection entries={[]} now={0} />);
    expect(getByLabelText('Start experiment on soy')).toBeTruthy();
  });

  it('shows a "Past experiments" link only when at least one experiment exists', async () => {
    useWatchlistStore.setState({ items: [soy], loaded: true });
    const empty = await render(<WatchlistSection entries={[]} now={0} />);
    expect(empty.queryByLabelText('See past experiments')).toBeNull();
    await empty.unmount();

    mockExperiments = [experimentRow({ status: 'abandoned', endedAt: finishedAt })];
    const { getByLabelText } = await render(<WatchlistSection entries={[]} now={0} />);
    await fireEvent.press(getByLabelText('See past experiments'));
    expect(mockPush).toHaveBeenCalledWith('/experiment/history');
  });
});
