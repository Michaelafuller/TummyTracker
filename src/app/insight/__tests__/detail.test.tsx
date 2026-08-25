import { render, fireEvent } from '@testing-library/react-native';

import type { LogEntry } from '@/db/schema';
import InsightDetailScreen from '../detail';

let mockParams: { kind?: string; value?: string } = { kind: 'food', value: 'Chicken Salad' };
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush }),
  Stack: { Screen: () => null },
}));

let mockEntries: unknown[] = [];
jest.mock('@/features/logging/useEntries', () => ({
  useAllEntries: () => mockEntries,
}));

let seq = 0;
function makeEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: `e${seq++}`,
    type: 'meal',
    mealSlot: null,
    name: 'Chicken Salad',
    barcode: null,
    loggedAt: 0,
    sentiment: null,
    bristolScale: null,
    symptomType: null,
    severity: null,
    notes: null,
    calories: null,
    fatG: null,
    saturatedFatG: null,
    carbsG: null,
    proteinG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    servingG: null,
    ingredientsText: null,
    tagsJson: null,
    componentCount: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const HOUR = 60 * 60 * 1000;
const T = 1000 * HOUR;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { kind: 'food', value: 'Chicken Salad' };
  mockEntries = [];
  seq = 0;
});

describe('InsightDetailScreen', () => {
  it('renders the summary line and a row for each matching instance', async () => {
    mockEntries = [
      makeEntry({ id: 'a', name: 'Chicken Salad', loggedAt: T, sentiment: 4 }),
      makeEntry({ id: 'b', name: 'Chicken Salad', loggedAt: T + HOUR, sentiment: null }),
    ];

    const { getByText } = await render(<InsightDetailScreen />);

    expect(getByText('2 logs · 1 rated · avg sentiment 4 · 0 followed by a rough outcome')).toBeTruthy();
    expect(getByText(/Chicken Salad · 🙂 satisfied/)).toBeTruthy();
    expect(getByText(/Chicken Salad · Not rated/)).toBeTruthy();
  });

  it('shows the outcome line only on flagged rows', async () => {
    mockEntries = [
      makeEntry({ id: 'a', name: 'Chicken Salad', loggedAt: T, sentiment: null }),
      makeEntry({ id: 'b', type: 'symptom', name: 'Cramps', severity: 4, loggedAt: T + HOUR }),
    ];

    const { getByText, queryAllByText } = await render(<InsightDetailScreen />);

    expect(getByText('Rough outcome within 24 h')).toBeTruthy();
    expect(queryAllByText('Rough outcome within 24 h')).toHaveLength(1);
  });

  it('pressing a row pushes to the entry edit screen', async () => {
    mockEntries = [makeEntry({ id: 'e42', name: 'Chicken Salad', loggedAt: T })];

    const { getByLabelText } = await render(<InsightDetailScreen />);
    await fireEvent.press(getByLabelText(/Open Chicken Salad,/));

    expect(mockPush).toHaveBeenCalledWith('/entry/e42');
  });

  it('shows the empty state when params are valid but nothing matches', async () => {
    mockEntries = [makeEntry({ id: 'a', name: 'Something Else', loggedAt: T })];

    const { getByText } = await render(<InsightDetailScreen />);

    expect(getByText('No matching logs.')).toBeTruthy();
  });

  it('shows the invalid-params fallback for an unrecognized kind', async () => {
    mockParams = { kind: 'bogus', value: 'Chicken Salad' };

    const { getByText } = await render(<InsightDetailScreen />);

    expect(getByText('Nothing to show')).toBeTruthy();
  });

  it('shows the invalid-params fallback for an empty value', async () => {
    mockParams = { kind: 'food', value: '' };

    const { getByText } = await render(<InsightDetailScreen />);

    expect(getByText('Nothing to show')).toBeTruthy();
  });
});
