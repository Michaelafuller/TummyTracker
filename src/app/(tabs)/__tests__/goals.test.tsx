import type { ReactElement } from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { LogEntry } from '@/db/schema';
import GoalsScreen from '../goals';

let mockEntries: LogEntry[] = [];
jest.mock('@/features/logging/useEntries', () => ({
  useAllEntries: () => mockEntries,
}));

const TEST_INSETS: Metrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderScreen(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={TEST_INSETS}>{ui}</SafeAreaProvider>);
}

let seq = 0;

const BASE: Omit<LogEntry, 'id' | 'type' | 'loggedAt'> = {
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

/** Builds a LogEntry logged "now" (within today's local day bounds) unless overridden. */
function entry(overrides: Partial<LogEntry> & { type: LogEntry['type'] }): LogEntry {
  return { ...BASE, id: `e${seq++}`, loggedAt: Date.now(), ...overrides };
}

beforeEach(() => {
  seq = 0;
  mockEntries = [];
});

describe('GoalsScreen', () => {
  it('renders the empty state when there are no entries today', async () => {
    mockEntries = [];
    const { getByText } = await renderScreen(<GoalsScreen />);
    expect(getByText('Nothing logged yet today')).toBeTruthy();
  });

  it('renders totals from mocked entries', async () => {
    mockEntries = [
      entry({ type: 'meal', calories: 300, proteinG: 20 }),
      entry({ type: 'snack', calories: 150, proteinG: 5 }),
    ];
    const { getByText } = await renderScreen(<GoalsScreen />);
    expect(getByText('From 2 entries today')).toBeTruthy();
    expect(getByText('450')).toBeTruthy(); // calories total
    expect(getByText('25')).toBeTruthy(); // protein total
  });

  it('shows the missing-data caveat only for nutrients with a null value', async () => {
    mockEntries = [
      entry({ type: 'meal', calories: 300, carbsG: null }),
      entry({ type: 'meal', calories: 200, carbsG: 10 }),
    ];
    const { getByText, queryByText } = await renderScreen(<GoalsScreen />);
    // Carbs has one missing entry -> caveat shown.
    expect(getByText('1 entry missing')).toBeTruthy();
    // Calories has no missing entries -> no caveat text anywhere.
    expect(queryByText('0 entries missing')).toBeNull();
  });

  it('excludes non-today and non-food entries from the tally', async () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    mockEntries = [
      entry({ type: 'meal', calories: 500, loggedAt: twoDaysAgo }), // not today
      entry({ type: 'bowel_movement', bristolScale: 4 }), // not food
      entry({ type: 'meal', calories: 100 }), // counted
    ];
    const { getByText } = await renderScreen(<GoalsScreen />);
    expect(getByText('From 1 entry today')).toBeTruthy();
    expect(getByText('100')).toBeTruthy();
  });
});
