import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import type { Medication } from '@/db/schema';
import { RegularMedsButton } from '../RegularMedsButton';

let mockMedications: Medication[] = [];
jest.mock('../useMedicationData', () => ({
  useMedications: () => mockMedications,
}));

const mockCreate = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/db/repository', () => ({
  createMedicationEvent: (...args: unknown[]) => mockCreate(...args),
  deleteMedicationEvent: (...args: unknown[]) => mockDelete(...args),
}));

function med(id: string, name: string, overrides: Partial<Medication> = {}): Medication {
  return {
    id,
    name,
    defaultDose: 50,
    doseUnit: 'mcg',
    frequency: null,
    startDate: null,
    endDate: null,
    isActive: true,
    isRegular: true,
    notes: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMedications = [];
  mockCreate.mockImplementation(async () => ({ event: { id: 'evt-1' }, doses: [] }));
  mockDelete.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('RegularMedsButton', () => {
  it('renders nothing when there are no regular medications', async () => {
    mockMedications = [med('a', 'Plain', { isRegular: false }), med('b', 'Stopped', { isActive: false })];
    const { queryByTestId } = await render(<RegularMedsButton />);
    expect(queryByTestId('regular-meds-log')).toBeNull();
    expect(queryByTestId('regular-meds-undo')).toBeNull();
  });

  it('lists what it will log and writes exactly one event with only the active regular doses', async () => {
    mockMedications = [
      med('a', 'Levothyroxine'),
      med('b', 'Vitamin D', { defaultDose: 1000, doseUnit: 'unit' }),
      med('c', 'Old', { isActive: false }),
      med('d', 'Occasional', { isRegular: false }),
    ];
    const { findByTestId, getByText, findByLabelText } = await render(<RegularMedsButton />);

    expect(getByText('Levothyroxine 50 mcg · Vitamin D 1000 unit')).toBeTruthy();
    expect(await findByLabelText('Took my regular meds: Levothyroxine, Vitamin D')).toBeTruthy();

    const before = Date.now();
    await fireEvent.press(await findByTestId('regular-meds-log'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    const [event, doses] = mockCreate.mock.calls[0];
    expect(event).toMatchObject({ timeKnown: true, notes: null });
    expect(event.takenAt).toBeGreaterThanOrEqual(before);
    expect(doses).toEqual([
      { medicationId: 'a', dose: 50, doseUnit: 'mcg' },
      { medicationId: 'b', dose: 1000, doseUnit: 'unit' },
    ]);
  });

  it('replaces the button with "Logged at … · Undo" after a log, so a second tap cannot log twice', async () => {
    mockMedications = [med('a', 'Levothyroxine')];
    const { findByTestId, queryByTestId, getByText } = await render(<RegularMedsButton />);

    await fireEvent.press(await findByTestId('regular-meds-log'));
    expect(await findByTestId('regular-meds-undo')).toBeTruthy();
    expect(queryByTestId('regular-meds-log')).toBeNull();
    expect(getByText(/^Logged at /)).toBeTruthy();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('ignores a second tap while the first save is still in flight', async () => {
    mockMedications = [med('a', 'Levothyroxine')];
    mockCreate.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ event: { id: 'evt-1' }, doses: [] }), 20)),
    );
    const { findByTestId } = await render(<RegularMedsButton />);
    const button = await findByTestId('regular-meds-log');

    // Both presses land inside one act, before the (delayed) first save resolves.
    await act(async () => {
      fireEvent.press(button);
      fireEvent.press(button);
    });

    expect(await findByTestId('regular-meds-undo')).toBeTruthy();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('Undo deletes that one event id and brings the button back', async () => {
    mockMedications = [med('a', 'Levothyroxine')];
    mockCreate.mockImplementation(async () => ({ event: { id: 'evt-42' }, doses: [] }));
    const { findByTestId, queryByTestId } = await render(<RegularMedsButton />);

    await fireEvent.press(await findByTestId('regular-meds-log'));
    await fireEvent.press(await findByTestId('regular-meds-undo'));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('evt-42'));
    expect(await findByTestId('regular-meds-log')).toBeTruthy();
    expect(queryByTestId('regular-meds-undo')).toBeNull();
  });

  it('shows an Alert and keeps the button when saving fails', async () => {
    mockMedications = [med('a', 'Levothyroxine')];
    mockCreate.mockRejectedValue(new Error('boom'));
    const { findByTestId, queryByTestId } = await render(<RegularMedsButton />);

    await fireEvent.press(await findByTestId('regular-meds-log'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    expect(queryByTestId('regular-meds-undo')).toBeNull();
    expect(await findByTestId('regular-meds-log')).toBeTruthy();
  });

  it('shows an Alert and stays "Logged" when Undo fails', async () => {
    mockMedications = [med('a', 'Levothyroxine')];
    mockDelete.mockRejectedValue(new Error('boom'));
    const { findByTestId } = await render(<RegularMedsButton />);

    await fireEvent.press(await findByTestId('regular-meds-log'));
    await fireEvent.press(await findByTestId('regular-meds-undo'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    expect(await findByTestId('regular-meds-undo')).toBeTruthy();
  });
});
