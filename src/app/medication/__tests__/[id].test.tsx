import { useEffect as mockUseEffect } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { getMedication, listMedicationReminders, setMedicationActive, updateMedication } from '@/db/repository';
import type { Medication, MedicationDose, MedicationEvent } from '@/db/schema';
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
  listMedicationReminders: jest.fn(),
  updateMedication: jest.fn(),
  setMedicationActive: jest.fn(),
}));

// The screen's adherence line + calendar read the live medication tables; the
// calendar library is stubbed to a host element so its props can be asserted.
let mockEvents: MedicationEvent[] = [];
let mockDoses: MedicationDose[] = [];
jest.mock('@/features/medications/useMedicationData', () => ({
  useMedicationEvents: () => mockEvents,
  useMedicationDoses: () => mockDoses,
}));

jest.mock('react-native-calendars', () => ({
  Calendar: 'MockCalendar',
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
    isRegular: false,
    notes: null,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (listMedicationReminders as jest.Mock).mockResolvedValue([]);
  mockEvents = [];
  mockDoses = [];
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

describe('EditMedicationScreen adherence view (GitHub #28)', () => {
  const NOW = new Date(2026, 9, 15, 12, 0).getTime(); // Thu 2026-10-15
  const daysAgoAt = (n: number) => new Date(2026, 9, 15 - n, 12, 0).getTime();

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function logDoses(medicationId: string, days: number[]) {
    days.forEach((n, i) => {
      const eventId = `ev-${medicationId}-${i}`;
      mockEvents.push({ id: eventId, takenAt: daysAgoAt(n), timeKnown: true, notes: null, createdAt: 0, updatedAt: 0 });
      mockDoses.push({
        id: `do-${medicationId}-${i}`,
        eventId,
        medicationId,
        dose: 10,
        doseUnit: 'mg',
        reason: null,
        createdAt: 0,
        updatedAt: 0,
      });
    });
  }

  it('shows the adherence line and a month calendar with a dot on each day this medication has a dose', async () => {
    (getMedication as jest.Mock).mockResolvedValue(makeMedication({ id: 'med1', isRegular: false }));
    logDoses('med1', [0, 3, 3, 20]); // two doses on the same day count once
    logDoses('other', [5]); // another medication's dose is not marked

    const { findByTestId } = await render(<EditMedicationScreen />);

    expect((await findByTestId('adherence-line')).props.children).toBe('Logged on 3 days in the last 30');
    const calendar = await findByTestId('dose-calendar');
    expect(calendar.props.current).toBe('2026-10-15');
    expect(Object.keys(calendar.props.markedDates).sort()).toEqual(['2026-09-25', '2026-10-12', '2026-10-15']);
    expect(calendar.props.markedDates['2026-10-12']).toMatchObject({ marked: true });
  });

  it('a regular medication reads "of the last 30 days" once it has a dose at the window start', async () => {
    (getMedication as jest.Mock).mockResolvedValue(makeMedication({ id: 'med1', isRegular: true }));
    logDoses('med1', [29, 10, 0]);

    const { findByTestId } = await render(<EditMedicationScreen />);

    expect((await findByTestId('adherence-line')).props.children).toBe('Logged on 3 of the last 30 days');
  });

  it('says so when nothing has been logged, and marks no days', async () => {
    (getMedication as jest.Mock).mockResolvedValue(makeMedication({ id: 'med1' }));

    const { findByTestId } = await render(<EditMedicationScreen />);

    expect((await findByTestId('adherence-line')).props.children).toBe('No doses logged in the last 30 days');
    expect((await findByTestId('dose-calendar')).props.markedDates).toEqual({});
  });
});

describe('EditMedicationScreen reminders (GitHub #29)', () => {
  it('loads the medication reminders into the form and saves them back with the patch', async () => {
    (getMedication as jest.Mock).mockResolvedValue(makeMedication());
    (listMedicationReminders as jest.Mock).mockResolvedValue([
      { id: 'r1', medicationId: 'med1', hour: 7, minute: 45, daysMask: 31, enabled: true, createdAt: 1, updatedAt: 1 },
    ]);
    (updateMedication as jest.Mock).mockResolvedValue(undefined);
    const { findByLabelText, findByTestId } = await render(<EditMedicationScreen />);

    expect(listMedicationReminders).toHaveBeenCalledWith('med1');
    expect(await findByTestId('reminder-0')).toBeTruthy();
    await fireEvent.press(await findByLabelText('Save changes'));

    expect(updateMedication).toHaveBeenCalledWith(
      'med1',
      expect.objectContaining({
        name: 'Omeprazole',
        reminders: [{ hour: 7, minute: 45, daysMask: 31, enabled: true }],
      }),
    );
  });

  it('removing the only reminder saves an empty list so the old rows are cleared', async () => {
    (getMedication as jest.Mock).mockResolvedValue(makeMedication());
    (listMedicationReminders as jest.Mock).mockResolvedValue([
      { id: 'r1', medicationId: 'med1', hour: 7, minute: 45, daysMask: 127, enabled: true, createdAt: 1, updatedAt: 1 },
    ]);
    (updateMedication as jest.Mock).mockResolvedValue(undefined);
    const { findByLabelText, findByTestId } = await render(<EditMedicationScreen />);

    await fireEvent.press(await findByTestId('reminder-0-remove'));
    await fireEvent.press(await findByLabelText('Save changes'));

    expect(updateMedication).toHaveBeenCalledWith('med1', expect.objectContaining({ reminders: [] }));
  });
});
