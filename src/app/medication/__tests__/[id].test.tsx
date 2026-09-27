import { useEffect as mockUseEffect } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { getMedication, setMedicationActive, updateMedication } from '@/db/repository';
import type { Medication } from '@/db/schema';
import EditMedicationScreen from '../[id]';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({ id: 'med1' }),
  // Approximate as "run on mount", matching src/app/entry/__tests__/[id].test.tsx's convention.
  useFocusEffect: (effect: () => void | (() => void)) => mockUseEffect(effect, []),
}));

jest.mock('@/db/repository', () => ({
  getMedication: jest.fn(),
  updateMedication: jest.fn(),
  setMedicationActive: jest.fn(),
}));

function makeMedication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 'med1',
    name: 'Omeprazole',
    defaultDose: 10,
    doseUnit: 'mg',
    frequency: 'daily',
    startDate: null,
    endDate: null,
    isActive: true,
    notes: null,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('EditMedicationScreen', () => {
  it('shows "Medication not found" when the id does not resolve', async () => {
    (getMedication as jest.Mock).mockResolvedValue(undefined);
    const { findByText } = await render(<EditMedicationScreen />);

    expect(await findByText('Medication not found')).toBeTruthy();
  });

  it('pre-fills the form from the loaded medication', async () => {
    (getMedication as jest.Mock).mockResolvedValue(makeMedication());
    const { findByLabelText } = await render(<EditMedicationScreen />);

    const nameField = await findByLabelText('Medication name');
    expect(nameField.props.defaultValue).toBe('Omeprazole');
  });

  it('saving calls updateMedication(id, patch) and navigates back', async () => {
    (getMedication as jest.Mock).mockResolvedValue(makeMedication());
    (updateMedication as jest.Mock).mockResolvedValue(undefined);
    const { findByLabelText, getByLabelText } = await render(<EditMedicationScreen />);

    await findByLabelText('Medication name');
    await fireEvent.changeText(getByLabelText('Frequency'), 'twice daily');
    await fireEvent.press(await findByLabelText('Save changes'));

    expect(updateMedication).toHaveBeenCalledWith(
      'med1',
      expect.objectContaining({ name: 'Omeprazole', frequency: 'twice daily' }),
    );
    expect(mockBack).toHaveBeenCalled();
  });

  it('shows "Mark inactive" for an active medication; pressing it calls setMedicationActive(id, false)', async () => {
    (getMedication as jest.Mock).mockResolvedValue(makeMedication({ isActive: true }));
    (setMedicationActive as jest.Mock).mockResolvedValue(undefined);
    const { findByLabelText, queryByLabelText } = await render(<EditMedicationScreen />);

    expect(await findByLabelText('Mark inactive')).toBeTruthy();
    expect(queryByLabelText('Mark active')).toBeNull();

    (getMedication as jest.Mock).mockResolvedValue(makeMedication({ isActive: false }));
    await fireEvent.press(await findByLabelText('Mark inactive'));

    expect(setMedicationActive).toHaveBeenCalledWith('med1', false);
    await waitFor(async () => expect(await findByLabelText('Mark active')).toBeTruthy());
  });

  it('shows "Mark active" for an inactive medication; pressing it calls setMedicationActive(id, true)', async () => {
    (getMedication as jest.Mock).mockResolvedValue(makeMedication({ isActive: false }));
    (setMedicationActive as jest.Mock).mockResolvedValue(undefined);
    const { findByLabelText } = await render(<EditMedicationScreen />);

    expect(await findByLabelText('Mark active')).toBeTruthy();

    (getMedication as jest.Mock).mockResolvedValue(makeMedication({ isActive: true }));
    await fireEvent.press(await findByLabelText('Mark active'));

    expect(setMedicationActive).toHaveBeenCalledWith('med1', true);
    await waitFor(async () => expect(await findByLabelText('Mark inactive')).toBeTruthy());
  });
});
