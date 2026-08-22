import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';

import type { MealComponent } from '@/db/schema';
import { getMealComponent, updateMealComponentAndReaggregate } from '@/db/repository';
import EditComponentScreen from '../[componentId]';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ componentId: 'c1' }),
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('@/db/repository', () => ({
  getMealComponent: jest.fn(),
  updateMealComponentAndReaggregate: jest.fn(),
}));

// ComponentForm fires an OFF name-search via react-query; give it a client.
function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

const COMPONENT: MealComponent = {
  id: 'c1',
  entryId: 'e1',
  name: 'Peas',
  barcode: null,
  servings: 2,
  servingG: 150,
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
});

describe('EditComponentScreen', () => {
  it('renders the prefilled name and servings from the saved row', async () => {
    (getMealComponent as jest.Mock).mockResolvedValue(COMPONENT);
    const { findByDisplayValue } = await render(<EditComponentScreen />, { wrapper });
    expect(await findByDisplayValue('Peas')).toBeTruthy();
    expect(await findByDisplayValue('2')).toBeTruthy();
  });

  it('shows a not-found state when the component is missing', async () => {
    (getMealComponent as jest.Mock).mockResolvedValue(undefined);
    const { findByText } = await render(<EditComponentScreen />, { wrapper });
    expect(await findByText('Component not found')).toBeTruthy();
  });

  it('editing servings and saving calls updateMealComponentAndReaggregate with the new draft, then navigates back', async () => {
    (getMealComponent as jest.Mock).mockResolvedValue(COMPONENT);
    (updateMealComponentAndReaggregate as jest.Mock).mockResolvedValue(undefined);
    const { findByLabelText, getByLabelText } = await render(<EditComponentScreen />, { wrapper });
    await findByLabelText('Component name');
    await fireEvent.changeText(getByLabelText('Servings'), '3');
    await fireEvent.press(getByLabelText('Save changes'));

    expect(updateMealComponentAndReaggregate).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ name: 'Peas', servings: 3, sortOrder: 0 }),
    );
    expect(mockBack).toHaveBeenCalled();
  });
});
