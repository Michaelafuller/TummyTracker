import { createElement as mockCreateElement, useEffect as mockUseEffect } from 'react';
import { Alert, AppState } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { getMealComponents, hasAnyLogEntry, listRecentFoodEntries } from '@/db/repository';
import type { LogEntry, MealComponent } from '@/db/schema';
import { useMealBuilderStore } from '@/features/logging/mealBuilderStore';
import type { MealComponentDraft } from '@/lib/mealAggregate';
import HomeScreen from '../index';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useRouter: () => ({ push: mockPush }),
  // No NavigationContainer in these tests, so the real useFocusEffect (which
  // needs navigation context) would throw. Approximate it as "run once on
  // mount" — sufficient to exercise the initial fetch this screen does.
  useFocusEffect: (effect: () => void | (() => void)) => mockUseEffect(effect, []),
}));

// Pass-through spy on the real picker: renders it unchanged (the other tests
// tap its rows) and records the latest `onSelect` HomeScreen handed it. The
// double-tap test calls that handler directly, because `fireEvent.press`
// wraps each dispatch in act(), which waits for an async handler to settle —
// so it can't land a second tap while the first load is still pending.
let mockPickerOnSelect: ((entry: LogEntry) => void) | undefined;
jest.mock('@/features/logging/RecentFoodPicker', () => {
  const actual = jest.requireActual('@/features/logging/RecentFoodPicker');
  return {
    RecentFoodPicker: (props: { onSelect: (entry: LogEntry) => void }) => {
      mockPickerOnSelect = props.onSelect;
      return mockCreateElement(actual.RecentFoodPicker, props);
    },
  };
});

jest.mock('@/db/repository', () => ({
  listRecentFoodEntries: jest.fn(),
  getMealComponents: jest.fn(),
  hasAnyLogEntry: jest.fn(),
}));

// The backup nudge (GitHub #14) is exercised by its own tests
// (features/backup/__tests__/BackupNudge.test.tsx) — mocked here so this
// screen test isn't coupled to its prefs-store/backup-service internals.
jest.mock('@/features/backup/BackupNudge', () => ({
  BackupNudge: () => null,
}));

// The day check-in card and its notification-response hook are exercised by
// their own tests (features/checkin/__tests__) — mocked here so this screen
// test never touches the real (native-only) expo-sqlite client.
const mockUseDayCheckInResponses = jest.fn();
jest.mock('@/features/checkin/useDayCheckInResponses', () => ({
  useDayCheckInResponses: () => mockUseDayCheckInResponses(),
}));
jest.mock('@/features/checkin/DayCheckInCard', () => ({
  DayCheckInCard: ({ date }: { date: string }) => {
    const { Text } = jest.requireActual('react-native');
    return mockCreateElement(Text, { testID: 'day-check-in-card' }, date);
  },
}));

const BASE_ENTRY: LogEntry = {
  id: 'e1',
  type: 'meal',
  mealSlot: 'breakfast',
  name: 'Oatmeal',
  barcode: null,
  loggedAt: 1000,
  sentiment: null,
  bristolScale: null,
  symptomType: null,
  severity: null,
  notes: 'occasion notes',
  ingredientsText: null,
  tagsJson: null,
  calories: 150,
  fatG: null,
  saturatedFatG: null,
  carbsG: null,
  proteinG: null,
  fiberG: null,
  sugarG: null,
  sodiumMg: null,
  servingG: null,
  componentCount: null,
  createdAt: 1,
  updatedAt: 1,
};

const SECOND_ENTRY: LogEntry = {
  ...BASE_ENTRY,
  id: 'e2',
  name: 'Toast',
};

function draft(name: string, overrides: Partial<MealComponentDraft> = {}): MealComponentDraft {
  return {
    name,
    barcode: null,
    servings: 1,
    servingG: null,
    calories: null,
    fatG: null,
    saturatedFatG: null,
    carbsG: null,
    proteinG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    ingredientsText: null,
    tagsJson: null,
    sortOrder: 0,
    ...overrides,
  };
}

// Captured AppState 'change' listeners. The preset's AppState stub returns no
// subscription, which the screen's cleanup needs — hand back a removable one.
let appStateListeners: ((state: string) => void)[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListeners.push(listener as (state: string) => void);
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  (getMealComponents as jest.Mock).mockResolvedValue([]);
  (hasAnyLogEntry as jest.Mock).mockResolvedValue(false);
  useMealBuilderStore.setState({ components: [], reviewPrefill: null });
});

describe('HomeScreen', () => {
  it('renders the CTAs with no recent entries', async () => {
    (listRecentFoodEntries as jest.Mock).mockResolvedValue([]);
    const { getByLabelText } = await render(<HomeScreen />);
    expect(getByLabelText('Scan a barcode')).toBeTruthy();
    expect(getByLabelText('Add an entry manually')).toBeTruthy();
  });

  it('mounts the day check-in responder hook and renders the check-in card with today\'s date', async () => {
    (listRecentFoodEntries as jest.Mock).mockResolvedValue([]);
    const { getByTestId } = await render(<HomeScreen />);
    expect(mockUseDayCheckInResponses).toHaveBeenCalled();
    expect(getByTestId('day-check-in-card').props.children).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('fetches hasAnyLogEntry on focus (drives the backup nudge, GitHub #14)', async () => {
    (listRecentFoodEntries as jest.Mock).mockResolvedValue([]);
    (hasAnyLogEntry as jest.Mock).mockResolvedValue(true);
    await render(<HomeScreen />);
    await waitFor(() => expect(hasAnyLogEntry).toHaveBeenCalled());
  });

  it('moves the check-in card to the new day when the app returns to the foreground', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 8, 27, 23, 50).getTime());
    const { getByTestId } = await render(<HomeScreen />);
    expect(getByTestId('day-check-in-card').props.children).toBe('2026-09-27');

    // Left open on Home overnight: no focus event, just a foreground resume.
    nowSpy.mockReturnValue(new Date(2026, 8, 28, 7, 30).getTime());
    await act(async () => {
      appStateListeners.forEach((listener) => listener('active'));
    });

    expect(getByTestId('day-check-in-card').props.children).toBe('2026-09-28');
    nowSpy.mockRestore();
  });

  it('renders the recents section and its search input inside the keyboard-shift wrapper', async () => {
    (listRecentFoodEntries as jest.Mock).mockResolvedValue([BASE_ENTRY]);
    const { findByTestId, getByLabelText } = await render(<HomeScreen />);

    const shiftView = await findByTestId('home-keyboard-shift');
    const searchInput = getByLabelText('Search past foods');
    // The recents section (and its search input) must render inside the
    // keyboard-shift wrapper so the keyboard-avoiding padding actually covers
    // it (Milestone A3 — the Home search field used to sit under the keyboard).
    expect(shiftView).toContainElement(searchInput);
  });

  it('tapping a recent row seeds the builder from its components and pushes /meal/review', async () => {
    (listRecentFoodEntries as jest.Mock).mockResolvedValue([BASE_ENTRY]);
    const rows: MealComponent[] = [
      {
        id: 'c1',
        entryId: 'e1',
        name: 'Oatmeal',
        barcode: null,
        servings: 1,
        servingG: null,
        calories: 150,
        fatG: null,
        saturatedFatG: null,
        carbsG: null,
        proteinG: null,
        fiberG: null,
        sugarG: null,
        sodiumMg: null,
        ingredientsText: null,
        tagsJson: null,
        sortOrder: 0,
        createdAt: 1,
      },
    ];
    (getMealComponents as jest.Mock).mockResolvedValue(rows);

    const { findByLabelText } = await render(<HomeScreen />);
    await fireEvent.press(await findByLabelText('Re-log Oatmeal'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/meal/review'));
    expect(getMealComponents).toHaveBeenCalledWith('e1');

    const { components, reviewPrefill } = useMealBuilderStore.getState();
    expect(components).toHaveLength(1);
    expect(components[0].name).toBe('Oatmeal');
    // Notes describe the original occasion, not the redo — never copied.
    expect(reviewPrefill).toEqual({ name: 'Oatmeal', type: 'meal', mealSlot: 'breakfast' });
  });

  it('re-logging a flat (single-item) entry seeds one draft with servings 1', async () => {
    (listRecentFoodEntries as jest.Mock).mockResolvedValue([BASE_ENTRY]);
    (getMealComponents as jest.Mock).mockResolvedValue([]);

    const { findByLabelText } = await render(<HomeScreen />);
    await fireEvent.press(await findByLabelText('Re-log Oatmeal'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/meal/review'));
    const { components } = useMealBuilderStore.getState();
    expect(components).toHaveLength(1);
    expect(components[0]).toMatchObject({ name: 'Oatmeal', servings: 1, calories: 150 });
  });

  it('"Scan a barcode" clears a pre-populated builder before navigating', async () => {
    (listRecentFoodEntries as jest.Mock).mockResolvedValue([]);
    useMealBuilderStore.setState({
      components: [draft('Stale')],
      reviewPrefill: { name: 'Stale' },
    });

    const { getByLabelText } = await render(<HomeScreen />);
    await fireEvent.press(getByLabelText('Scan a barcode'));

    expect(useMealBuilderStore.getState().components).toEqual([]);
    expect(useMealBuilderStore.getState().reviewPrefill).toBeNull();
  });

  it('"Add an entry manually" clears a pre-populated builder before navigating', async () => {
    (listRecentFoodEntries as jest.Mock).mockResolvedValue([]);
    useMealBuilderStore.setState({
      components: [draft('Stale')],
      reviewPrefill: { name: 'Stale' },
    });

    const { getByLabelText } = await render(<HomeScreen />);
    await fireEvent.press(getByLabelText('Add an entry manually'));

    expect(useMealBuilderStore.getState().components).toEqual([]);
    expect(useMealBuilderStore.getState().reviewPrefill).toBeNull();
  });

  it('guards against a double tap while getMealComponents is still resolving', async () => {
    (listRecentFoodEntries as jest.Mock).mockResolvedValue([BASE_ENTRY, SECOND_ENTRY]);
    let resolveComponents!: (rows: MealComponent[]) => void;
    (getMealComponents as jest.Mock).mockImplementation(
      () =>
        new Promise<MealComponent[]>((resolve) => {
          resolveComponents = resolve;
        }),
    );

    const { findByLabelText } = await render(<HomeScreen />);
    await findByLabelText('Re-log Toast'); // both rows rendered → onSelect captured
    const onSelect = mockPickerOnSelect!;

    // A fast flurry — same row twice, then a different row — all before the
    // first getMealComponents call resolves (see the picker spy above for why
    // this calls the handler rather than fireEvent.press).
    onSelect(BASE_ENTRY);
    onSelect(BASE_ENTRY);
    onSelect(SECOND_ENTRY);

    expect(getMealComponents).toHaveBeenCalledTimes(1);
    expect(getMealComponents).toHaveBeenCalledWith('e1');
    expect(mockPush).not.toHaveBeenCalled();

    resolveComponents([]);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/meal/review'));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('allows a new tap after the first one settles (the guard resets)', async () => {
    (listRecentFoodEntries as jest.Mock).mockResolvedValue([BASE_ENTRY]);
    (getMealComponents as jest.Mock).mockResolvedValue([]);

    const { findByLabelText } = await render(<HomeScreen />);
    const oatmealRow = await findByLabelText('Re-log Oatmeal');

    await fireEvent.press(oatmealRow);
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));

    await fireEvent.press(oatmealRow);
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(2));
    expect(getMealComponents).toHaveBeenCalledTimes(2);
  });

  it('shows an alert and leaves the builder unchanged when getMealComponents rejects, then allows a retry', async () => {
    (listRecentFoodEntries as jest.Mock).mockResolvedValue([BASE_ENTRY]);
    (getMealComponents as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { findByLabelText } = await render(<HomeScreen />);
    const oatmealRow = await findByLabelText('Re-log Oatmeal');

    await fireEvent.press(oatmealRow);

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        "Couldn't open that meal",
        'Something went wrong loading it — try again.',
      ),
    );
    expect(mockPush).not.toHaveBeenCalled();
    const { components, reviewPrefill } = useMealBuilderStore.getState();
    expect(components).toEqual([]);
    expect(reviewPrefill).toBeNull();

    // The guard must have reset in `finally` even though the load failed —
    // a further tap should be allowed, not silently swallowed forever.
    (getMealComponents as jest.Mock).mockResolvedValueOnce([]);
    await fireEvent.press(oatmealRow);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/meal/review'));
  });
});
