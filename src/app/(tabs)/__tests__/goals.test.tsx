import type { ReactElement } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { listGoals, removeGoal, upsertGoal } from '@/db/repository';
import type { Goal, LogEntry } from '@/db/schema';
import { useGoalsStore } from '@/features/goals/goalsStore';
import GoalsScreen from '../goals';

let mockEntries: LogEntry[] = [];
jest.mock('@/features/logging/useEntries', () => ({
  useAllEntries: () => mockEntries,
}));

jest.mock('@/db/repository', () => ({
  listGoals: jest.fn(),
  upsertGoal: jest.fn(),
  removeGoal: jest.fn(),
}));

// The check-in UI/service touches expo-notifications, which isn't relevant to
// this screen's tally/editor behavior — stub it out so these tests stay focused.
jest.mock('@/features/goals/checkInService', () => ({
  getCheckIn: jest.fn().mockResolvedValue({ enabled: false, hour: 20, minute: 0 }),
  ensureNotificationPermission: jest.fn(),
  refreshCheckIn: jest.fn(),
  disableCheckIn: jest.fn(),
  refreshCheckInIfEnabled: jest.fn().mockResolvedValue(undefined),
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
  useGoalsStore.setState({ goals: [], loaded: false });
  jest.clearAllMocks();
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

function goal(overrides: Partial<Goal> & { nutrient: Goal['nutrient']; direction: Goal['direction']; threshold: number }): Goal {
  return { id: `goal-${overrides.nutrient}`, createdAt: 0, ...overrides };
}

describe('GoalsScreen goal-aware tally progress', () => {
  it('renders a cap-exceeded total in the danger color', async () => {
    useGoalsStore.setState({ goals: [goal({ nutrient: 'fatG', direction: 'cap', threshold: 20 })], loaded: true });
    mockEntries = [entry({ type: 'meal', fatG: 25 })];
    const { getByText } = await renderScreen(<GoalsScreen />);
    expect(getByText('25g / 20g')).toHaveStyle({ color: Colors.light.danger });
  });

  it('renders a met floor in the positive color and an unmet floor in the neutral color', async () => {
    useGoalsStore.setState({
      goals: [
        goal({ nutrient: 'proteinG', direction: 'floor', threshold: 50 }),
        goal({ nutrient: 'fiberG', direction: 'floor', threshold: 30 }),
      ],
      loaded: true,
    });
    mockEntries = [entry({ type: 'meal', proteinG: 60, fiberG: 10 })];
    const { getByText } = await renderScreen(<GoalsScreen />);
    expect(getByText('60g / 50g')).toHaveStyle({ color: Colors.light.primary });
    expect(getByText('10g / 30g')).toHaveStyle({ color: Colors.light.textSecondary });
  });

  it('a cap still within budget renders in the positive color', async () => {
    useGoalsStore.setState({ goals: [goal({ nutrient: 'sugarG', direction: 'cap', threshold: 30 })], loaded: true });
    mockEntries = [entry({ type: 'meal', sugarG: 10 })];
    const { getByText } = await renderScreen(<GoalsScreen />);
    expect(getByText('10g / 30g')).toHaveStyle({ color: Colors.light.primary });
  });
});

describe('GoalsScreen goal editor', () => {
  it('setting a floor persists via the repository and shows on the row', async () => {
    (upsertGoal as jest.Mock).mockResolvedValue(undefined);
    (listGoals as jest.Mock).mockResolvedValue([goal({ nutrient: 'proteinG', direction: 'floor', threshold: 50 })]);

    const { getByLabelText, findByText } = await renderScreen(<GoalsScreen />);
    await fireEvent.press(getByLabelText('Protein goal: no goal set'));
    await fireEvent.changeText(getByLabelText('Set protein goal'), '50');
    await fireEvent.press(getByLabelText('Save protein goal'));

    expect(upsertGoal).toHaveBeenCalledWith('proteinG', 'floor', 50);
    expect(await findByText('≥ 50g')).toBeTruthy();
  });

  it('rejects an invalid threshold and does not call the repository', async () => {
    const { getByLabelText, findByText } = await renderScreen(<GoalsScreen />);
    await fireEvent.press(getByLabelText('Protein goal: no goal set'));
    await fireEvent.changeText(getByLabelText('Set protein goal'), '0');
    await fireEvent.press(getByLabelText('Save protein goal'));

    expect(await findByText('Enter a positive number.')).toBeTruthy();
    expect(upsertGoal).not.toHaveBeenCalled();
  });

  it('remove clears the row back to "No goal"', async () => {
    useGoalsStore.setState({ goals: [goal({ nutrient: 'proteinG', direction: 'floor', threshold: 50 })], loaded: true });
    (removeGoal as jest.Mock).mockResolvedValue(undefined);
    (listGoals as jest.Mock).mockResolvedValue([]);

    const { getByLabelText, findByLabelText } = await renderScreen(<GoalsScreen />);
    await fireEvent.press(getByLabelText('Protein goal: ≥ 50g'));
    await fireEvent.press(getByLabelText('Remove protein goal'));

    expect(removeGoal).toHaveBeenCalledWith('proteinG');
    expect(await findByLabelText('Protein goal: no goal set')).toBeTruthy();
  });
});
