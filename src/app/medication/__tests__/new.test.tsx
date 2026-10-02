import { fireEvent, render } from '@testing-library/react-native';

import { createMedication } from '@/db/repository';
import NewMedicationScreen from '../new';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('@/db/repository', () => ({
  createMedication: jest.fn(),
}));

jest.mock('@/features/notifications/service', () => ({
  ensureNotificationPermission: jest.fn().mockResolvedValue(true),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('NewMedicationScreen', () => {
  it('entering a name and saving calls createMedication then navigates back', async () => {
    (createMedication as jest.Mock).mockResolvedValue({});
    const { getByLabelText, findByLabelText } = await render(<NewMedicationScreen />);

    await fireEvent.changeText(getByLabelText('Medication name'), 'Omeprazole');
    await fireEvent.press(await findByLabelText('Save'));

    expect(createMedication).toHaveBeenCalledTimes(1);
    expect(createMedication).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Omeprazole', defaultDose: null, doseUnit: null }),
    );
    expect(mockBack).toHaveBeenCalled();
  });

  it('passes the reminders added in the form to createMedication (GitHub #29)', async () => {
    (createMedication as jest.Mock).mockResolvedValue({});
    const { getByLabelText, findByLabelText, findByTestId } = await render(<NewMedicationScreen />);

    await fireEvent.changeText(getByLabelText('Medication name'), 'Vitamin D');
    await fireEvent.press(await findByTestId('reminder-add'));
    await findByTestId('reminder-0');
    await fireEvent.press(await findByLabelText('Save'));

    expect(createMedication).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Vitamin D',
        reminders: [{ hour: 8, minute: 0, daysMask: 127, enabled: true }],
      }),
    );
  });

  it('does not call createMedication or navigate back when validation fails', async () => {
    (createMedication as jest.Mock).mockResolvedValue({});
    const { findByLabelText } = await render(<NewMedicationScreen />);

    await fireEvent.press(await findByLabelText('Save'));

    expect(createMedication).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
