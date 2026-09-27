import { useState as mockUseState, type ReactNode } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import {
  Pressable as MockPressable,
  Text as MockText,
} from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { Medication, MedicationDose, MedicationEvent } from '@/db/schema';
import MedicationsScreen from '../meds';

const TEST_INSETS: Metrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderScreen(ui: import('react').ReactElement) {
  return render(<SafeAreaProvider initialMetrics={TEST_INSETS}>{ui}</SafeAreaProvider>);
}

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

let mockMedications: Medication[] = [];
let mockEvents: MedicationEvent[] = [];
let mockDoses: MedicationDose[] = [];
jest.mock('@/features/medications/useMedicationData', () => ({
  useMedications: () => mockMedications,
  useMedicationEvents: () => mockEvents,
  useMedicationDoses: () => mockDoses,
}));

// The real Collapsible (components/ui/collapsible.tsx) animates its expand
// with react-native-reanimated's FadeIn, which needs the native Worklets
// runtime — unavailable under Jest ("WorkletsError: Native part of Worklets
// doesn't seem to be initialized"), and nothing else in this codebase
// exercises that component under test yet. Stand in a plain toggle that
// preserves the same collapsed-by-default / tap-to-expand contract this
// screen relies on, without touching the reanimated runtime at all.
jest.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ title, children }: { title: string; children: ReactNode }) => {
    const [isOpen, setIsOpen] = mockUseState(false);
    return (
      <>
        <MockPressable accessibilityRole="button" onPress={() => setIsOpen((value: boolean) => !value)}>
          <MockText>{title}</MockText>
        </MockPressable>
        {isOpen ? children : null}
      </>
    );
  },
}));

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

describe('MedicationsScreen inventory (Cycle A, unchanged)', () => {
  it('shows the empty state when there are no medications', async () => {
    const { findByText } = await renderScreen(<MedicationsScreen />);
    expect(await findByText('No medications yet.')).toBeTruthy();
  });

  it('renders an active medication row with its dose summary, and tapping it navigates to the edit screen', async () => {
    mockMedications = [
      makeMedication({ id: 'med1', name: 'Omeprazole', defaultDose: 10, doseUnit: 'mg', frequency: 'daily' }),
    ];

    const { findByTestId, findByLabelText, getByText } = await renderScreen(<MedicationsScreen />);

    const row = await findByTestId('med-row-med1');
    expect(row).toBeTruthy();
    expect(getByText('10 mg · daily')).toBeTruthy();

    await fireEvent.press(await findByLabelText('Edit Omeprazole'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/medication/[id]', params: { id: 'med1' } });
  });

  it('renders inactive medications collapsed under "Inactive (n)"', async () => {
    mockMedications = [
      makeMedication({ id: 'med1', name: 'Active Med', isActive: true }),
      makeMedication({ id: 'med2', name: 'Old Med', isActive: false }),
    ];

    const { findByText, queryByTestId } = await renderScreen(<MedicationsScreen />);

    expect(await findByText('Inactive (1)')).toBeTruthy();
    expect(queryByTestId('med-row-med2')).toBeNull();
  });

  it('says "No active medications." when every medication is inactive', async () => {
    mockMedications = [makeMedication({ id: 'med2', name: 'Old Med', isActive: false })];

    const { findByText, queryByText } = await renderScreen(<MedicationsScreen />);

    expect(await findByText('No active medications.')).toBeTruthy();
    expect(await findByText('Inactive (1)')).toBeTruthy();
    expect(queryByText('No medications yet.')).toBeNull();
  });

  it('"Add medication" navigates to the new-medication screen', async () => {
    const { findByLabelText } = await renderScreen(<MedicationsScreen />);

    await fireEvent.press(await findByLabelText('Add medication'));
    expect(mockPush).toHaveBeenCalledWith('/medication/new');
  });
});

describe('MedicationsScreen Create entry button (Cycle B, #6)', () => {
  it('is disabled with a hint when there are no active medications', async () => {
    mockMedications = [];
    const { findByLabelText, findByText } = await renderScreen(<MedicationsScreen />);

    const button = await findByLabelText('Create entry');
    expect(button.props.accessibilityState.disabled).toBe(true);
    expect(await findByText('Add a medication to log doses')).toBeTruthy();

    await fireEvent.press(button);
    expect(mockPush).not.toHaveBeenCalledWith('/medication/entry/new');
  });

  it('is enabled and navigates to the new entry screen when at least one medication is active', async () => {
    mockMedications = [makeMedication({ isActive: true })];
    const { findByLabelText, queryByText } = await renderScreen(<MedicationsScreen />);

    const button = await findByLabelText('Create entry');
    expect(button.props.accessibilityState.disabled).toBe(false);
    expect(queryByText('Add a medication to log doses')).toBeNull();

    await fireEvent.press(button);
    expect(mockPush).toHaveBeenCalledWith('/medication/entry/new');
  });
});

describe('MedicationsScreen Recent doses (Cycle B, #6)', () => {
  it('shows "No doses logged yet." when there is no history', async () => {
    const { findByText } = await renderScreen(<MedicationsScreen />);
    expect(await findByText('No doses logged yet.')).toBeTruthy();
  });

  it('shows up to 5 of the newest doses and tapping one navigates to its edit screen', async () => {
    mockMedications = [makeMedication({ id: 'med1', name: 'Omeprazole' })];
    mockEvents = [makeEvent({ id: 'evt1', takenAt: 2_000 })];
    mockDoses = [makeDose({ id: 'd1', eventId: 'evt1', medicationId: 'med1', dose: 20, doseUnit: 'mg' })];

    const { findByTestId, findByText } = await renderScreen(<MedicationsScreen />);

    expect(await findByText('Omeprazole 20 mg')).toBeTruthy();
    await fireEvent.press(await findByTestId('recent-dose-evt1'));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/medication/entry/[id]', params: { id: 'evt1' } });
  });

  it('"See all history" navigates to the history screen', async () => {
    const { findByLabelText } = await renderScreen(<MedicationsScreen />);
    await fireEvent.press(await findByLabelText('See all history'));
    expect(mockPush).toHaveBeenCalledWith('/medication/history');
  });
});
