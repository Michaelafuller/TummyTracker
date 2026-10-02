import { createElement as mockCreateElement, useEffect as mockUseEffect } from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { getMealComponents, listRecentFoodEntries } from '@/db/repository';
import type { LogEntry, Medication, SavedMeal, SavedMealComponent } from '@/db/schema';
import { useMealBuilderStore } from '@/features/logging/mealBuilderStore';
import { groupSavedMeals, type SavedMealWithComponents } from '@/lib/savedMeals';
import QuickLogScreen from '../quick-log';

const mockPush = jest.fn();
let mockParams: Record<string, string | undefined> = {};
const mockScreenOptions = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockParams,
  // No NavigationContainer here — approximate useFocusEffect as "run on mount".
  useFocusEffect: (effect: () => void | (() => void)) => mockUseEffect(effect, []),
  Stack: {
    Screen: (props: { options?: unknown }) => {
      mockScreenOptions(props.options);
      return mockCreateElement('Screen');
    },
  },
}));

jest.mock('@/db/repository', () => ({
  listRecentFoodEntries: jest.fn(),
  getMealComponents: jest.fn(),
  createMedicationEvent: jest.fn(),
  deleteMedicationEvent: jest.fn(),
}));

let mockSavedMeals: SavedMealWithComponents[] = [];
jest.mock('@/features/logging/useSavedMeals', () => ({
  useSavedMeals: () => mockSavedMeals,
}));

let mockMedications: Medication[] = [];
jest.mock('@/features/medications/useMedicationData', () => ({
  useMedications: () => mockMedications,
}));

const RECENT: LogEntry = {
  id: 'e1',
  type: 'meal',
  mealSlot: 'dinner',
  name: 'Pasta',
  barcode: null,
  loggedAt: 1000,
  sentiment: null,
  bristolScale: null,
  symptomType: null,
  severity: null,
  notes: null,
  ingredientsText: null,
  tagsJson: null,
  calories: null,
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

function savedMeal(id: string, name: string, mealSlot: SavedMeal['mealSlot']): SavedMeal {
  return { id, name, nameKey: name.toLowerCase(), type: 'meal', mealSlot, createdAt: 1, updatedAt: 1 };
}

function savedComponent(id: string, savedMealId: string, name: string): SavedMealComponent {
  return {
    id,
    savedMealId,
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
    createdAt: 1,
  };
}

function setMeals() {
  mockSavedMeals = groupSavedMeals(
    [
      savedMeal('m1', 'Apple pie', 'dinner'),
      savedMeal('m2', 'Toast', 'breakfast'),
      savedMeal('m3', 'Bagel', 'breakfast'),
      savedMeal('m4', 'Soup', null),
    ],
    [
      savedComponent('c1', 'm1', 'Apple'),
      savedComponent('c2', 'm2', 'Bread'),
      savedComponent('c3', 'm3', 'Bagel'),
      savedComponent('c4', 'm4', 'Broth'),
    ],
  );
}

function regularMed(): Medication {
  return {
    id: 'med1',
    name: 'Levothyroxine',
    defaultDose: 50,
    doseUnit: 'mcg',
    frequency: null,
    startDate: null,
    endDate: null,
    isActive: true,
    isRegular: true,
    notes: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { slot: 'breakfast' };
  mockSavedMeals = [];
  mockMedications = [];
  (listRecentFoodEntries as jest.Mock).mockResolvedValue([RECENT]);
  (getMealComponents as jest.Mock).mockResolvedValue([]);
  useMealBuilderStore.setState({ components: [], reviewPrefill: null, editingSavedMealId: null });
});

function myMealRowIds(nodes: readonly { props: object }[]): string[] {
  return nodes.map((node) => (node.props as { testID: string }).testID);
}

describe('QuickLogScreen (GitHub #26)', () => {
  it('titles the screen for the slot and shows My meals (slot first, no Edit) above Recent', async () => {
    setMeals();
    const { getAllByTestId, queryByLabelText, findByLabelText, getByText, toJSON } = await render(
      <QuickLogScreen />,
    );
    await findByLabelText('Re-log Pasta');

    expect(mockScreenOptions).toHaveBeenCalledWith({ title: 'Log breakfast' });
    expect(getByText('My meals')).toBeTruthy();
    expect(myMealRowIds(getAllByTestId(/^quick-my-meal-/))).toEqual([
      'quick-my-meal-bagel',
      'quick-my-meal-toast',
      'quick-my-meal-apple-pie',
      'quick-my-meal-soup',
    ]);
    expect(queryByLabelText('Edit Toast')).toBeNull();

    const tree = JSON.stringify(toJSON());
    expect(tree.indexOf('my-meals-section')).toBeLessThan(tree.indexOf('Search past foods'));
  });

  it('tapping a saved meal opens the review with the screen\'s slot, even when the meal has another', async () => {
    setMeals();
    const { getByTestId } = await render(<QuickLogScreen />);

    // "Apple pie" is saved as a dinner; the breakfast reminder wins.
    await fireEvent.press(getByTestId('quick-my-meal-apple-pie'));

    expect(mockPush).toHaveBeenCalledWith('/meal/review');
    const { components, reviewPrefill, editingSavedMealId } = useMealBuilderStore.getState();
    expect(components.map((c) => c.name)).toEqual(['Apple']);
    expect(reviewPrefill).toEqual({ name: 'Apple pie', type: 'meal', mealSlot: 'breakfast' });
    expect(editingSavedMealId).toBeNull();
  });

  it('tapping a Recent row also applies the slot', async () => {
    mockParams = { slot: 'lunch' };
    const { findByLabelText } = await render(<QuickLogScreen />);
    await fireEvent.press(await findByLabelText('Re-log Pasta'));

    expect(mockPush).toHaveBeenCalledWith('/meal/review');
    expect(useMealBuilderStore.getState().reviewPrefill).toMatchObject({ name: 'Pasta', mealSlot: 'lunch' });
  });

  it('with a missing or invalid slot it is a plain "Quick log": A-Z and each meal keeps its own slot', async () => {
    setMeals();
    for (const params of [{}, { slot: 'snack' }, { slot: 'nonsense' }]) {
      mockParams = params;
      mockScreenOptions.mockClear();
      const { getAllByTestId, getByTestId, unmount } = await render(<QuickLogScreen />);
      expect(mockScreenOptions).toHaveBeenCalledWith({ title: 'Quick log' });
      expect(myMealRowIds(getAllByTestId(/^quick-my-meal-/))).toEqual([
        'quick-my-meal-apple-pie',
        'quick-my-meal-bagel',
        'quick-my-meal-soup',
        'quick-my-meal-toast',
      ]);
      await fireEvent.press(getByTestId('quick-my-meal-apple-pie'));
      expect(useMealBuilderStore.getState().reviewPrefill?.mealSlot).toBe('dinner');
      await unmount();
    }
  });

  it('shows "Took my regular meds" only when a regular medication exists', async () => {
    const without = await render(<QuickLogScreen />);
    expect(without.queryByTestId('regular-meds-log')).toBeNull();
    await without.unmount();

    mockMedications = [regularMed()];
    const withMeds = await render(<QuickLogScreen />);
    expect(await withMeds.findByTestId('regular-meds-log')).toBeTruthy();
  });

  it('"Scan barcode" and "Add manually" start an empty builder that carries the slot into the review', async () => {
    useMealBuilderStore.setState({
      components: [{ name: 'Stale' } as never],
      reviewPrefill: { name: 'Stale', mealSlot: 'dinner' },
    });
    const { getByTestId } = await render(<QuickLogScreen />);

    await fireEvent.press(getByTestId('quick-scan'));
    expect(mockPush).toHaveBeenLastCalledWith('/scan');
    expect(useMealBuilderStore.getState().components).toEqual([]);
    expect(useMealBuilderStore.getState().reviewPrefill).toEqual({ mealSlot: 'breakfast' });

    useMealBuilderStore.setState({ components: [{ name: 'Stale' } as never] });
    await fireEvent.press(getByTestId('quick-manual'));
    expect(mockPush).toHaveBeenLastCalledWith('/meal/component');
    expect(useMealBuilderStore.getState().components).toEqual([]);
    expect(useMealBuilderStore.getState().reviewPrefill).toEqual({ mealSlot: 'breakfast' });
  });

  it('with no slot, "Scan barcode" clears the builder completely', async () => {
    mockParams = {};
    useMealBuilderStore.setState({ components: [{ name: 'Stale' } as never], reviewPrefill: { mealSlot: 'dinner' } });
    const { getByTestId } = await render(<QuickLogScreen />);

    await fireEvent.press(getByTestId('quick-scan'));
    expect(useMealBuilderStore.getState().components).toEqual([]);
    expect(useMealBuilderStore.getState().reviewPrefill).toBeNull();
  });

  it('omits the Recent section when there are no recent foods', async () => {
    (listRecentFoodEntries as jest.Mock).mockResolvedValue([]);
    const { queryByTestId, getByTestId } = await render(<QuickLogScreen />);
    expect(getByTestId('quick-scan')).toBeTruthy();
    expect(queryByTestId('quick-recent-section')).toBeNull();
  });
});
