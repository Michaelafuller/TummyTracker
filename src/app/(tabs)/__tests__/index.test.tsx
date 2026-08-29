import { useEffect as mockUseEffect } from 'react';
import { render } from '@testing-library/react-native';

import { listRecentFoodEntries } from '@/db/repository';
import type { LogEntry } from '@/db/schema';
import HomeScreen from '../index';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useRouter: () => ({ push: mockPush }),
  // No NavigationContainer in these tests, so the real useFocusEffect (which
  // needs navigation context) would throw. Approximate it as "run once on
  // mount" — sufficient to exercise the initial fetch this screen does.
  useFocusEffect: (effect: () => void | (() => void)) => mockUseEffect(effect, []),
}));

jest.mock('@/db/repository', () => ({
  listRecentFoodEntries: jest.fn(),
}));

const BASE_ENTRY: LogEntry = {
  id: 'e1',
  type: 'meal',
  mealSlot: 'breakfast',
  name: 'Oatmeal',
  barcode: null,
  loggedAt: 1000,
  sentiment: null,
  bristolScale: null,
  symptomType: null,
  severity: null,
  notes: null,
  ingredientsText: null,
  tagsJson: null,
  calories: 150,
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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('HomeScreen', () => {
  it('renders the CTAs with no recent entries', async () => {
    (listRecentFoodEntries as jest.Mock).mockResolvedValue([]);
    const { getByLabelText } = await render(<HomeScreen />);
    expect(getByLabelText('Scan a barcode')).toBeTruthy();
    expect(getByLabelText('Add an entry manually')).toBeTruthy();
  });

  it('renders the recents section and its search input inside the keyboard-shift wrapper', async () => {
    (listRecentFoodEntries as jest.Mock).mockResolvedValue([BASE_ENTRY]);
    const { findByTestId, getByLabelText } = await render(<HomeScreen />);

    const shiftView = await findByTestId('home-keyboard-shift');
    const searchInput = getByLabelText('Search past foods');
    // The recents section (and its search input) must render inside the
    // keyboard-shift wrapper so the keyboard-avoiding padding actually covers
    // it (Milestone A3 — the Home search field used to sit under the keyboard).
    expect(shiftView).toContainElement(searchInput);
  });
});
