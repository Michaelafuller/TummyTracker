import { useEffect as mockUseEffect, useState as mockUseState, type ReactElement, type ReactNode } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import {
  Pressable as MockPressable,
  Text as MockText,
} from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { listMedications } from '@/db/repository';
import type { Medication } from '@/db/schema';
import MedicationsScreen from '../meds';

const TEST_INSETS: Metrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderScreen(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={TEST_INSETS}>{ui}</SafeAreaProvider>);
}

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  // Approximate useFocusEffect as "run once on mount" — no NavigationContainer
  // here, matching the convention in (tabs)/__tests__/index.test.tsx.
  useFocusEffect: (effect: () => void | (() => void)) => mockUseEffect(effect, []),
}));

jest.mock('@/db/repository', () => ({
  listMedications: jest.fn(),
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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MedicationsScreen', () => {
  it('shows the empty state when there are no medications', async () => {
    (listMedications as jest.Mock).mockResolvedValue([]);
    const { findByText } = await renderScreen(<MedicationsScreen />);

    expect(await findByText('No medications yet.')).toBeTruthy();
  });

  it('renders an active medication row with its dose summary, and tapping it navigates to the edit screen', async () => {
    const med = makeMedication({ id: 'med1', name: 'Omeprazole', defaultDose: 10, doseUnit: 'mg', frequency: 'daily' });
    (listMedications as jest.Mock).mockResolvedValue([med]);

    const { findByTestId, findByLabelText, getByText } = await renderScreen(<MedicationsScreen />);

    const row = await findByTestId('med-row-med1');
    expect(row).toBeTruthy();
    expect(getByText('10 mg · daily')).toBeTruthy();

    await fireEvent.press(await findByLabelText('Edit Omeprazole'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/medication/[id]', params: { id: 'med1' } });
  });

  it('renders inactive medications collapsed under "Inactive (n)"', async () => {
    const active = makeMedication({ id: 'med1', name: 'Active Med', isActive: true });
    const inactive = makeMedication({ id: 'med2', name: 'Old Med', isActive: false });
    (listMedications as jest.Mock).mockResolvedValue([active, inactive]);

    const { findByText, queryByTestId } = await renderScreen(<MedicationsScreen />);

    expect(await findByText('Inactive (1)')).toBeTruthy();
    // Collapsed by default — the inactive row isn't rendered until expanded.
    expect(queryByTestId('med-row-med2')).toBeNull();
  });

  it('"Add medication" navigates to the new-medication screen', async () => {
    (listMedications as jest.Mock).mockResolvedValue([]);
    const { findByLabelText } = await renderScreen(<MedicationsScreen />);

    await fireEvent.press(await findByLabelText('Add medication'));
    expect(mockPush).toHaveBeenCalledWith('/medication/new');
  });
});
