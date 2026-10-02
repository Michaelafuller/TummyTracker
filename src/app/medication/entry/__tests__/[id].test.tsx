import { useEffect as mockUseEffect } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { deleteMedicationEvent, getMedicationEvent, updateMedicationEvent } from '@/db/repository';
import type { Medication, MedicationDose, MedicationEvent } from '@/db/schema';
import EditMedicationEntryScreen from '../[id]';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({ id: 'evt1' }),
  useFocusEffect: (effect: () => void | (() => void)) => mockUseEffect(effect, []),
}));

jest.mock('@/db/repository', () => ({
  getMedicationEvent: jest.fn(),
  updateMedicationEvent: jest.fn(),
  deleteMedicationEvent: jest.fn(),
}));

let mockMedications: Medication[] = [];
jest.mock('@/features/medications/useMedicationData', () => ({
  useMedications: () => mockMedications,
  useMedicationEvents: () => [],
  useMedicationDoses: () => [],
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
    isRegular: false,
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
    reason: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMedications = [makeMedication()];
});

describe('EditMedicationEntryScreen', () => {
  it('shows "Entry not found" when the id does not resolve', async () => {
    (getMedicationEvent as jest.Mock).mockResolvedValue(undefined);
    const { findByText } = await render(<EditMedicationEntryScreen />);

    expect(await findByText('Entry not found')).toBeTruthy();
  });

  it('pre-fills the form from the loaded event and its doses', async () => {
    (getMedicationEvent as jest.Mock).mockResolvedValue({ event: makeEvent(), doses: [makeDose()] });
    const { findByTestId, findByLabelText } = await render(<EditMedicationEntryScreen />);

    const line = await findByTestId('dose-line-med1');
    expect(line.props.accessibilityState.checked).toBe(true);
    expect((await findByLabelText('Dose of Omeprazole')).props.defaultValue).toBe('20');
  });

  it('shows an "inactive" tag for a medication logged on the event that has since gone inactive', async () => {
    mockMedications = [makeMedication({ isActive: false })];
    (getMedicationEvent as jest.Mock).mockResolvedValue({ event: makeEvent(), doses: [makeDose()] });

    const { findByText } = await render(<EditMedicationEntryScreen />);
    expect(await findByText('inactive')).toBeTruthy();
  });

  it('saving calls updateMedicationEvent(id, event, doses) and navigates back', async () => {
    (getMedicationEvent as jest.Mock).mockResolvedValue({ event: makeEvent(), doses: [makeDose()] });
    (updateMedicationEvent as jest.Mock).mockResolvedValue(undefined);

    const { findByLabelText } = await render(<EditMedicationEntryScreen />);
    await fireEvent.changeText(await findByLabelText('Dose of Omeprazole'), '10');
    await fireEvent.press(await findByLabelText('Save changes'));

    expect(updateMedicationEvent).toHaveBeenCalledWith(
      'evt1',
      expect.objectContaining({ timeKnown: true }),
      [{ medicationId: 'med1', dose: 10, doseUnit: 'mg', reason: null }],
    );
    expect(mockBack).toHaveBeenCalled();
  });

  describe('delete', () => {
    beforeEach(() => {
      jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
        const destructive = buttons?.find((button) => button.style === 'destructive');
        destructive?.onPress?.();
      });
    });

    afterEach(() => {
      (Alert.alert as jest.Mock).mockRestore();
    });

    it('confirms, deletes, and navigates back', async () => {
      (getMedicationEvent as jest.Mock).mockResolvedValue({ event: makeEvent(), doses: [makeDose()] });
      (deleteMedicationEvent as jest.Mock).mockResolvedValue(undefined);

      const { findByLabelText } = await render(<EditMedicationEntryScreen />);
      await fireEvent.press(await findByLabelText('Delete entry'));

      expect(deleteMedicationEvent).toHaveBeenCalledWith('evt1');
      expect(mockBack).toHaveBeenCalled();
    });
  });
});
