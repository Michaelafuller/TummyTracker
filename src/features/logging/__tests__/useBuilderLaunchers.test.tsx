import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { getMealComponents } from '@/db/repository';
import type { LogEntry, SavedMeal, SavedMealComponent } from '@/db/schema';
import { groupSavedMeals, type SavedMealWithComponents } from '@/lib/savedMeals';
import { useMealBuilderStore } from '../mealBuilderStore';
import { useBuilderLaunchers } from '../useBuilderLaunchers';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/db/repository', () => ({
  getMealComponents: jest.fn(),
}));

const ENTRY: LogEntry = {
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

function savedItem(mealSlot: SavedMeal['mealSlot']): SavedMealWithComponents {
  const meal: SavedMeal = {
    id: 'm1',
    name: 'Oatmeal',
    nameKey: 'oatmeal',
    type: 'meal',
    mealSlot,
    createdAt: 1,
    updatedAt: 1,
  };
  const component: SavedMealComponent = {
    id: 'c1',
    savedMealId: 'm1',
    name: 'Oats',
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
  return groupSavedMeals([meal], [component])[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  (getMealComponents as jest.Mock).mockResolvedValue([]);
  useMealBuilderStore.setState({ components: [], reviewPrefill: null, editingSavedMealId: null });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('useBuilderLaunchers', () => {
  it('with no override, a My meals tap keeps the meal\'s own slot and opens the review', async () => {
    const { result } = await renderHook(() => useBuilderLaunchers());
    await act(async () => {
      result.current.onMyMealTap(savedItem('dinner'));
    });

    expect(mockPush).toHaveBeenCalledWith('/meal/review');
    const { components, reviewPrefill, editingSavedMealId } = useMealBuilderStore.getState();
    expect(components.map((c) => c.name)).toEqual(['Oats']);
    expect(reviewPrefill).toEqual({ name: 'Oatmeal', type: 'meal', mealSlot: 'dinner' });
    expect(editingSavedMealId).toBeNull();
  });

  it('a slot override replaces the saved meal\'s slot (and fills a missing one)', async () => {
    const { result } = await renderHook(() => useBuilderLaunchers({ slot: 'breakfast' }));
    await act(async () => {
      result.current.onMyMealTap(savedItem('dinner'));
    });
    expect(useMealBuilderStore.getState().reviewPrefill?.mealSlot).toBe('breakfast');

    await act(async () => {
      result.current.onMyMealTap(savedItem(null));
    });
    expect(useMealBuilderStore.getState().reviewPrefill?.mealSlot).toBe('breakfast');
  });

  it('a slot override also applies to a Recent tap; no override keeps the entry\'s slot', async () => {
    const overridden = await renderHook(() => useBuilderLaunchers({ slot: 'lunch' }));
    await act(async () => {
      await overridden.result.current.onRecentTap(ENTRY);
    });
    expect(useMealBuilderStore.getState().reviewPrefill).toMatchObject({ name: 'Pasta', mealSlot: 'lunch' });
    expect(mockPush).toHaveBeenCalledWith('/meal/review');

    const plain = await renderHook(() => useBuilderLaunchers());
    await act(async () => {
      await plain.result.current.onRecentTap(ENTRY);
    });
    expect(useMealBuilderStore.getState().reviewPrefill?.mealSlot).toBe('dinner');
  });

  it('Edit never takes the override and enters template mode', async () => {
    const { result } = await renderHook(() => useBuilderLaunchers({ slot: 'breakfast' }));
    await act(async () => {
      result.current.onMyMealEdit(savedItem('dinner'));
    });
    const { reviewPrefill, editingSavedMealId } = useMealBuilderStore.getState();
    expect(editingSavedMealId).toBe('m1');
    expect(reviewPrefill?.mealSlot).toBe('dinner');
  });

  it('a second Recent tap while the first load is pending is ignored; the guard resets afterwards', async () => {
    let resolveLoad: (rows: unknown[]) => void = () => {};
    (getMealComponents as jest.Mock).mockImplementationOnce(
      () => new Promise((resolve) => (resolveLoad = resolve)),
    );
    const { result } = await renderHook(() => useBuilderLaunchers());

    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.onRecentTap(ENTRY);
      void result.current.onRecentTap({ ...ENTRY, id: 'e2' });
      resolveLoad([]);
      await first;
    });

    expect(getMealComponents).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.onRecentTap(ENTRY);
    });
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it('shows an alert and does not navigate when loading a Recent fails', async () => {
    (getMealComponents as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const { result } = await renderHook(() => useBuilderLaunchers());
    await act(async () => {
      await result.current.onRecentTap(ENTRY);
    });
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
