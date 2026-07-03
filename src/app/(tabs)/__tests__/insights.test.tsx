import type { ReactElement } from 'react';
import { render } from '@testing-library/react-native';
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

const TEST_INSETS: Metrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderScreen(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={TEST_INSETS}>{ui}</SafeAreaProvider>);
}

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
});
