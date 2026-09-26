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
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ dismissAll: mockDismissAll, push: mockPush }),
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
  useMealBuilderStore.setState({
    components: [draft('Peas', { calories: 100 }), draft('Rice', { calories: 200 })],
    reviewPrefill: null,
  });
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

  it('stepping servings up rescales the row and the aggregate', async () => {
    const { getByLabelText, getByTestId, getByText } = await render(<MealReviewScreen />);
    expect(getByTestId('component-1-kcal')).toHaveTextContent('200 kcal');
    await fireEvent.press(getByLabelText('Increase servings of Rice'));
    expect(getByTestId('component-1-servings-value')).toHaveTextContent('1.5×');
    expect(getByTestId('component-1-kcal')).toHaveTextContent('300 kcal');
    expect(getByText('Aggregate: 400 kcal')).toBeTruthy();
  });

  it('stops stepping down at half a serving', async () => {
    const { getByLabelText, getByTestId } = await render(<MealReviewScreen />);
    const decrease = getByLabelText('Decrease servings of Peas');
    await fireEvent.press(decrease);
    expect(getByTestId('component-0-servings-value')).toHaveTextContent('0.5×');
    expect(getByLabelText('Decrease servings of Peas')).toBeDisabled();
  });

  it('saves the adjusted servings on the component rows', async () => {
    const { getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.press(getByLabelText('Increase servings of Rice'));
    await fireEvent.press(getByLabelText('Increase servings of Rice'));
    await fireEvent.press(getByLabelText('Save meal'));
    expect(createMealWithComponents).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ name: 'Peas', servings: 1 }), expect.objectContaining({ name: 'Rice', servings: 2 })],
    );
  });

  it('does not save when the meal name is cleared', async () => {
    const { getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.changeText(getByLabelText('Meal name'), '');
    await fireEvent.press(getByLabelText('Save meal'));
    expect(createMealWithComponents).not.toHaveBeenCalled();
  });

  it('"Add item to this meal" pushes /scan', async () => {
    const { getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.press(getByLabelText('Add item to this meal'));
    expect(mockPush).toHaveBeenCalledWith('/scan');
  });
});

describe('MealReviewScreen reviewPrefill (re-log from history)', () => {
  it('populates the name field and meal slot from reviewPrefill', async () => {
    useMealBuilderStore.setState({
      components: [draft('Oatmeal', { calories: 150 })],
      reviewPrefill: { name: 'Oatmeal', type: 'meal', mealSlot: 'breakfast' },
    });
    const { getByDisplayValue, getByLabelText } = await render(<MealReviewScreen />);
    expect(getByDisplayValue('Oatmeal')).toBeTruthy();
    expect(getByLabelText('Breakfast').props.accessibilityState.selected).toBe(true);
  });

  it('saving a loaded draft (original + an added item) calls createMealWithComponents once, creating never updating', async () => {
    useMealBuilderStore.setState({
      components: [draft('Oatmeal', { calories: 150 }), draft('Banana', { calories: 90 })],
      reviewPrefill: { name: 'Oatmeal', type: 'meal', mealSlot: 'breakfast' },
    });
    const { getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.press(getByLabelText('Save meal'));
    expect(createMealWithComponents).toHaveBeenCalledTimes(1);
    expect(createMealWithComponents).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Oatmeal' }),
      expect.arrayContaining([
        expect.objectContaining({ name: 'Oatmeal' }),
        expect.objectContaining({ name: 'Banana' }),
      ]),
    );
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
