import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { Medication, MedicationDose, MedicationEvent } from '@/db/schema';
import MedicationHistoryScreen from '../history';

const TEST_INSETS: Metrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={TEST_INSETS}>
      <MedicationHistoryScreen />
    </SafeAreaProvider>,
  );
}

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

// EntryList -> EntryRow -> useWatchlistStore pulls in @/db/repository, which
// opens the real expo-sqlite native module at import time — not available
// under Jest (same stub as EntryRow.test.tsx / explore.test.tsx).
jest.mock('@/db/repository', () => ({
  listWatchlistItems: jest.fn(),
  addWatchlistItem: jest.fn(),
  removeWatchlistItem: jest.fn(),
  renameWatchlistItem: jest.fn(),
}));

let mockMedications: Medication[] = [];
let mockEvents: MedicationEvent[] = [];
let mockDoses: MedicationDose[] = [];
jest.mock('@/features/medications/useMedicationData', () => ({
  useMedications: () => mockMedications,
  useMedicationEvents: () => mockEvents,
  useMedicationDoses: () => mockDoses,
}));

function makeMedication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 'med1',
    name: 'Omeprazole',
    defaultDose: 20,
    doseUnit: 'mg',
    frequency: null,
    startDate: null,
    endDate: null,
    isActive: true,
    notes: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<MedicationEvent> = {}): MedicationEvent {
  return { id: 'evt1', takenAt: 1_000, timeKnown: true, notes: null, createdAt: 0, updatedAt: 0, ...overrides };
}

function makeDose(overrides: Partial<MedicationDose> = {}): MedicationDose {
  return {
    id: 'd1',
    eventId: 'evt1',
    medicationId: 'med1',
    dose: 20,
    doseUnit: 'mg',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMedications = [];
  mockEvents = [];
  mockDoses = [];
});

describe('MedicationHistoryScreen', () => {
  it('shows "No doses logged yet." when there is no history', async () => {
    const { findByText } = await renderScreen();
    expect(await findByText('No doses logged yet.')).toBeTruthy();
  });

  it('lists every event newest first, with a filter chip per medication that has doses', async () => {
    mockMedications = [
      makeMedication({ id: 'med1', name: 'Omeprazole' }),
      makeMedication({ id: 'med2', name: 'Never logged' }),
    ];
    mockEvents = [makeEvent({ id: 'evt1', takenAt: 1_000 })];
    mockDoses = [makeDose({ id: 'd1', eventId: 'evt1', medicationId: 'med1' })];

    const { findByTestId, findByLabelText, queryByLabelText } = await renderScreen();

    expect(await findByTestId('journal-med-evt1')).toBeTruthy();
    expect(await findByLabelText('All')).toBeTruthy();
    expect(await findByLabelText('Omeprazole')).toBeTruthy();
    // "Never logged" has no doses — no chip for it.
    expect(queryByLabelText('Never logged')).toBeNull();
  });

  it('filtering by a medication shows only its events', async () => {
    mockMedications = [makeMedication({ id: 'med1', name: 'Omeprazole' }), makeMedication({ id: 'med2', name: 'Ibuprofen' })];
    mockEvents = [makeEvent({ id: 'evt1', takenAt: 2_000 }), makeEvent({ id: 'evt2', takenAt: 1_000 })];
    mockDoses = [
      makeDose({ id: 'd1', eventId: 'evt1', medicationId: 'med1' }),
      makeDose({ id: 'd2', eventId: 'evt2', medicationId: 'med2' }),
    ];

    const { findByTestId, findByLabelText, queryByTestId } = await renderScreen();

    await fireEvent.press(await findByLabelText('Omeprazole'));

    expect(await findByTestId('journal-med-evt1')).toBeTruthy();
    expect(queryByTestId('journal-med-evt2')).toBeNull();
  });
});
