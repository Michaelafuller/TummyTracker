import { fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { createMedicationEvent } from '@/db/repository';
import type { Medication } from '@/db/schema';
import NewMedicationEntryScreen from '../new';

const originalOS = Platform.OS;
beforeEach(() => {
  Platform.OS = 'android';
});
afterEach(() => {
  Platform.OS = originalOS;
});

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: { medicationIds?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/db/repository', () => ({
  createMedicationEvent: jest.fn(),
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

beforeEach(() => {
  jest.clearAllMocks();
  mockMedications = [];
  mockParams = {};
});

describe('NewMedicationEntryScreen', () => {
  it('shows "Add a medication first" when there are no active medications', async () => {
    mockMedications = [];
    const { findByText, findByLabelText } = await render(<NewMedicationEntryScreen />);

    expect(await findByText('Add a medication first')).toBeTruthy();
    await fireEvent.press(await findByLabelText('Add medication'));
    expect(mockPush).toHaveBeenCalledWith('/medication/new');
  });

  it('also shows the empty state when every medication is inactive', async () => {
    mockMedications = [makeMedication({ isActive: false })];
    const { findByText } = await render(<NewMedicationEntryScreen />);
    expect(await findByText('Add a medication first')).toBeTruthy();
  });

  it('selecting a medication and saving calls createMedicationEvent then navigates back', async () => {
    mockMedications = [makeMedication({ id: 'med1', name: 'Omeprazole', defaultDose: 20, doseUnit: 'mg' })];
    (createMedicationEvent as jest.Mock).mockResolvedValue({});

    const { findByTestId, findByLabelText } = await render(<NewMedicationEntryScreen />);

    await fireEvent.press(await findByTestId('dose-line-med1'));
    await fireEvent.press(await findByLabelText('Save'));

    expect(createMedicationEvent).toHaveBeenCalledTimes(1);
    const [event, doses] = (createMedicationEvent as jest.Mock).mock.calls[0];
    expect(event).toEqual(expect.objectContaining({ timeKnown: true, notes: null }));
    expect(doses).toEqual([{ medicationId: 'med1', dose: 20, doseUnit: 'mg', reason: null }]);
    expect(mockBack).toHaveBeenCalled();
  });

  it('does not call createMedicationEvent when validation fails', async () => {
    mockMedications = [makeMedication()];
    const { findByLabelText } = await render(<NewMedicationEntryScreen />);

    await fireEvent.press(await findByLabelText('Save'));

    expect(createMedicationEvent).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  describe('preselecting from a medication reminder (GitHub #29)', () => {
    it('ticks the medications named in the param, so Save logs exactly those', async () => {
      mockMedications = [
        makeMedication({ id: 'a', name: 'Levothyroxine', defaultDose: 50, doseUnit: 'mcg' }),
        makeMedication({ id: 'b', name: 'Vitamin D', defaultDose: 1000, doseUnit: 'unit' }),
        makeMedication({ id: 'c', name: 'Omeprazole', defaultDose: 20, doseUnit: 'mg' }),
      ];
      mockParams = { medicationIds: 'a,b' };
      (createMedicationEvent as jest.Mock).mockResolvedValue({});

      const { findByLabelText } = await render(<NewMedicationEntryScreen />);
      await fireEvent.press(await findByLabelText('Save'));

      expect(createMedicationEvent).toHaveBeenCalledTimes(1);
      const [, doses] = (createMedicationEvent as jest.Mock).mock.calls[0];
      expect(doses).toEqual([
        { medicationId: 'a', dose: 50, doseUnit: 'mcg', reason: null },
        { medicationId: 'b', dose: 1000, doseUnit: 'unit', reason: null },
      ]);
    });

    it('ignores unknown and inactive ids', async () => {
      mockMedications = [
        makeMedication({ id: 'a', name: 'Active' }),
        makeMedication({ id: 'inactive', name: 'Inactive', isActive: false }),
      ];
      mockParams = { medicationIds: 'ghost,inactive,a,' };
      (createMedicationEvent as jest.Mock).mockResolvedValue({});

      const { findByLabelText, queryByTestId } = await render(<NewMedicationEntryScreen />);
      expect(queryByTestId('dose-line-inactive')).toBeNull();
      await fireEvent.press(await findByLabelText('Save'));

      const [, doses] = (createMedicationEvent as jest.Mock).mock.calls[0];
      expect(doses.map((d: { medicationId: string }) => d.medicationId)).toEqual(['a']);
    });

    it('starts everything unselected without the param, exactly as before', async () => {
      mockMedications = [makeMedication({ id: 'a' })];
      const { findByLabelText } = await render(<NewMedicationEntryScreen />);

      await fireEvent.press(await findByLabelText('Save'));
      expect(createMedicationEvent).not.toHaveBeenCalled();
    });
  });
});
