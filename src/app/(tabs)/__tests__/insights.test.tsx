import type { ReactElement } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { NutrientOutcomeFinding, OutcomeFinding } from '@/features/analysis/insights';
import InsightsScreen, { nutrientSentence, outcomeSentence } from '../insights';

let mockEntries: unknown[] = [];
jest.mock('@/features/logging/useEntries', () => ({
  useAllEntries: () => mockEntries,
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// The Watchlist section/finding-card Watch button pull from db/repository via
// the watchlist store — mock it so this screen test never touches the real
// (native-only) expo-sqlite client.
jest.mock('@/db/repository', () => ({
  listWatchlistItems: jest.fn().mockResolvedValue([]),
  addWatchlistItem: jest.fn(),
  removeWatchlistItem: jest.fn(),
}));

const TEST_INSETS: Metrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderScreen(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={TEST_INSETS}>{ui}</SafeAreaProvider>);
}

const HOUR = 60 * 60 * 1000;

const baseEntry = {
  mealSlot: null,
  barcode: null,
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
};

beforeEach(() => {
  mockPush.mockClear();
});

describe('sentence helpers', () => {
  it('outcomeSentence describes hits vs occurrences as percentages', () => {
    const finding: OutcomeFinding = {
      key: 'onion',
      label: 'onion',
      occurrences: 5,
      hits: 3,
      hitRate: 0.6,
      baseRate: 0.4,
      confidence: 'medium',
    };
    expect(outcomeSentence(finding)).toBe(
      '3 of 5 meals were followed by a rough outcome within 24 h (60% vs 40% baseline).',
    );
  });

  it('nutrientSentence describes the high/low outcome-rate split', () => {
    const finding: NutrientOutcomeFinding = {
      nutrient: 'fatG',
      thresholdValue: 28,
      highRate: 0.75,
      lowRate: 0.2,
      sampleSize: 4,
      confidence: 'high',
    };
    expect(nutrientSentence(finding)).toBe(
      'Meals higher in fat (≥ 28) are followed by a rough outcome 75% of the time, vs 20% for lighter meals.',
    );
  });
});

describe('InsightsScreen', () => {
  it('renders the empty state when there are no entries', async () => {
    mockEntries = [];
    const { getByText } = await renderScreen(<InsightsScreen />);
    expect(getByText('Not enough data yet')).toBeTruthy();
  });

  it('renders a confidence chip for an ingredient outcome finding', async () => {
    let seq = 0;
    const lactoseMeals = [0, 48 * HOUR, 96 * HOUR].map((loggedAt) => ({
      ...baseEntry,
      id: `m${seq++}`,
      type: 'meal',
      name: 'Food',
      loggedAt,
      tagsJson: '["lactose"]',
    }));
    const controlMeals = [500 * HOUR, 548 * HOUR, 596 * HOUR].map((loggedAt) => ({
      ...baseEntry,
      id: `c${seq++}`,
      type: 'meal',
      name: 'Food',
      loggedAt,
      tagsJson: '["rice"]',
    }));
    const outcomes = [1 * HOUR, 49 * HOUR, 97 * HOUR].map((loggedAt) => ({
      ...baseEntry,
      id: `o${seq++}`,
      type: 'symptom',
      name: 'Symptom',
      loggedAt,
      severity: 4,
    }));
    mockEntries = [...lactoseMeals, ...controlMeals, ...outcomes];

    const { getByText } = await renderScreen(<InsightsScreen />);
    expect(getByText('Ingredients linked to rough outcomes')).toBeTruthy();
    expect(getByText('lactose')).toBeTruthy();
    expect(getByText('Low confidence · 3 meals')).toBeTruthy();
  });

  it('renders the Digestion section when a BM entry is present', async () => {
    mockEntries = [
      {
        ...baseEntry,
        id: 'bm1',
        type: 'bowel_movement',
        name: 'BM',
        loggedAt: Date.now(),
        sentiment: null,
        bristolScale: 4,
      },
    ];

    const { getByText } = await renderScreen(<InsightsScreen />);
    expect(getByText('Digestion')).toBeTruthy();
  });

  it('does not render the Digestion section when there are no BM entries', async () => {
    mockEntries = [];
    const { queryByText } = await renderScreen(<InsightsScreen />);
    expect(queryByText('Digestion')).toBeNull();
  });

  it('renders the Rough outcomes section when a weekly bucket has a rough outcome', async () => {
    mockEntries = [
      {
        ...baseEntry,
        id: 'sym1',
        type: 'symptom',
        name: 'Cramps',
        loggedAt: Date.now(),
        severity: 4,
      },
    ];

    const { getByText } = await renderScreen(<InsightsScreen />);
    expect(getByText('Rough outcomes')).toBeTruthy();
  });

  it('does not render the Rough outcomes section when there are no rough outcomes', async () => {
    mockEntries = [];
    const { queryByText } = await renderScreen(<InsightsScreen />);
    expect(queryByText('Rough outcomes')).toBeNull();
  });

  it('renders the Intake section with a Calories block when calories are logged', async () => {
    mockEntries = [
      { ...baseEntry, id: 'm1', type: 'meal', name: 'Food', loggedAt: Date.now(), calories: 210 },
    ];

    const { getByText, queryByText } = await renderScreen(<InsightsScreen />);
    expect(getByText('Intake')).toBeTruthy();
    expect(getByText('Calories')).toBeTruthy();
    expect(queryByText('Fiber')).toBeNull();
  });

  it('does not render the Intake section when there is no nutrition data at all', async () => {
    mockEntries = [];
    const { queryByText } = await renderScreen(<InsightsScreen />);
    expect(queryByText('Intake')).toBeNull();
  });

  it('renders the empty-state body copy about logging symptoms and BMs', async () => {
    mockEntries = [];
    const { getByText } = await renderScreen(<InsightsScreen />);
    expect(
      getByText(
        'Keep logging meals — and log symptoms and bowel movements when they happen. Patterns appear once a few ingredients or foods have been followed by enough outcomes to compare.',
      ),
    ).toBeTruthy();
  });
});

describe('InsightsScreen finding drill-down (HANDOFF.md finding drill-down)', () => {
  function entries() {
    let seq = 0;
    // "Chicken Salad" x3: a recurring food followed by a symptom every time,
    // vs a "Rice" control that's never followed by one — surfaces as a
    // foodFinding (fixture shape proven in analysis/__tests__/insights.test.ts).
    const chickenSalad = [0, 48 * HOUR, 96 * HOUR].map((loggedAt) => ({
      ...baseEntry,
      id: `cs${seq++}`,
      type: 'meal',
      name: 'Chicken Salad',
      loggedAt,
    }));
    const rice = [500 * HOUR, 548 * HOUR, 596 * HOUR].map((loggedAt) => ({
      ...baseEntry,
      id: `r${seq++}`,
      type: 'meal',
      name: 'Rice',
      loggedAt,
    }));
    const outcomes = [1 * HOUR, 49 * HOUR, 97 * HOUR].map((loggedAt) => ({
      ...baseEntry,
      id: `o${seq++}`,
      type: 'symptom',
      name: 'Symptom',
      loggedAt,
      severity: 4,
    }));

    // A fatG median split (8 samples, 4/4) whose high-fat group is always
    // followed by an outcome, the low-fat group never is — surfaces as a
    // NutrientOutcomeFinding (fixture verified in analysis/__tests__/insights.test.ts: high confidence).
    const lowFat = [5, 8, 10, 12];
    const highFat = [40, 42, 45, 48];
    const nutrientEntries = [
      ...lowFat.map((fatG, i) => ({
        ...baseEntry,
        id: `low${seq++}`,
        type: 'meal',
        name: `low${i}`,
        loggedAt: i * 100 * HOUR,
        fatG,
      })),
      ...highFat.map((fatG, i) => {
        const loggedAt = 1000 * HOUR + i * 100 * HOUR;
        return {
          ...baseEntry,
          id: `high${seq++}`,
          type: 'meal',
          name: `high${i}`,
          loggedAt,
          fatG,
        };
      }),
      ...highFat.map((_fatG, i) => ({
        ...baseEntry,
        id: `highOutcome${seq++}`,
        type: 'symptom',
        name: 'Symptom',
        loggedAt: 1000 * HOUR + i * 100 * HOUR + HOUR,
        severity: 4,
      })),
    ];
    return [...chickenSalad, ...rice, ...outcomes, ...nutrientEntries];
  }

  it('a food-finding card exposes the "See all logs: …" label and pressing it pushes /insight/detail', async () => {
    mockEntries = entries();
    const { getByText, getByLabelText } = await renderScreen(<InsightsScreen />);

    expect(getByText('Foods linked to rough outcomes')).toBeTruthy();
    expect(getByText('Chicken Salad')).toBeTruthy();
    const card = getByLabelText('See all logs: Chicken Salad');
    await fireEvent.press(card);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/insight/detail',
      params: { kind: 'food', value: 'Chicken Salad' },
    });
  });

  it('a nutrient card has no "See all logs: …" label', async () => {
    mockEntries = entries();
    const { getByText, queryByLabelText } = await renderScreen(<InsightsScreen />);

    expect(getByText('Nutrients')).toBeTruthy();
    expect(queryByLabelText('See all logs: Higher fat')).toBeNull();
  });
});
