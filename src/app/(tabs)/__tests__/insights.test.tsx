import type { ReactElement } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type {
  FoodFinding,
  NutrientFinding,
  PairFinding,
  TagFinding,
  TemporalFinding,
} from '@/features/analysis/insights';
import InsightsScreen, {
  foodSentence,
  ingredientSentence,
  nutrientSentence,
  pairSentence,
  temporalSentence,
} from '../insights';

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

beforeEach(() => {
  mockPush.mockClear();
});

describe('sentence helpers', () => {
  it('nutrientSentence describes the high/low split', () => {
    const finding: NutrientFinding = {
      nutrient: 'fatG',
      thresholdValue: 28,
      highAvgSentiment: 1.5,
      lowAvgSentiment: 4.5,
      sampleSize: 6,
      confidence: 'medium',
    };
    expect(nutrientSentence(finding)).toBe(
      'Meals higher in fat (≥ 28) average a sentiment of 1.5, versus 4.5 otherwise.',
    );
  });

  it('foodSentence describes the delta against the baseline', () => {
    const finding: FoodFinding = {
      name: 'Chicken Salad',
      avgSentiment: 2.3,
      baselineAvg: 4.7,
      delta: -2.3,
      occurrences: 3,
      confidence: 'low',
      sentimentCounts: [0, 2, 1, 0, 0],
    };
    expect(foodSentence(finding)).toBe('Chicken Salad averages 2.3 vs your usual 4.7, across 3 logs.');
  });

  it('ingredientSentence describes the delta against the baseline', () => {
    const finding: TagFinding = {
      tag: 'gluten',
      avgSentiment: 1.7,
      baselineAvg: 4.2,
      delta: -2.5,
      occurrences: 3,
      confidence: 'low',
      sentimentCounts: [1, 2, 0, 0, 0],
    };
    expect(ingredientSentence(finding)).toBe(
      'Averages 1.7 vs your usual 4.2, across 3 meals containing this ingredient.',
    );
  });

  it('pairSentence names both tags and the delta against the baseline', () => {
    const finding: PairFinding = {
      tags: ['milk', 'onion'],
      avgSentiment: 1,
      baselineAvg: 3.3,
      delta: -2.3,
      occurrences: 3,
      confidence: 'low',
      sentimentCounts: [3, 0, 0, 0, 0],
    };
    expect(pairSentence(finding)).toBe('milk + onion together average 1 vs your usual 3.3, across 3 meals.');
  });

  it('temporalSentence describes hit rate vs baseline as percentages', () => {
    const finding: TemporalFinding = {
      tag: 'onion',
      meals: 5,
      hits: 3,
      hitRate: 0.6,
      baseRate: 0.4,
      confidence: 'medium',
    };
    expect(temporalSentence(finding)).toBe(
      '3 of 5 meals with this ingredient were followed by a rough outcome within 24 h (60% vs 40% baseline).',
    );
  });
});

describe('InsightsScreen', () => {
  it('renders the empty state when there are no entries', async () => {
    mockEntries = [];
    const { getByText } = await renderScreen(<InsightsScreen />);
    expect(getByText('Not enough data yet')).toBeTruthy();
  });

  it('renders a confidence chip and histogram for an ingredient finding', async () => {
    let seq = 0;
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
      componentCount: null,
      createdAt: 0,
      updatedAt: 0,
    };
    const gluten = [1, 2, 2].map((sentiment) => ({
      ...baseEntry,
      id: `g${seq++}`,
      type: 'meal',
      name: 'Food',
      loggedAt: 0,
      sentiment,
      tagsJson: '["gluten"]',
    }));
    const control = [5, 5, 5, 4, 4].map((sentiment) => ({
      ...baseEntry,
      id: `c${seq++}`,
      type: 'meal',
      name: 'Food',
      loggedAt: 0,
      sentiment,
      tagsJson: null,
    }));
    mockEntries = [...gluten, ...control];

    const { getByText } = await renderScreen(<InsightsScreen />);
    expect(getByText('Ingredients you react to')).toBeTruthy();
    expect(getByText('gluten')).toBeTruthy();
    expect(getByText('Low confidence · 3 meals')).toBeTruthy();
  });

  it('renders the Digestion section when a BM entry is present', async () => {
    const baseEntry = {
      mealSlot: null,
      barcode: null,
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

  it('renders the Intake section with a Calories block when calories are logged', async () => {
    const baseEntry = {
      mealSlot: null,
      barcode: null,
      bristolScale: null,
      symptomType: null,
      severity: null,
      notes: null,
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
    mockEntries = [
      { ...baseEntry, id: 'm1', type: 'meal', name: 'Food', loggedAt: Date.now(), sentiment: null, calories: 210 },
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
});

describe('InsightsScreen finding drill-down (HANDOFF.md finding drill-down)', () => {
  const baseEntry = {
    mealSlot: null,
    barcode: null,
    bristolScale: null,
    symptomType: null,
    severity: null,
    notes: null,
    calories: null,
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

  function entries() {
    let seq = 0;
    // Chicken Salad: a recurring low-sentiment food (3 occurrences, sentiment 1)
    // — surfaces as a foodFinding against the baseline set by the fatG entries below.
    const chickenSalad = [1, 1, 1].map((sentiment) => ({
      ...baseEntry,
      id: `cs${seq++}`,
      type: 'meal',
      name: 'Chicken Salad',
      loggedAt: 0,
      sentiment,
      fatG: null,
    }));
    // A fatG median split (12 samples, 6/6) whose high-fat group averages a
    // meaningfully lower sentiment — surfaces as a NutrientFinding (fixture
    // verified in analysis/__tests__/insights.test.ts: medium confidence).
    const lowFat = [5, 8, 10, 12, 14, 16];
    const lowSentiments = [5, 5, 4, 4, 5, 4];
    const highFat = [40, 42, 45, 48, 50, 55];
    const highSentiments = [2, 1, 2, 1, 2, 1];
    const nutrientEntries = [
      ...lowFat.map((fatG, i) => ({
        ...baseEntry,
        id: `low${seq++}`,
        type: 'meal',
        name: `low${i}`,
        loggedAt: 0,
        fatG,
        sentiment: lowSentiments[i],
      })),
      ...highFat.map((fatG, i) => ({
        ...baseEntry,
        id: `high${seq++}`,
        type: 'meal',
        name: `high${i}`,
        loggedAt: 0,
        fatG,
        sentiment: highSentiments[i],
      })),
    ];
    return [...chickenSalad, ...nutrientEntries];
  }

  it('a food-finding card exposes the "See all logs: …" label and pressing it pushes /insight/detail', async () => {
    mockEntries = entries();
    const { getByText, getByLabelText } = await renderScreen(<InsightsScreen />);

    expect(getByText('Foods you rate poorly')).toBeTruthy();
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
