import * as Notifications from 'expo-notifications';
import { renderHook, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { createMedicationEvent, deleteMedicationEvent, listMedications } from '@/db/repository';
import type { Medication } from '@/db/schema';
import { DEFAULT_TAP_ACTION, MED_REMINDER_SLOT, MED_REMINDER_TOOK_ACTION } from '../reminderModel';
import { useMedReminderResponses } from '../useMedReminderResponses';

let mockResponse: unknown = null;
const mockPush = jest.fn();

jest.mock('expo-notifications', () => ({
  useLastNotificationResponse: jest.fn(() => mockResponse),
  dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
  clearLastNotificationResponse: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/db/repository', () => ({
  listMedications: jest.fn(),
  createMedicationEvent: jest.fn(),
  deleteMedicationEvent: jest.fn(),
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
    isRegular: false,
    notes: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function response(action: string, medicationIds: string[], identifier = 'notif-1', slot = MED_REMINDER_SLOT) {
  return {
    actionIdentifier: action,
    notification: { request: { identifier, content: { data: { slot, medicationIds } } } },
  };
}

const tookResponse = (ids: string[], identifier = 'notif-1') => response(MED_REMINDER_TOOK_ACTION, ids, identifier);

let dateNowSpy: jest.SpyInstance | undefined;

beforeEach(() => {
  mockResponse = null;
  jest.clearAllMocks();
  dateNowSpy = undefined;
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (listMedications as jest.Mock).mockResolvedValue([
    med('lev', 'Levothyroxine', { defaultDose: 50, doseUnit: 'mcg' }),
    med('vitd', 'Vitamin D', { defaultDose: 1000, doseUnit: 'unit' }),
  ]);
  (createMedicationEvent as jest.Mock).mockResolvedValue({ event: { id: 'event-1' }, doses: [] });
  (deleteMedicationEvent as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
  // Restore only the spies this file made — restoreAllMocks would also wipe the
  // module-factory mocks' implementations (useLastNotificationResponse etc.).
  dateNowSpy?.mockRestore();
  (Alert.alert as jest.Mock).mockRestore();
});

describe('useMedReminderResponses — Took them', () => {
  it('logs ONE event at the current default doses, then offers Undo (worked example: two meds, one tap)', async () => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 9, 1, 8, 2, 0).getTime());
    mockResponse = tookResponse(['lev', 'vitd']);
    const { rerender } = await renderHook(() => useMedReminderResponses());
    await rerender({});

    await waitFor(() => expect(createMedicationEvent).toHaveBeenCalledTimes(1));
    expect(createMedicationEvent).toHaveBeenCalledWith(
      { takenAt: new Date(2026, 9, 1, 8, 2, 0).getTime(), timeKnown: true, notes: null },
      [
        { medicationId: 'lev', dose: 50, doseUnit: 'mcg', reason: null },
        { medicationId: 'vitd', dose: 1000, doseUnit: 'unit', reason: null },
      ],
    );
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toBe(
      'Logged Levothyroxine 50 mcg, Vitamin D 1000 unit at 8:02 AM.',
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('logs exactly once even across re-renders with the same response', async () => {
    mockResponse = tookResponse(['lev']);
    const { rerender } = await renderHook(() => useMedReminderResponses());
    await rerender({});
    await waitFor(() => expect(createMedicationEvent).toHaveBeenCalledTimes(1));

    await rerender({});
    await rerender({});
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(createMedicationEvent).toHaveBeenCalledTimes(1);
  });

  it('uses the CURRENT defaults, not whatever they were when the reminder was scheduled', async () => {
    (listMedications as jest.Mock).mockResolvedValue([med('lev', 'Levothyroxine', { defaultDose: 75, doseUnit: 'mcg' })]);
    mockResponse = tookResponse(['lev']);
    const { rerender } = await renderHook(() => useMedReminderResponses());
    await rerender({});

    await waitFor(() => expect(createMedicationEvent).toHaveBeenCalledTimes(1));
    expect((createMedicationEvent as jest.Mock).mock.calls[0][1]).toEqual([
      { medicationId: 'lev', dose: 75, doseUnit: 'mcg', reason: null },
    ]);
  });

  it('skips an inactive or no-dose medication but logs the rest', async () => {
    (listMedications as jest.Mock).mockResolvedValue([
      med('lev', 'Levothyroxine'),
      med('off', 'Retired', { isActive: false }),
      med('nodose', 'No dose', { defaultDose: null }),
    ]);
    mockResponse = tookResponse(['lev', 'off', 'nodose']);
    const { rerender } = await renderHook(() => useMedReminderResponses());
    await rerender({});

    await waitFor(() => expect(createMedicationEvent).toHaveBeenCalledTimes(1));
    expect((createMedicationEvent as jest.Mock).mock.calls[0][1]).toEqual([
      { medicationId: 'lev', dose: 50, doseUnit: 'mcg', reason: null },
    ]);
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toMatch(/^Logged Levothyroxine 50 mcg at /);
  });

  it('falls back to opening the entry form, logging nothing, when none qualify', async () => {
    (listMedications as jest.Mock).mockResolvedValue([med('lev', 'Levothyroxine', { isActive: false })]);
    mockResponse = tookResponse(['lev', 'gone']);
    const { rerender } = await renderHook(() => useMedReminderResponses());
    await rerender({});

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/medication/entry/new',
        params: { medicationIds: 'lev,gone' },
      }),
    );
    expect(createMedicationEvent).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('opens the entry form (and logs nothing) when the write itself fails', async () => {
    (createMedicationEvent as jest.Mock).mockRejectedValue(new Error('db'));
    mockResponse = tookResponse(['lev']);
    const { rerender } = await renderHook(() => useMedReminderResponses());
    await rerender({});

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('Undo deletes exactly the event this tap created', async () => {
    mockResponse = tookResponse(['lev']);
    const { rerender } = await renderHook(() => useMedReminderResponses());
    await rerender({});
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));

    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as { text: string; onPress?: () => void }[];
    expect(buttons.map((b) => b.text)).toEqual(['Undo', 'OK']);
    expect(deleteMedicationEvent).not.toHaveBeenCalled();

    buttons[0].onPress?.();
    expect(deleteMedicationEvent).toHaveBeenCalledWith('event-1');
    expect(deleteMedicationEvent).toHaveBeenCalledTimes(1);
  });

  it('dismisses the notification and clears the last response after handling', async () => {
    mockResponse = tookResponse(['lev'], 'notif-9');
    const { rerender } = await renderHook(() => useMedReminderResponses());
    await rerender({});

    await waitFor(() => expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('notif-9'));
    expect(Notifications.clearLastNotificationResponse).toHaveBeenCalled();
  });
});

describe('useMedReminderResponses — tap to open', () => {
  it('navigates to the entry form with the ids and writes nothing', async () => {
    mockResponse = response(DEFAULT_TAP_ACTION, ['lev', 'vitd'], 'notif-2');
    const { rerender } = await renderHook(() => useMedReminderResponses());
    await rerender({});

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/medication/entry/new',
        params: { medicationIds: 'lev,vitd' },
      }),
    );
    expect(createMedicationEvent).not.toHaveBeenCalled();
    expect(listMedications).not.toHaveBeenCalled();
    await waitFor(() => expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('notif-2'));
  });

  it('navigates only once across re-renders', async () => {
    mockResponse = response(DEFAULT_TAP_ACTION, ['lev']);
    const { rerender } = await renderHook(() => useMedReminderResponses());
    await rerender({});
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));

    await rerender({});
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});

describe('useMedReminderResponses — ignored responses', () => {
  it('ignores another slot entirely', async () => {
    mockResponse = response(MED_REMINDER_TOOK_ACTION, ['lev'], 'notif-3', 'day-check-in');
    await renderHook(() => useMedReminderResponses());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(createMedicationEvent).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalled();
  });

  it('ignores an unknown action on our slot', async () => {
    mockResponse = response('something-else', ['lev']);
    await renderHook(() => useMedReminderResponses());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(createMedicationEvent).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does nothing when there is no last response', async () => {
    mockResponse = null;
    await renderHook(() => useMedReminderResponses());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(createMedicationEvent).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
