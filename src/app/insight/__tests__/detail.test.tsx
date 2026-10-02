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
let mockComponents: unknown[] = [];
jest.mock('@/features/logging/useEntries', () => ({
  useAllEntries: () => mockEntries,
  useAllMealComponents: () => mockComponents,
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
  mockComponents = [];
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

describe('InsightDetailScreen — By amount (GitHub #22)', () => {
  /**
   * One meal per `[servings, followed]` pair, 72 h apart; each followed one
   * gets a symptom 3 h later. A component row carries the servings (and tags).
   */
  function dosedMeals(spec: [number, boolean][], name = 'Chicken Salad', tagsJson: string | null = null) {
    const entries: LogEntry[] = [];
    spec.forEach(([servings, followed], i) => {
      const t = T + i * 72 * HOUR;
      const meal = makeEntry({ id: `dm${i}`, name, tagsJson, loggedAt: t });
      entries.push(meal);
      mockComponents.push({ id: `dc${i}`, entryId: meal.id, name, servings, tagsJson, sortOrder: 0 });
      if (followed) {
        entries.push(makeEntry({ type: 'symptom', name: 'Cramps', severity: 4, loggedAt: t + 3 * HOUR }));
      }
    });
    return entries;
  }

  // 11 meals: six at 1 serving (one followed), five at 2 servings (four followed).
  const SPLIT: [number, boolean][] = [
    [1, false],
    [1, false],
    [1, false],
    [1, false],
    [1, false],
    [1, true],
    [2, true],
    [2, true],
    [2, true],
    [2, true],
    [2, false],
  ];

  it('shows the split numbers, with no verdict text', async () => {
    mockEntries = dosedMeals(SPLIT);

    const { getByText, queryByText } = await render(<InsightDetailScreen />);

    expect(getByText('By amount')).toBeTruthy();
    expect(getByText('More than 1 serving: 4 of 5 meals followed by a rough outcome (80%)')).toBeTruthy();
    expect(getByText('1 serving or less: 1 of 6 meals followed by a rough outcome (17%)')).toBeTruthy();
    expect(queryByText(/fine|safe|cause/i)).toBeNull();
    // the existing summary is unchanged
    expect(getByText('11 logs · 5 followed by a rough outcome within 24 h')).toBeTruthy();
  });

  it('shows each meal amount on its row', async () => {
    mockEntries = dosedMeals(SPLIT);

    const { getAllByText } = await render(<InsightDetailScreen />);

    expect(getAllByText('1 serving')).toHaveLength(6);
    expect(getAllByText('2 servings')).toHaveLength(5);
  });

  it('hides the block and the per-meal amounts when every meal is one serving', async () => {
    mockEntries = dosedMeals(SPLIT.map(([, followed]): [number, boolean] => [1, followed]));

    const { queryByText } = await render(<InsightDetailScreen />);

    expect(queryByText('By amount')).toBeNull();
    expect(queryByText('1 serving')).toBeNull();
  });

  it('hides the block when a side has fewer than 4 meals', async () => {
    mockEntries = dosedMeals([
      ...SPLIT.slice(0, 6),
      [2, true],
      [2, true],
      [2, true],
    ]);

    const { queryByText } = await render(<InsightDetailScreen />);

    expect(queryByText('By amount')).toBeNull();
  });

  it('an ingredient finding uses the servings of the components carrying the tag', async () => {
    mockParams = { kind: 'tag', value: 'onion' };
    mockEntries = dosedMeals(SPLIT, 'Stew', '["onion"]');
    // an unrelated, larger component in each meal must not count toward the onion amount
    mockEntries.forEach((entry, i) => {
      const e = entry as LogEntry;
      if (e.type === 'meal') {
        mockComponents.push({ id: `x${i}`, entryId: e.id, name: 'Rice', servings: 9, tagsJson: '["rice"]', sortOrder: 1 });
      }
    });

    const { getByText } = await render(<InsightDetailScreen />);

    expect(getByText('By amount')).toBeTruthy();
    expect(getByText('More than 1 serving: 4 of 5 meals followed by a rough outcome (80%)')).toBeTruthy();
    expect(getByText('Amounts are servings of the foods that contain it.')).toBeTruthy();
  });

  it('uses the 48 h instances on a slower-pattern detail', async () => {
    mockParams = { kind: 'food', value: 'Chicken Salad', window: '48' };
    // symptoms 3 h later count either way; add two meals whose symptom is 30 h later
    mockEntries = dosedMeals(SPLIT.slice(0, 11));
    const late = makeEntry({ id: 'late', name: 'Chicken Salad', loggedAt: T + 20 * 72 * HOUR });
    mockEntries.push(late, makeEntry({ type: 'symptom', name: 'Cramps', severity: 4, loggedAt: late.loggedAt + 30 * HOUR }));
    mockComponents.push({ id: 'dlate', entryId: 'late', name: 'x', servings: 1, tagsJson: null, sortOrder: 0 });

    const { getByText } = await render(<InsightDetailScreen />);

    // 12 meals now: 7 at 1 serving (2 followed), 5 at 2 servings (4 followed)
    expect(getByText('1 serving or less: 2 of 7 meals followed by a rough outcome (29%)')).toBeTruthy();
  });
});
