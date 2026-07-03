import { render } from '@testing-library/react-native';

import type { LogEntry, MealComponent } from '@/db/schema';
import { getLogEntry, getMealComponents } from '@/db/repository';
import EditEntryScreen from '../[id]';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'e1' }),
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('@/db/repository', () => ({
  getLogEntry: jest.fn(),
  getMealComponents: jest.fn(),
  updateLogEntry: jest.fn(),
  deleteLogEntry: jest.fn(),
}));

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
});
