import { render, fireEvent } from '@testing-library/react-native';

import type { LogEntry } from '@/db/schema';
import InsightDetailScreen from '../detail';

let mockParams: { kind?: string; value?: string; window?: string } = { kind: 'food', value: 'Chicken Salad' };
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
      makeEntry({ id: 'a', name: 'Chicken Salad', loggedAt: T }),
      makeEntry({ id: 'b', name: 'Chicken Salad', loggedAt: T + HOUR }),
    ];

    const { getByText, getAllByText } = await render(<InsightDetailScreen />);

    expect(getByText('2 logs · 0 followed by a rough outcome within 24 h')).toBeTruthy();
    expect(getAllByText('Chicken Salad')).toHaveLength(2);
  });

  it('shows the outcome line only on flagged rows', async () => {
    mockEntries = [
      makeEntry({ id: 'a', name: 'Chicken Salad', loggedAt: T }),
      makeEntry({ id: 'b', type: 'symptom', name: 'Cramps', severity: 4, loggedAt: T + HOUR }),
    ];

    const { getByText, queryAllByText } = await render(<InsightDetailScreen />);

    expect(getByText('1 logs · 1 followed by a rough outcome within 24 h')).toBeTruthy();
    expect(getByText('Rough outcome 1 h later')).toBeTruthy();
    expect(queryAllByText(/^Rough outcome/)).toHaveLength(1);
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

describe('InsightDetailScreen — latency, window and timing profile (#21)', () => {
  /** `delays.length` meals 72 h apart, each followed by a symptom `delays[i]` hours later. */
  function mealsWithDelays(delays: number[], name = 'Chicken Salad', tagsJson: string | null = null) {
    const entries: LogEntry[] = [];
    delays.forEach((delay, i) => {
      const t = T + i * 72 * HOUR;
      entries.push(makeEntry({ name, tagsJson, loggedAt: t }));
      entries.push(makeEntry({ type: 'symptom', name: 'Cramps', severity: 4, loggedAt: t + delay * HOUR }));
    });
    return entries;
  }

  it('shows the latency line under the summary with 3 or more hits', async () => {
    mockEntries = mealsWithDelays([2, 4, 6]);

    const { getByText } = await render(<InsightDetailScreen />);

    expect(getByText('3 logs · 3 followed by a rough outcome within 24 h')).toBeTruthy();
    expect(getByText('Usually about 4 h later (2–6 h)')).toBeTruthy();
  });

  it('hides the latency line with fewer than 3 hits', async () => {
    mockEntries = mealsWithDelays([2, 4]);

    const { queryByText } = await render(<InsightDetailScreen />);

    expect(queryByText(/^Usually/)).toBeNull();
  });

  it('labels each meal row with its delay, or within the hour', async () => {
    mockEntries = mealsWithDelays([5, 0.5]);

    const { getByText } = await render(<InsightDetailScreen />);

    expect(getByText('Rough outcome 5 h later')).toBeTruthy();
    expect(getByText('Rough outcome within the hour')).toBeTruthy();
  });

  it('by default (24 h) a 30 h reaction is not counted', async () => {
    mockEntries = mealsWithDelays([30]);

    const { getByText, queryByText } = await render(<InsightDetailScreen />);

    expect(getByText('1 logs · 0 followed by a rough outcome within 24 h')).toBeTruthy();
    expect(queryByText(/^Rough outcome/)).toBeNull();
  });

  it('window=48 counts a 30 h reaction and says "within 48 h"', async () => {
    mockParams = { kind: 'food', value: 'Chicken Salad', window: '48' };
    mockEntries = mealsWithDelays([30]);

    const { getByText } = await render(<InsightDetailScreen />);

    expect(getByText('1 logs · 1 followed by a rough outcome within 48 h')).toBeTruthy();
    expect(getByText('Rough outcome 30 h later')).toBeTruthy();
  });

  it('shows the timing profile at 6 / 24 / 48 / 72 h with baselines and the caution note', async () => {
    mockEntries = mealsWithDelays([30]);
    const { getByText } = await render(<InsightDetailScreen />);
    expect(getByText('How the pattern changes with time')).toBeTruthy();
    expect(getByText('Within 6 h: 0 of 1 meal (0%) · baseline 0%')).toBeTruthy();
    expect(getByText('Within 24 h: 0 of 1 meal (0%) · baseline 0%')).toBeTruthy();
    expect(getByText('Within 48 h: 1 of 1 meal (100%) · baseline 100%')).toBeTruthy();
    expect(getByText('Within 72 h: 1 of 1 meal (100%) · baseline 100%')).toBeTruthy();
    expect(getByText('Longer windows catch slower reactions but also more unrelated rough days.')).toBeTruthy();
  });

  it('builds the profile for a tag finding from the tag grouping, against the all-meals baseline', async () => {
    mockParams = { kind: 'tag', value: 'onion' };
    mockEntries = [
      ...mealsWithDelays([3, 3], 'Soup', '["onion"]'),
      makeEntry({ name: 'Rice', tagsJson: '["rice"]', loggedAt: T + 1000 * HOUR }),
      makeEntry({ name: 'Rice', tagsJson: '["rice"]', loggedAt: T + 1100 * HOUR }),
    ];

    const { getByText } = await render(<InsightDetailScreen />);

    // 2 of 2 onion meals hit within 6 h; 2 of the 4 tagged meals overall.
    expect(getByText('Within 6 h: 2 of 2 meals (100%) · baseline 50%')).toBeTruthy();
  });
});
