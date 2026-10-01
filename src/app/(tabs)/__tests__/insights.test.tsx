import type { ReactElement } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { NutrientOutcomeFinding, OutcomeFinding } from '@/features/analysis/insights';
import InsightsScreen, { nutrientSentence, outcomeSentence } from '../insights';

let mockEntries: unknown[] = [];
let mockComponents: unknown[] = [];
jest.mock('@/features/logging/useEntries', () => ({
  useAllEntries: () => mockEntries,
  useAllMealComponents: () => mockComponents,
}));

let mockCheckIns: { date: string }[] = [];
jest.mock('@/features/checkin/useDayCheckIns', () => ({
  useDayCheckIns: () => mockCheckIns,
}));

// The Medications section and the confounder caveats (GitHub #20) read the
// medication tables through live-query hooks — mock them so this screen test
// never opens the real expo-sqlite client.
let mockMeds: unknown[] = [];
let mockMedEvents: unknown[] = [];
let mockMedDoses: unknown[] = [];
jest.mock('@/features/medications/useMedicationData', () => ({
  useMedications: () => mockMeds,
  useMedicationEvents: () => mockMedEvents,
  useMedicationDoses: () => mockMedDoses,
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

// The Watchlist section's "Start experiment" entry point (GitHub #19) reads
// the active experiment via a live-query hook that ultimately opens the real
// expo-sqlite client — mock it out the same way.
jest.mock('@/features/experiments/useExperiments', () => ({
  useActiveExperiment: () => undefined,
  useExperiments: () => [],
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
  mockComponents = [];
  mockCheckIns = [];
  mockMeds = [];
  mockMedEvents = [];
  mockMedDoses = [];
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

describe('day coverage line (GitHub #13)', () => {
  afterEach(() => {
    (Date.now as jest.Mock).mockRestore?.();
  });

  it('shows the coverage line (singular "day") for exactly one day of entries and no check-ins', async () => {
    const now = new Date(2026, 5, 15, 12, 0, 0, 0).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    mockEntries = [{ ...baseEntry, id: 'm1', type: 'meal', name: 'Food', loggedAt: now }];
    mockCheckIns = [];

    const { getByText } = await renderScreen(<InsightsScreen />);
    expect(getByText('Days covered: 1 of 1 (last 1 day) · 0 checked in')).toBeTruthy();
    expect(
      getByText('A day counts when you logged something or answered the day check-in.'),
    ).toBeTruthy();
  });

  it('includes a check-in day in the covered/checked-in counts (plural "days")', async () => {
    const now = new Date(2026, 5, 15, 12, 0, 0, 0).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    mockEntries = [{ ...baseEntry, id: 'm1', type: 'meal', name: 'Food', loggedAt: now }];
    mockCheckIns = [{ date: '2026-06-14' }];

    const { getByText } = await renderScreen(<InsightsScreen />);
    expect(getByText('Days covered: 2 of 2 (last 2 days) · 1 checked in')).toBeTruthy();
  });

  it('hides the coverage line when there is no activity at all', async () => {
    mockEntries = [];
    mockCheckIns = [];
    const { queryByText } = await renderScreen(<InsightsScreen />);
    expect(queryByText(/Days covered/)).toBeNull();
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

describe('medications in Insights (GitHub #20)', () => {
  const DAY_MS = 24 * HOUR;
  let seq = 0;

  function med(id: string, name: string) {
    return {
      id,
      name,
      defaultDose: null,
      doseUnit: null,
      frequency: null,
      startDate: null,
      endDate: null,
      isActive: true,
      notes: null,
      createdAt: 0,
      updatedAt: 0,
    };
  }

  function doseAt(medicationId: string, takenAt: number) {
    const eventId = `ev${seq++}`;
    mockMedEvents.push({ id: eventId, takenAt, timeKnown: true, notes: null, createdAt: 0, updatedAt: 0 });
    mockMedDoses.push({
      id: `do${seq++}`,
      eventId,
      medicationId,
      dose: 1,
      doseUnit: 'tablet',
      createdAt: 0,
      updatedAt: 0,
    });
  }

  /** Local noon of 2026-03-01 + `offset` days. */
  function dayAt(offset: number, hour = 12): number {
    return new Date(2026, 2, 1 + offset, hour).getTime();
  }

  /**
   * Ibuprofen fixture: 20 covered exposed days (a dose each day 0..19) with 12
   * rough, and 20 covered other days (100..119) with 5 rough. Every meal has a
   * unique name so no food finding can form.
   */
  function ibuprofenDays() {
    const rows: unknown[] = [];
    const add = (offset: number, rough: boolean) => {
      rows.push({ ...baseEntry, id: `d${seq++}`, type: 'meal', name: `Meal ${offset}`, loggedAt: dayAt(offset) });
      if (rough) {
        rows.push({
          ...baseEntry,
          id: `d${seq++}`,
          type: 'symptom',
          name: 'Symptom',
          loggedAt: dayAt(offset, 18),
          severity: 4,
        });
      }
    };
    for (let i = 0; i < 20; i++) add(i, i < 12);
    for (let i = 0; i < 20; i++) add(100 + i, i < 5);
    mockMeds = [med('ibu', 'Ibuprofen')];
    for (let i = 0; i < 20; i++) doseAt('ibu', dayAt(i));
    return rows;
  }

  function chickenFixture() {
    const rows: unknown[] = [];
    for (const [i, loggedAt] of [0, 48 * HOUR, 96 * HOUR].entries()) {
      rows.push({ ...baseEntry, id: `cs${i}`, type: 'meal', name: 'Chicken Salad', loggedAt });
      rows.push({
        ...baseEntry,
        id: `cso${i}`,
        type: 'symptom',
        name: 'Symptom',
        loggedAt: loggedAt + HOUR,
        severity: 4,
      });
    }
    for (const [i, loggedAt] of [500 * HOUR, 548 * HOUR, 596 * HOUR].entries()) {
      rows.push({ ...baseEntry, id: `r${i}`, type: 'meal', name: 'Rice', loggedAt });
    }
    return rows;
  }

  const FOOD_SENTENCE = '3 of 3 meals were followed by a rough outcome within 24 h (100% vs 50% baseline).';

  it('shows a medication finding card with the days chip, and the footer', async () => {
    mockEntries = ibuprofenDays();
    const { getByText } = await renderScreen(<InsightsScreen />);

    expect(getByText('Medications linked to rough days')).toBeTruthy();
    expect(getByText('Ibuprofen')).toBeTruthy();
    expect(getByText('12 of 20 days on or after Ibuprofen were rough (60% vs 25% on other logged days).')).toBeTruthy();
    expect(getByText('High confidence · 20 days')).toBeTruthy();
    expect(getByText("Days count only when you logged something. Linked doesn't mean caused.")).toBeTruthy();
  });

  it('uses the "during or within a week after" wording for an antibiotic', async () => {
    const rows: unknown[] = [];
    for (let i = 0; i < 8; i++) {
      rows.push({ ...baseEntry, id: `a${seq++}`, type: 'meal', name: `Meal ${i}`, loggedAt: dayAt(i) });
      if (i < 6) {
        rows.push({ ...baseEntry, id: `a${seq++}`, type: 'symptom', name: 'S', loggedAt: dayAt(i, 18), severity: 4 });
      }
    }
    for (let i = 0; i < 10; i++) {
      rows.push({ ...baseEntry, id: `a${seq++}`, type: 'meal', name: `Meal ${100 + i}`, loggedAt: dayAt(100 + i) });
      if (i < 1) {
        rows.push({ ...baseEntry, id: `a${seq++}`, type: 'symptom', name: 'S', loggedAt: dayAt(100, 18), severity: 4 });
      }
    }
    mockEntries = rows;
    mockMeds = [med('abx', 'Amoxicillin')];
    doseAt('abx', dayAt(0));
    const { getByText } = await renderScreen(<InsightsScreen />);

    expect(
      getByText('6 of 8 days during or within a week after Amoxicillin were rough (75% vs 10% on other logged days).'),
    ).toBeTruthy();
  });

  it('shows notes for a too-few-days and a nearly-every-day medication', async () => {
    // 2 logged days (a dose on day 0 covers day 0-1), and a daily medication over 30 covered days.
    const rows: unknown[] = [];
    for (let i = 0; i < 30; i++) {
      rows.push({ ...baseEntry, id: `n${seq++}`, type: 'meal', name: `Meal ${i}`, loggedAt: dayAt(i) });
    }
    mockEntries = rows;
    mockMeds = [med('ibu', 'Ibuprofen'), med('ome', 'Omeprazole')];
    doseAt('ibu', dayAt(0));
    for (let i = 0; i < 30; i++) doseAt('ome', dayAt(i));
    const { getByText } = await renderScreen(<InsightsScreen />);

    expect(getByText('Medications linked to rough days')).toBeTruthy();
    expect(getByText('Ibuprofen — only 2 logged days so far.')).toBeTruthy();
    expect(getByText("Omeprazole — taken nearly every day, so there's nothing to compare against.")).toBeTruthy();
  });

  it('hides the medications section when there are no doses', async () => {
    mockEntries = chickenFixture();
    mockMeds = [med('ibu', 'Ibuprofen')];
    const { queryByText } = await renderScreen(<InsightsScreen />);
    expect(queryByText('Medications linked to rough days')).toBeNull();
  });

  it('adds a caveat line to a food card when its rough outcomes overlap a medication, numbers unchanged', async () => {
    mockEntries = chickenFixture();
    const { getByText, queryByText, unmount } = await renderScreen(<InsightsScreen />);
    expect(getByText(FOOD_SENTENCE)).toBeTruthy();
    expect(queryByText(/were eaten while you were taking/)).toBeNull();
    await unmount();

    mockMeds = [med('amox', 'Amoxicillin')];
    doseAt('amox', 0);
    const withMed = await renderScreen(<InsightsScreen />);
    expect(withMed.getByText(FOOD_SENTENCE)).toBeTruthy();
    expect(withMed.getByText('Chicken Salad')).toBeTruthy();
    expect(withMed.getByText('Low confidence · 3 meals')).toBeTruthy();
    expect(withMed.getByText('3 of the 3 meals followed by a rough outcome were eaten while you were taking Amoxicillin.')).toBeTruthy();
  });

  it('adds a caveat line to an ingredient card too', async () => {
    const rows: unknown[] = [];
    for (const [i, loggedAt] of [0, 48 * HOUR, 96 * HOUR].entries()) {
      rows.push({ ...baseEntry, id: `t${i}`, type: 'meal', name: `Dish ${i}`, loggedAt, tagsJson: '["lactose"]' });
      rows.push({ ...baseEntry, id: `to${i}`, type: 'symptom', name: 'S', loggedAt: loggedAt + HOUR, severity: 4 });
    }
    for (const [i, loggedAt] of [500 * HOUR, 548 * HOUR, 596 * HOUR].entries()) {
      rows.push({ ...baseEntry, id: `tr${i}`, type: 'meal', name: `Other ${i}`, loggedAt, tagsJson: '["rice"]' });
    }
    mockEntries = rows;
    mockMeds = [med('amox', 'Amoxicillin')];
    doseAt('amox', 0);
    const { getByText } = await renderScreen(<InsightsScreen />);
    expect(getByText('Ingredients linked to rough outcomes')).toBeTruthy();
    expect(getByText('3 of the 3 meals followed by a rough outcome were eaten while you were taking Amoxicillin.')).toBeTruthy();
  });

  it('shows no caveat when the medication does not overlap the food outcomes', async () => {
    mockEntries = chickenFixture();
    mockMeds = [med('amox', 'Amoxicillin')];
    // A dose two years later: exposure never touches the chicken meals.
    doseAt('amox', 2 * 365 * DAY_MS + 1000 * DAY_MS);
    const { getByText, queryByText } = await renderScreen(<InsightsScreen />);
    expect(getByText(FOOD_SENTENCE)).toBeTruthy();
    expect(queryByText(/were eaten while you were taking/)).toBeNull();
  });
});

describe('reaction latency and slower patterns (GitHub #21)', () => {
  let seq = 0;
  function meal(name: string, tags: string, loggedAt: number) {
    return { ...baseEntry, id: `lm${seq++}`, type: 'meal', name, loggedAt, tagsJson: tags };
  }
  function symptom(loggedAt: number) {
    return { ...baseEntry, id: `ls${seq++}`, type: 'symptom', name: 'Symptom', loggedAt, severity: 4 };
  }
  /** One meal per delay, 48 h apart, each followed by a symptom `delay` hours later. */
  function triggerFixture(name: string, tags: string, delaysH: number[], spacingH: number) {
    return delaysH.flatMap((delay, i) => {
      const t = i * spacingH * HOUR;
      return [meal(name, tags, t), symptom(t + delay * HOUR)];
    });
  }
  function quiet(name: string, tags: string, count: number, startH: number) {
    return Array.from({ length: count }, (_, i) => meal(name, tags, (startH + i * 72) * HOUR));
  }

  it('shows the typical latency under an ingredient card with 3 or more hits', async () => {
    mockEntries = [
      ...triggerFixture('Food', '["lactose"]', [3, 5, 8], 48),
      ...quiet('Rice', '["rice"]', 3, 500),
    ];

    const { getByText, getAllByText } = await renderScreen(<InsightsScreen />);

    expect(getByText('Ingredients linked to rough outcomes')).toBeTruthy();
    // The ingredient card and the (same-named) food card both carry it.
    expect(getAllByText('Usually about 5 h later (3–8 h)')).toHaveLength(2);
  });

  it('shows no latency line when a finding has fewer than 3 hits', async () => {
    mockEntries = [
      ...triggerFixture('Food', '["lactose"]', [3, 5], 48),
      ...quiet('Food', '["lactose"]', 2, 300),
      ...quiet('Rice', '["rice"]', 4, 700),
    ];

    const { getByText, queryByText } = await renderScreen(<InsightsScreen />);

    expect(getByText('Ingredients linked to rough outcomes')).toBeTruthy();
    expect(queryByText(/^Usually/)).toBeNull();
  });

  it('shows a slower-patterns section for a ~30 h trigger, with 48 h wording and latency, and opens detail with window=48', async () => {
    mockEntries = [
      ...triggerFixture('Onion soup', '["onion"]', [26, 28, 30, 32, 34, 38], 72),
      ...quiet('Plain rice', '["rice"]', 6, 1000),
    ];

    const { getByText, getAllByText, getByLabelText, queryByText } = await renderScreen(<InsightsScreen />);

    // Nothing at 24 h ...
    expect(queryByText('Ingredients linked to rough outcomes')).toBeNull();
    expect(queryByText('Foods linked to rough outcomes')).toBeNull();
    expect(queryByText('Not enough data yet')).toBeNull();
    // ... but the guarded 48 h section picks it up.
    expect(getByText('Slower patterns (within 48 h)')).toBeTruthy();
    expect(
      getByText('These only show up when counting outcomes up to 48 hours after eating — slower reactions.'),
    ).toBeTruthy();
    expect(
      getAllByText('6 of 6 meals were followed by a rough outcome within 48 h (100% vs 50% baseline).'),
    ).toHaveLength(2);
    expect(getAllByText('Usually about 30 h later (28–34 h)')).toHaveLength(2);

    await fireEvent.press(getByLabelText('See all logs: onion'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/insight/detail',
      params: { kind: 'tag', value: 'onion', window: '48' },
    });
    await fireEvent.press(getByLabelText('See all logs: Onion soup'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/insight/detail',
      params: { kind: 'food', value: 'Onion soup', window: '48' },
    });
  });

  it('hides the slower-patterns section when the pattern already shows at 24 h', async () => {
    mockEntries = [
      ...triggerFixture('Onion soup', '["onion"]', [3, 3, 3, 3, 3, 3], 72),
      ...quiet('Plain rice', '["rice"]', 6, 1000),
    ];

    const { getByText, queryByText } = await renderScreen(<InsightsScreen />);

    expect(getByText('Ingredients linked to rough outcomes')).toBeTruthy();
    expect(queryByText(/Slower patterns/)).toBeNull();
  });
});

describe('dose-response line on food and ingredient cards (GitHub #22)', () => {
  let seq = 0;
  beforeEach(() => {
    seq = 0;
  });

  /**
   * One meal per `[servings, delayH]` pair, 72 h apart: delayH is the hours
   * until a symptom (null = no symptom). Each meal gets one component row
   * carrying the servings (and the tags, when given).
   */
  function dosedMeals(name: string, tags: string | null, spec: [number, number | null][], startH = 0) {
    const out: unknown[] = [];
    spec.forEach(([servings, delayH], i) => {
      const id = `dm${seq++}`;
      const loggedAt = (startH + i * 72) * HOUR;
      out.push({ ...baseEntry, id, type: 'meal', name, loggedAt, tagsJson: tags });
      mockComponents.push({
        id: `dc${seq++}`,
        entryId: id,
        name,
        barcode: null,
        servings,
        tagsJson: tags,
        sortOrder: 0,
        createdAt: 0,
      });
      if (delayH != null) {
        out.push({ ...baseEntry, id: `ds${seq++}`, type: 'symptom', name: 'Symptom', loggedAt: loggedAt + delayH * HOUR, severity: 4 });
      }
    });
    return out;
  }
  function quietRice(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      ...baseEntry,
      id: `qr${seq++}`,
      type: 'meal',
      name: 'Rice',
      loggedAt: (1000 + i * 72) * HOUR,
      tagsJson: '["rice"]',
    }));
  }

  // 8 Pasta meals: the four 2-serving ones are all followed by a symptom 3 h
  // later, the four 1-serving ones never are.
  const CLEAR: [number, number | null][] = [
    [1, null],
    [2, 3],
    [1, null],
    [2, 3],
    [1, null],
    [2, 3],
    [1, null],
    [2, 3],
  ];

  it('adds the dose line to a food card for a clear increase, leaving the existing numbers alone', async () => {
    mockEntries = [...dosedMeals('Pasta', null, CLEAR), ...quietRice(8)];

    const { getByText } = await renderScreen(<InsightsScreen />);

    expect(getByText('Foods linked to rough outcomes')).toBeTruthy();
    expect(getByText('4 of 8 meals were followed by a rough outcome within 24 h (50% vs 25% baseline).')).toBeTruthy();
    expect(getByText('More than 1.5 servings: 4 of 4 (100%) · 1.5 or less: 0 of 4 (0%)')).toBeTruthy();
  });

  it('adds "of foods with it" wording on an ingredient card', async () => {
    mockEntries = [...dosedMeals('Pasta', '["gluten"]', CLEAR), ...quietRice(8)];

    const { getByText, getAllByText } = await renderScreen(<InsightsScreen />);

    expect(getByText('Ingredients linked to rough outcomes')).toBeTruthy();
    expect(getByText('More than 1.5 servings of foods with it: 4 of 4 (100%) · 1.5 or less: 0 of 4 (0%)')).toBeTruthy();
    // ... and the same meals' food card uses the food wording.
    expect(getAllByText('More than 1.5 servings: 4 of 4 (100%) · 1.5 or less: 0 of 4 (0%)')).toHaveLength(1);
  });

  it('shows no dose line when every meal is one serving', async () => {
    mockEntries = [
      ...dosedMeals('Pasta', null, CLEAR.map(([, delay]): [number, number | null] => [1, delay])),
      ...quietRice(8),
    ];

    const { getByText, queryByText } = await renderScreen(<InsightsScreen />);

    expect(getByText('Foods linked to rough outcomes')).toBeTruthy();
    expect(queryByText(/More than/)).toBeNull();
  });

  it('shows no dose line without any component rows (flat entries count as 1)', async () => {
    mockEntries = [...dosedMeals('Pasta', null, CLEAR), ...quietRice(8)];
    mockComponents = [];

    const { getByText, queryByText } = await renderScreen(<InsightsScreen />);

    expect(getByText('Foods linked to rough outcomes')).toBeTruthy();
    expect(queryByText(/More than/)).toBeNull();
  });

  it('shows no dose line when the larger amounts are not clearly worse', async () => {
    // larger side 2 of 4 (50%) vs smaller 2 of 4 (50%)
    const flat: [number, number | null][] = [
      [1, 3],
      [2, 3],
      [1, 3],
      [2, 3],
      [1, null],
      [2, null],
      [1, null],
      [2, null],
    ];
    mockEntries = [...dosedMeals('Pasta', null, flat), ...quietRice(8)];

    const { getByText, queryByText } = await renderScreen(<InsightsScreen />);

    expect(getByText('Foods linked to rough outcomes')).toBeTruthy();
    expect(queryByText(/More than/)).toBeNull();
  });

  it('uses the 48 h instances on a slower-pattern card', async () => {
    // Symptoms ~30 h after the meal: invisible at 24 h, so only the slower
    // section shows it. 2-serving meals are always followed; 1-serving 2 of 4.
    const slow: [number, number | null][] = [
      [1, 30],
      [2, 30],
      [1, 30],
      [2, 30],
      [1, null],
      [2, 30],
      [1, null],
      [2, 30],
    ];
    mockEntries = [...dosedMeals('Onion soup', '["onion"]', slow), ...quietRice(8)];

    const { getByText, getAllByText, queryByText } = await renderScreen(<InsightsScreen />);

    expect(queryByText('Foods linked to rough outcomes')).toBeNull();
    expect(getByText('Slower patterns (within 48 h)')).toBeTruthy();
    // ingredient card + food card, both from the 48 h instances.
    expect(getAllByText(/^More than 1\.5 servings/)).toHaveLength(2);
    expect(getByText('More than 1.5 servings: 4 of 4 (100%) · 1.5 or less: 2 of 4 (50%)')).toBeTruthy();
  });
});
