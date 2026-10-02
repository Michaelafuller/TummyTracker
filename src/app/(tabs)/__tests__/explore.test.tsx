import React from 'react';
import { PixelRatio } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import type { LogEntry, Medication, MedicationDose, MedicationEvent } from '@/db/schema';
import { usePrefsStore } from '@/features/prefs/prefsStore';
import BrowseScreen from '../explore';

jest.mock('react-native-calendars', () => ({
  Calendar: 'MockCalendar',
  WeekCalendar: 'MockWeekCalendar',
  CalendarProvider: ({ children }: { children: React.ReactNode }) => children,
}));

let mockEntries: LogEntry[] = [];
jest.mock('@/features/logging/useEntries', () => ({
  useAllEntries: () => mockEntries,
}));

// EntryList -> EntryRow / MedicationEventRow each wrap their Pressable in
// expo-router's <Link>; stub it to a passthrough (same pattern as
// EntryRow.test.tsx) — explore.tsx itself never calls into expo-router
// directly, so this doesn't affect anything else in this file.
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

let mockMedications: Medication[] = [];
let mockMedicationEvents: MedicationEvent[] = [];
let mockMedicationDoses: MedicationDose[] = [];
jest.mock('@/features/medications/useMedicationData', () => ({
  useMedications: () => mockMedications,
  useMedicationEvents: () => mockMedicationEvents,
  useMedicationDoses: () => mockMedicationDoses,
}));

// EntryList -> EntryRow -> useWatchlistStore pulls in @/db/repository, which
// opens the real expo-sqlite native module at import time — not available
// under Jest (same stub as EntryRow.test.tsx / history.test.tsx). EntryList
// itself is left unmocked (unlike before Cycle B) so the merged
// log+medication rendering/filtering below is exercised for real.
jest.mock('@/db/repository', () => ({
  listWatchlistItems: jest.fn(),
  addWatchlistItem: jest.fn(),
  removeWatchlistItem: jest.fn(),
  renameWatchlistItem: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => {
  usePrefsStore.setState({ offlineMode: false, loaded: true });
  mockEntries = [];
  mockMedications = [];
  mockMedicationEvents = [];
  mockMedicationDoses = [];
});

describe('BrowseScreen calendar toggle', () => {
  it('defaults to collapsed state (Expand calendar button visible)', async () => {
    const { getByLabelText } = await render(<BrowseScreen />);
    expect(getByLabelText('Expand calendar')).toBeTruthy();
  });

  it('expands when the toggle is pressed', async () => {
    const { getByLabelText } = await render(<BrowseScreen />);
    await fireEvent.press(getByLabelText('Expand calendar'));
    expect(getByLabelText('Collapse calendar')).toBeTruthy();
  });

  it('collapses again on a second press', async () => {
    const { getByLabelText } = await render(<BrowseScreen />);
    await fireEvent.press(getByLabelText('Expand calendar'));
    await fireEvent.press(getByLabelText('Collapse calendar'));
    expect(getByLabelText('Expand calendar')).toBeTruthy();
  });
});

describe('BrowseScreen week strip sizing', () => {
  it('waits for the frame to be measured before mounting the week strip', async () => {
    const { queryByTestId, getByTestId } = await render(<BrowseScreen />);
    expect(getByTestId('week-calendar-frame')).toBeTruthy();
    expect(queryByTestId('week-calendar')).toBeNull();
  });

  it('pages the week strip by the measured frame width, not the screen width', async () => {
    const { getByTestId } = await render(<BrowseScreen />);
    await fireEvent(getByTestId('week-calendar-frame'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 344.6, height: 80 } },
    });
    // Pixel-exact, never rounded to whole dp (344.6 → 345 would page off-grid).
    expect(getByTestId('week-calendar').props.calendarWidth).toBe(PixelRatio.roundToNearestPixel(344.6));
    expect(getByTestId('week-calendar').props.calendarWidth).not.toBe(345);
  });

  it('themes today distinctly from the selected day', async () => {
    const { getByTestId } = await render(<BrowseScreen />);
    await fireEvent(getByTestId('week-calendar-frame'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 345, height: 80 } },
    });
    const { theme } = getByTestId('week-calendar').props;
    expect(theme.todayBackgroundColor).toBeDefined();
    expect(theme.todayBackgroundColor).not.toBe(theme.selectedDayBackgroundColor);
  });
});

function makeLogEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'entry1',
    type: 'meal',
    mealSlot: null,
    name: 'Lunch',
    barcode: null,
    loggedAt: Date.now(),
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
    ...overrides,
  };
}

function makeMedication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 'med1',
    name: 'Omeprazole',
    defaultDose: null,
    doseUnit: null,
    frequency: null,
    startDate: null,
    endDate: null,
    isActive: true,
    isRegular: false,
    notes: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeMedicationEvent(overrides: Partial<MedicationEvent> = {}): MedicationEvent {
  return { id: 'evt1', takenAt: Date.now(), timeKnown: true, notes: null, createdAt: 0, updatedAt: 0, ...overrides };
}

function makeMedicationDose(overrides: Partial<MedicationDose> = {}): MedicationDose {
  return {
    id: 'd1',
    eventId: 'evt1',
    medicationId: 'med1',
    dose: 20,
    doseUnit: 'mg',
    reason: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('BrowseScreen Meds filter (Cycle B)', () => {
  beforeEach(() => {
    mockEntries = [makeLogEntry({ id: 'entry1', name: 'Lunch', type: 'meal' })];
    mockMedications = [makeMedication({ id: 'med1', name: 'Omeprazole' })];
    mockMedicationEvents = [makeMedicationEvent({ id: 'evt1' })];
    mockMedicationDoses = [makeMedicationDose({ id: 'd1', eventId: 'evt1', medicationId: 'med1' })];
  });

  it('"All" shows both the food entry and the medication entry', async () => {
    const { findByText } = await render(<BrowseScreen />);

    expect(await findByText('Lunch')).toBeTruthy();
    expect(await findByText('💊 Medication')).toBeTruthy();
    expect(await findByText('Omeprazole 20 mg')).toBeTruthy();
  });

  it('"Meds" shows only the medication row', async () => {
    const { getByLabelText, findByText, queryByText } = await render(<BrowseScreen />);

    await fireEvent.press(getByLabelText('Meds'));

    expect(await findByText('💊 Medication')).toBeTruthy();
    expect(queryByText('Lunch')).toBeNull();
  });

  it('"Food" hides the medication row', async () => {
    const { getByLabelText, findByText, queryByText } = await render(<BrowseScreen />);

    await fireEvent.press(getByLabelText('Food'));

    expect(await findByText('Lunch')).toBeTruthy();
    expect(queryByText('💊 Medication')).toBeNull();
  });

  it('tapping a medication row navigates to its edit screen', async () => {
    const { findByTestId } = await render(<BrowseScreen />);
    const row = await findByTestId('journal-med-evt1');
    expect(row).toBeTruthy();
  });
});
