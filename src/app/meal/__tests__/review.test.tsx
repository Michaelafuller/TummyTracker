import { fireEvent, render } from '@testing-library/react-native';

import { createMealWithComponents } from '@/db/repository';
import { useMealBuilderStore } from '@/features/logging/mealBuilderStore';
import type { MealComponentDraft } from '@/lib/mealAggregate';
import MealReviewScreen from '../review';

const mockDismissAll = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ dismissAll: mockDismissAll }),
}));

jest.mock('@/db/repository', () => ({
  createMealWithComponents: jest.fn().mockResolvedValue(undefined),
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
