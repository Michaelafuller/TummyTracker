import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';

import type { MealComponent } from '@/db/schema';
import {
  deleteMealComponentAndReaggregate,
  getMealComponent,
  updateMealComponentAndReaggregate,
} from '@/db/repository';
import EditComponentScreen from '../[componentId]';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ componentId: 'c1' }),
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('@/db/repository', () => ({
  getMealComponent: jest.fn(),
  updateMealComponentAndReaggregate: jest.fn(),
  deleteMealComponentAndReaggregate: jest.fn(),
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

describe('EditComponentScreen delete', () => {
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

  it('confirming delete calls deleteMealComponentAndReaggregate with the id, then navigates back', async () => {
    (getMealComponent as jest.Mock).mockResolvedValue(COMPONENT);
    (deleteMealComponentAndReaggregate as jest.Mock).mockResolvedValue('deleted');
    const { findByLabelText, getByTestId } = await render(<EditComponentScreen />, { wrapper });
    await findByLabelText('Component name');
    await fireEvent.press(getByTestId('component-delete'));

    expect(deleteMealComponentAndReaggregate).toHaveBeenCalledWith('c1');
    expect(mockBack).toHaveBeenCalled();
  });

  it('a \'last\' result shows the keep-one-item alert and does not navigate back', async () => {
    (getMealComponent as jest.Mock).mockResolvedValue(COMPONENT);
    (deleteMealComponentAndReaggregate as jest.Mock).mockResolvedValue('last');
    const { findByLabelText, getByTestId } = await render(<EditComponentScreen />, { wrapper });
    await findByLabelText('Component name');
    await fireEvent.press(getByTestId('component-delete'));

    expect(deleteMealComponentAndReaggregate).toHaveBeenCalledWith('c1');
    expect(mockBack).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Keep at least one item',
      'A meal needs one item — delete the whole entry instead.',
    );
  });
});
