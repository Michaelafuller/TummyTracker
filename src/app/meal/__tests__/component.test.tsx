import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';

import { useComponentPrefillStore } from '@/features/logging/componentPrefillStore';
import { useMealBuilderStore } from '@/features/logging/mealBuilderStore';
import MealComponentScreen from '../component';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  jest.clearAllMocks();
  useMealBuilderStore.setState({ components: [] });
  useComponentPrefillStore.setState({ prefill: null });
});

describe('MealComponentScreen', () => {
  it('shows the confirm hint with no components added yet', async () => {
    const { getByText } = await render(<MealComponentScreen />, { wrapper });
    expect(getByText('Confirm this item, then add more or finish the meal.')).toBeTruthy();
  });

  it('"Add & scan next" pushes the draft into the builder store and returns to /scan', async () => {
    const { getByLabelText } = await render(<MealComponentScreen />, { wrapper });
    await fireEvent.changeText(getByLabelText('Component name'), 'Peas');
    await fireEvent.press(getByLabelText('Add & scan next'));
    expect(useMealBuilderStore.getState().components).toHaveLength(1);
    expect(useMealBuilderStore.getState().components[0].name).toBe('Peas');
    expect(mockReplace).toHaveBeenCalledWith('/scan');
  });

  it('"Finish meal" pushes the draft and navigates to /meal/review', async () => {
    const { getByLabelText } = await render(<MealComponentScreen />, { wrapper });
    await fireEvent.changeText(getByLabelText('Component name'), 'Rice');
    await fireEvent.press(getByLabelText('Finish meal'));
    expect(useMealBuilderStore.getState().components).toHaveLength(1);
    expect(mockReplace).toHaveBeenCalledWith('/meal/review');
  });

  it('prefills from the component prefill store (e.g. an OFF scan result)', async () => {
    useComponentPrefillStore.setState({ prefill: { name: 'Nutella', barcode: '123' } });
    const { getByDisplayValue } = await render(<MealComponentScreen />, { wrapper });
    expect(getByDisplayValue('Nutella')).toBeTruthy();
  });

  it('stamps sortOrder from the current builder-store length', async () => {
    useMealBuilderStore.setState({
      components: [
        {
          name: 'Peas',
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
        },
      ],
    });
    const { getByLabelText } = await render(<MealComponentScreen />, { wrapper });
    await fireEvent.changeText(getByLabelText('Component name'), 'Rice');
    await fireEvent.press(getByLabelText('Add & scan next'));
    expect(useMealBuilderStore.getState().components[1].sortOrder).toBe(1);
  });
});
