import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useEffect as mockUseEffect } from 'react';
import { Alert } from 'react-native';

import type { LogEntry, MealComponent, WatchlistItem } from '@/db/schema';
import { deleteMealComponentAndReaggregate, getLogEntry, getMealComponents } from '@/db/repository';
import { useWatchlistStore } from '@/features/watchlist/watchlistStore';
import EditEntryScreen from '../[id]';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'e1' }),
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  // No NavigationContainer in these tests, so the real useFocusEffect (which
  // needs navigation context) would throw. Approximate it as "run once on
  // mount" — sufficient to exercise the initial fetch this cycle added.
  useFocusEffect: (effect: () => void | (() => void)) => mockUseEffect(effect, []),
}));

jest.mock('@/db/repository', () => ({
  getLogEntry: jest.fn(),
  getMealComponents: jest.fn(),
  updateLogEntry: jest.fn(),
  deleteLogEntry: jest.fn(),
  deleteMealComponentAndReaggregate: jest.fn(),
  listWatchlistItems: jest.fn(),
  addWatchlistItem: jest.fn(),
  removeWatchlistItem: jest.fn(),
}));

// ReanimatedSwipeable needs the native Worklets runtime, unavailable under
// Jest — render its children and right-actions side by side instead (HANDOFF
// meal-component delete §B.5) so the delete action stays reachable by label.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const ReactLib = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ children, renderRightActions }: any) =>
      ReactLib.createElement(View, null, children, renderRightActions ? renderRightActions() : null),
  };
});

const BASE_ENTRY: LogEntry = {
  id: 'e1',
  type: 'meal',
  mealSlot: 'lunch',
  name: 'Lunch',
  barcode: null,
  loggedAt: 1000,
  sentiment: null,
  bristolScale: null,
  symptomType: null,
  severity: null,
  notes: null,
  ingredientsText: null,
  tagsJson: null,
  calories: 300,
  fatG: null,
  saturatedFatG: null,
  carbsG: null,
  proteinG: null,
  fiberG: null,
  sugarG: null,
  sodiumMg: null,
  servingG: null,
  componentCount: null,
  createdAt: 1,
  updatedAt: 1,
};

const COMPONENT: MealComponent = {
  id: 'c1',
  entryId: 'e1',
  name: 'Peas',
  barcode: null,
  servings: 2,
  servingG: null,
  calories: 100,
  fatG: null,
  saturatedFatG: null,
  carbsG: null,
  proteinG: null,
  fiberG: null,
  sugarG: null,
  sodiumMg: null,
  ingredientsText: null,
  tagsJson: null,
  sortOrder: 0,
  createdAt: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  useWatchlistStore.setState({ items: [], loaded: false });
});

describe('EditEntryScreen grouped-meal display', () => {
  it('does not render "In this meal" for a plain entry (componentCount null)', async () => {
    (getLogEntry as jest.Mock).mockResolvedValue(BASE_ENTRY);
    const { queryByText, findByText } = await render(<EditEntryScreen />);
    await findByText('Lunch'); // wait for load to settle (form field placeholder/value)
    expect(queryByText('In this meal')).toBeNull();
    expect(getMealComponents).not.toHaveBeenCalled();
  });

  it('renders "In this meal" with component rows for a grouped meal', async () => {
    (getLogEntry as jest.Mock).mockResolvedValue({ ...BASE_ENTRY, componentCount: 2 });
    (getMealComponents as jest.Mock).mockResolvedValue([COMPONENT]);
    const { findByText } = await render(<EditEntryScreen />);
    expect(await findByText('In this meal')).toBeTruthy();
    expect(await findByText('Peas · 2× serving · 200 kcal')).toBeTruthy();
    expect(getMealComponents).toHaveBeenCalledWith('e1');
  });

  it('navigates to the component edit screen when a component row is pressed', async () => {
    (getLogEntry as jest.Mock).mockResolvedValue({ ...BASE_ENTRY, componentCount: 2 });
    (getMealComponents as jest.Mock).mockResolvedValue([COMPONENT]);
    const { findByLabelText } = await render(<EditEntryScreen />);
    await fireEvent.press(await findByLabelText('Edit Peas'));
    expect(mockPush).toHaveBeenCalledWith('/entry/component/c1');
  });
});

describe('EditEntryScreen swipe-to-delete component', () => {
  beforeEach(() => {
    // Approximate the confirm Alert as "user taps the destructive button".
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const destructive = buttons?.find((button) => button.style === 'destructive');
      destructive?.onPress?.();
    });
  });

  afterEach(() => {
    (Alert.alert as jest.Mock).mockRestore();
  });

  it('deletes the component and re-fetches the entry + components on confirm', async () => {
    (getLogEntry as jest.Mock).mockResolvedValue({ ...BASE_ENTRY, componentCount: 2 });
    (getMealComponents as jest.Mock).mockResolvedValue([COMPONENT]);
    (deleteMealComponentAndReaggregate as jest.Mock).mockResolvedValue('deleted');

    const { findByTestId } = await render(<EditEntryScreen />);
    await fireEvent.press(await findByTestId('component-delete-c1'));

    expect(deleteMealComponentAndReaggregate).toHaveBeenCalledWith('c1');
    // Initial focus-effect fetch, plus the post-delete refresh (loadEntry).
    expect(getLogEntry).toHaveBeenCalledTimes(2);
  });

  it('shows a keep-one-item alert and does not refetch when the component is the entry\'s last one', async () => {
    (getLogEntry as jest.Mock).mockResolvedValue({ ...BASE_ENTRY, componentCount: 2 });
    (getMealComponents as jest.Mock).mockResolvedValue([COMPONENT]);
    (deleteMealComponentAndReaggregate as jest.Mock).mockResolvedValue('last');

    const { findByTestId } = await render(<EditEntryScreen />);
    await fireEvent.press(await findByTestId('component-delete-c1'));

    expect(deleteMealComponentAndReaggregate).toHaveBeenCalledWith('c1');
    expect(getLogEntry).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Keep at least one item',
      'A meal needs one item — delete the whole entry instead.',
    );
  });

  it('clears the "In this meal" list once a delete leaves the entry with one component', async () => {
    (getLogEntry as jest.Mock)
      .mockResolvedValueOnce({ ...BASE_ENTRY, componentCount: 2 })
      .mockResolvedValueOnce({ ...BASE_ENTRY, componentCount: 1 });
    (getMealComponents as jest.Mock).mockResolvedValue([COMPONENT]);
    (deleteMealComponentAndReaggregate as jest.Mock).mockResolvedValue('deleted');

    const { findByTestId, queryByText, queryByTestId } = await render(<EditEntryScreen />);
    expect(await findByTestId('component-delete-c1')).toBeTruthy();

    await fireEvent.press(await findByTestId('component-delete-c1'));

    await waitFor(() => {
      expect(queryByText('In this meal')).toBeNull();
    });
    expect(queryByTestId('component-row-c1')).toBeNull();
  });
});

describe('EditEntryScreen watched-ingredient banner', () => {
  const SOY_WATCH: WatchlistItem = { id: 'w1', term: 'soy', createdAt: 0 };

  it('does not render the banner when nothing is watched', async () => {
    (getLogEntry as jest.Mock).mockResolvedValue({ ...BASE_ENTRY, tagsJson: '["soybeans"]' });
    const { queryByText, findByText } = await render(<EditEntryScreen />);
    await findByText('Lunch');
    expect(queryByText('Contains a watched ingredient')).toBeNull();
  });

  it('does not render the banner when watched terms exist but none match', async () => {
    useWatchlistStore.setState({ items: [SOY_WATCH], loaded: true });
    (getLogEntry as jest.Mock).mockResolvedValue({ ...BASE_ENTRY, tagsJson: '["onion"]' });
    const { queryByText, findByText } = await render(<EditEntryScreen />);
    await findByText('Lunch');
    expect(queryByText('Contains a watched ingredient')).toBeNull();
  });

  it('renders the banner naming the matched term and tag when they differ', async () => {
    useWatchlistStore.setState({ items: [SOY_WATCH], loaded: true });
    (getLogEntry as jest.Mock).mockResolvedValue({ ...BASE_ENTRY, tagsJson: '["soybeans"]' });
    const { findByText } = await render(<EditEntryScreen />);
    expect(await findByText('Contains a watched ingredient')).toBeTruthy();
    expect(await findByText('soy — matched: soybeans')).toBeTruthy();
  });
});
