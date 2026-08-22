import type { ReactElement } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { listGoals, removeGoal, upsertGoal } from '@/db/repository';
import type { Goal, LogEntry } from '@/db/schema';
import { disableCheckIn, ensureNotificationPermission, getCheckIn, refreshCheckIn } from '@/features/goals/checkInService';
import { useGoalsStore } from '@/features/goals/goalsStore';
import { usePrefsStore } from '@/features/prefs/prefsStore';
import GoalsScreen from '../goals';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

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
  usePrefsStore.setState({
    offlineMode: false,
    checkInEnabled: false,
    checkInHour: 20,
    checkInMinute: 0,
    checkInAdoptedV1: false,
    loaded: false,
  });
  jest.clearAllMocks();
  (getCheckIn as jest.Mock).mockResolvedValue({ enabled: false, hour: 20, minute: 0 });
});

describe('GoalsScreen', () => {
  it('renders a "Today" header with a long date, and drops the old "Today · " prefix', async () => {
    const { getByText, queryByText } = await renderScreen(<GoalsScreen />);
    expect(getByText('Today')).toBeTruthy();
    const dateNode = getByText(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
    expect(dateNode).toBeTruthy();
    expect(queryByText(/^Today · /)).toBeNull();
  });

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

describe('GoalsScreen tally row drill-down', () => {
  function fatEntries() {
    const now = Date.now();
    const t0 = now - 60_000; // earlier today
    const t1 = now; // later today
    return {
      t0,
      t1,
      entries: [
        entry({ type: 'meal', name: 'Burger', fatG: 30, loggedAt: t1 }),
        entry({ type: 'meal', name: 'Salad', fatG: 5, loggedAt: t0 }),
        entry({ type: 'meal', name: 'Tea', fatG: null, loggedAt: t0 }),
      ],
    };
  }

  it('tapping a tally row shows the entries behind its total, sorted by value desc, with missing entries as "no data"', async () => {
    const { entries } = fatEntries();
    mockEntries = entries;
    const { getByTestId, getByText, queryByText, getAllByTestId } = await renderScreen(<GoalsScreen />);

    expect(queryByText('Burger')).toBeNull();
    await fireEvent.press(getByTestId('tally-row-fatG'));

    const itemNames = getAllByTestId(/tally-item-/).map((node) => node.props.accessibilityLabel);
    expect(itemNames).toEqual(['Open Burger', 'Open Salad', 'Open Tea']);
    expect(getByText('30g')).toBeTruthy();
    expect(getByText('5g')).toBeTruthy();
    expect(getByText('Tea')).toBeTruthy();
    expect(getByText('no data')).toBeTruthy();
  });

  it('tapping the open row again collapses it, and tapping a different row swaps which one is open', async () => {
    mockEntries = [
      entry({ type: 'meal', name: 'Burger', fatG: 30, calories: 500 }),
    ];
    const { getByTestId, getByText, queryByText } = await renderScreen(<GoalsScreen />);

    await fireEvent.press(getByTestId('tally-row-fatG'));
    expect(getByText('Burger')).toBeTruthy();

    await fireEvent.press(getByTestId('tally-row-fatG'));
    expect(queryByText('Burger')).toBeNull();

    await fireEvent.press(getByTestId('tally-row-fatG'));
    expect(getByText('Burger')).toBeTruthy();
    await fireEvent.press(getByTestId('tally-row-calories'));
    expect(getByText('Burger')).toBeTruthy(); // still shown: calories row's own panel
    expect(getByTestId('tally-row-fatG').props.accessibilityState.expanded).toBe(false);
    expect(getByTestId('tally-row-calories').props.accessibilityState.expanded).toBe(true);
  });

  it('pressing an entry in the panel navigates to that entry', async () => {
    const { entries } = fatEntries();
    mockEntries = entries;
    const { getByTestId } = await renderScreen(<GoalsScreen />);

    await fireEvent.press(getByTestId('tally-row-fatG'));
    await fireEvent.press(getByTestId(`tally-item-${entries[0].id}`));

    expect(mockPush).toHaveBeenCalledWith(`/entry/${entries[0].id}`);
  });
});

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

describe('CheckInSection (HANDOFF.md Cycle A — persisted-prefs source of truth)', () => {
  it('turning the check-in on with no floor goals stays ON and shows the hint', async () => {
    (ensureNotificationPermission as jest.Mock).mockResolvedValue(true);
    useGoalsStore.setState({ goals: [], loaded: true });

    const { findByLabelText, findByText } = await renderScreen(<GoalsScreen />);
    const toggle = await findByLabelText('Daily check-in');
    await fireEvent(toggle, 'valueChange', true);

    expect(await findByText('Add a floor goal to get check-ins.')).toBeTruthy();
    expect((await findByLabelText('Daily check-in')).props.value).toBe(true);
    expect(usePrefsStore.getState().checkInEnabled).toBe(true);
    expect(refreshCheckIn).toHaveBeenCalledWith(20, 0);
  });

  it('turning the check-in off persists checkInEnabled: false', async () => {
    (getCheckIn as jest.Mock).mockResolvedValue({ enabled: true, hour: 20, minute: 0 });
    useGoalsStore.setState({
      goals: [goal({ nutrient: 'proteinG', direction: 'floor', threshold: 50 })],
      loaded: true,
    });

    const { findByLabelText, queryByText } = await renderScreen(<GoalsScreen />);
    const toggle = await findByLabelText('Daily check-in');
    expect(toggle.props.value).toBe(true);

    await fireEvent(toggle, 'valueChange', false);

    expect((await findByLabelText('Daily check-in')).props.value).toBe(false);
    expect(usePrefsStore.getState().checkInEnabled).toBe(false);
    expect(disableCheckIn).toHaveBeenCalled();
    expect(queryByText('Add a floor goal to get check-ins.')).toBeNull();
  });

  it('adopts a pending pre-existing OS-scheduled check-in on first mount', async () => {
    (getCheckIn as jest.Mock).mockResolvedValue({ enabled: true, hour: 7, minute: 30 });

    const { findByLabelText } = await renderScreen(<GoalsScreen />);

    expect((await findByLabelText('Daily check-in')).props.value).toBe(true);
    expect(usePrefsStore.getState()).toMatchObject({ checkInEnabled: true, checkInHour: 7, checkInMinute: 30 });
  });
});
