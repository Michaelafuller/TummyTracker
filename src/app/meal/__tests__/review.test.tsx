import { fireEvent, render } from '@testing-library/react-native';

import { createMealWithComponents } from '@/db/repository';
import type { Goal, LogEntry, WatchlistItem } from '@/db/schema';
import { refreshCheckInIfEnabled } from '@/features/goals/checkInService';
import { useGoalsStore } from '@/features/goals/goalsStore';
import { useMealBuilderStore } from '@/features/logging/mealBuilderStore';
import { useWatchlistStore } from '@/features/watchlist/watchlistStore';
import type { MealComponentDraft } from '@/lib/mealAggregate';
import MealReviewScreen from '../review';

const mockDismissAll = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ dismissAll: mockDismissAll }),
}));

jest.mock('@/db/repository', () => ({
  createMealWithComponents: jest.fn().mockResolvedValue(undefined),
  listWatchlistItems: jest.fn(),
  addWatchlistItem: jest.fn(),
  removeWatchlistItem: jest.fn(),
}));

// The check-in refresh touches expo-notifications, irrelevant to this screen's
// own save/notice behavior — stub it out and just assert it gets kicked off.
jest.mock('@/features/goals/checkInService', () => ({
  refreshCheckInIfEnabled: jest.fn().mockResolvedValue(undefined),
}));

let mockAllEntries: LogEntry[] = [];
jest.mock('@/features/logging/useEntries', () => ({
  useAllEntries: () => mockAllEntries,
}));

function draft(name: string, overrides: Partial<MealComponentDraft> = {}): MealComponentDraft {
  return {
    name,
    barcode: null,
    servings: 1,
    servingG: null,
    calories: null,
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
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useMealBuilderStore.setState({ components: [draft('Peas', { calories: 100 }), draft('Rice', { calories: 200 })] });
  useWatchlistStore.setState({ items: [], loaded: false });
  useGoalsStore.setState({ goals: [], loaded: false });
  mockAllEntries = [];
});

describe('MealReviewScreen', () => {
  it('lists each component with a testID row', async () => {
    const { getByTestId } = await render(<MealReviewScreen />);
    expect(getByTestId('component-0')).toBeTruthy();
    expect(getByTestId('component-1')).toBeTruthy();
  });

  it('prefills the meal name from defaultMealName', async () => {
    const { getByDisplayValue } = await render(<MealReviewScreen />);
    expect(getByDisplayValue('Peas + 1 more')).toBeTruthy();
  });

  it('removing a component drops its row', async () => {
    const { getByLabelText, queryByTestId } = await render(<MealReviewScreen />);
    await fireEvent.press(getByLabelText('Remove Rice from meal'));
    expect(queryByTestId('component-1')).toBeNull();
  });

  it('saves via createMealWithComponents and clears the builder store', async () => {
    const { getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.press(getByLabelText('Save meal'));
    expect(createMealWithComponents).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Peas + 1 more' }),
      expect.arrayContaining([expect.objectContaining({ name: 'Peas' }), expect.objectContaining({ name: 'Rice' })]),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useMealBuilderStore.getState().components).toEqual([]);
    expect(mockDismissAll).toHaveBeenCalled();
  });

  it('does not save when the meal name is cleared', async () => {
    const { getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.changeText(getByLabelText('Meal name'), '');
    await fireEvent.press(getByLabelText('Save meal'));
    expect(createMealWithComponents).not.toHaveBeenCalled();
  });
});

describe('MealReviewScreen watched-ingredient notice', () => {
  const SOY_WATCH: WatchlistItem = { id: 'w1', term: 'soy', createdAt: 0 };

  it('does not render when nothing is watched', async () => {
    const { queryByText } = await render(<MealReviewScreen />);
    expect(queryByText('Contains a watched ingredient')).toBeNull();
  });

  it('does not render when a watched term matches no component tag', async () => {
    useWatchlistStore.setState({ items: [SOY_WATCH], loaded: true });
    const { queryByText } = await render(<MealReviewScreen />);
    expect(queryByText('Contains a watched ingredient')).toBeNull();
  });

  it('renders the notice when a component tag matches a watched term', async () => {
    useWatchlistStore.setState({ items: [SOY_WATCH], loaded: true });
    useMealBuilderStore.setState({
      components: [draft('Tofu', { tagsJson: '["soybeans"]' }), draft('Rice')],
    });
    const { findByText } = await render(<MealReviewScreen />);
    expect(await findByText('Contains a watched ingredient')).toBeTruthy();
    expect(await findByText('soy — matched: soybeans')).toBeTruthy();
  });

  it('does not block saving while the notice is showing', async () => {
    useWatchlistStore.setState({ items: [SOY_WATCH], loaded: true });
    useMealBuilderStore.setState({
      components: [draft('Tofu', { tagsJson: '["soybeans"]' }), draft('Rice')],
    });
    const { getByLabelText, findByText } = await render(<MealReviewScreen />);
    expect(await findByText('Contains a watched ingredient')).toBeTruthy();
    await fireEvent.press(getByLabelText('Save meal'));
    expect(createMealWithComponents).toHaveBeenCalled();
  });
});

function goal(overrides: Partial<Goal> & Pick<Goal, 'nutrient' | 'direction' | 'threshold'>): Goal {
  return { id: `g-${overrides.nutrient}`, createdAt: 0, ...overrides };
}

const TODAY_ENTRY_BASE: Omit<LogEntry, 'id' | 'type' | 'loggedAt'> = {
  mealSlot: null,
  name: 'Food',
  barcode: null,
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
};

function todayEntry(overrides: Partial<LogEntry> & { type: LogEntry['type'] }): LogEntry {
  return { ...TODAY_ENTRY_BASE, id: `today-${Math.random()}`, loggedAt: Date.now(), ...overrides };
}

describe('MealReviewScreen save-time cap notice', () => {
  // Default beforeEach components are Peas(calories:100) + Rice(calories:200) = 300 aggregate calories.

  it('does not render when no cap would be exceeded', async () => {
    const { queryByText } = await render(<MealReviewScreen />);
    expect(queryByText('This save goes over a goal')).toBeNull();
  });

  it('renders when the pending meal alone would push a nutrient over its cap', async () => {
    useGoalsStore.setState({
      goals: [goal({ nutrient: 'calories', direction: 'cap', threshold: 250 })],
      loaded: true,
    });
    const { findByText } = await render(<MealReviewScreen />);
    expect(await findByText('This save goes over a goal')).toBeTruthy();
    expect(await findByText('Saving puts calories at 300 — over your 250 cap')).toBeTruthy();
  });

  it('adds entries already logged today to the pending meal before judging the cap', async () => {
    useGoalsStore.setState({
      goals: [goal({ nutrient: 'calories', direction: 'cap', threshold: 250 })],
      loaded: true,
    });
    mockAllEntries = [todayEntry({ type: 'meal', calories: 100 })];
    const { findByText } = await render(<MealReviewScreen />);
    // 100 already logged today + 300 pending = 400, over the 250 cap.
    expect(await findByText('Saving puts calories at 400 — over your 250 cap')).toBeTruthy();
  });

  it('does not render when the total would stay within the cap', async () => {
    useGoalsStore.setState({
      goals: [goal({ nutrient: 'calories', direction: 'cap', threshold: 1000 })],
      loaded: true,
    });
    const { queryByText } = await render(<MealReviewScreen />);
    expect(queryByText('This save goes over a goal')).toBeNull();
  });

  it('does not block saving while the cap notice is showing', async () => {
    useGoalsStore.setState({
      goals: [goal({ nutrient: 'calories', direction: 'cap', threshold: 250 })],
      loaded: true,
    });
    const { getByLabelText, findByText } = await render(<MealReviewScreen />);
    expect(await findByText('This save goes over a goal')).toBeTruthy();
    await fireEvent.press(getByLabelText('Save meal'));
    expect(createMealWithComponents).toHaveBeenCalled();
  });
});

describe('MealReviewScreen check-in refresh', () => {
  it('re-arms the check-in after a successful save', async () => {
    const { getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.press(getByLabelText('Save meal'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refreshCheckInIfEnabled).toHaveBeenCalled();
  });

  it('does not refresh the check-in when the save is rejected by validation', async () => {
    const { getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.changeText(getByLabelText('Meal name'), '');
    await fireEvent.press(getByLabelText('Save meal'));
    expect(refreshCheckInIfEnabled).not.toHaveBeenCalled();
  });
});
