import * as Notifications from 'expo-notifications';
import { renderHook, waitFor } from '@testing-library/react-native';

import { getExperiment } from '@/db/repository';
import type { Experiment } from '@/db/schema';
import { DEFAULT_TAP_ACTION, EXPERIMENT_SLOT } from '../experimentNotificationsModel';
import { useExperimentNotificationResponses } from '../useExperimentNotificationResponses';

let mockResponse: unknown = null;
const mockPush = jest.fn();

jest.mock('expo-notifications', () => ({
  useLastNotificationResponse: jest.fn(() => mockResponse),
  clearLastNotificationResponse: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/db/repository', () => ({
  getExperiment: jest.fn(),
}));

function experimentRow(overrides: Partial<Experiment> = {}): Experiment {
  return {
    id: 'exp1',
    term: 'lactose',
    startDate: '2026-09-28',
    baselineDays: 14,
    eliminationDays: 14,
    challengeDays: 3,
    observationDays: 3,
    status: 'active',
    verdictJson: null,
    endedAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function tap(identifier = 'notif-1', data: Record<string, unknown> = { slot: EXPERIMENT_SLOT, experimentId: 'exp1' }) {
  return {
    actionIdentifier: DEFAULT_TAP_ACTION,
    notification: { request: { identifier, content: { data } } },
  };
}

beforeEach(() => {
  mockResponse = null;
  jest.clearAllMocks();
  (getExperiment as jest.Mock).mockResolvedValue(experimentRow());
});

describe('useExperimentNotificationResponses', () => {
  it('opens the experiment screen once and clears the response on a tap on our notification', async () => {
    mockResponse = tap();
    const { rerender } = await renderHook(() => useExperimentNotificationResponses());
    await rerender({});
    await rerender({});

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/experiment/exp1'));
    await waitFor(() => expect(Notifications.clearLastNotificationResponse).toHaveBeenCalled());
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(getExperiment).toHaveBeenCalledWith('exp1');
  });

  it('ignores other slots (the day check-in hook owns those)', async () => {
    mockResponse = tap('notif-2', { slot: 'day-check-in', date: '2026-10-12' });
    await renderHook(() => useExperimentNotificationResponses());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getExperiment).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(Notifications.clearLastNotificationResponse).not.toHaveBeenCalled();
  });

  it('does nothing for an experiment that is not active, but still clears the response', async () => {
    (getExperiment as jest.Mock).mockResolvedValue(experimentRow({ status: 'completed' }));
    mockResponse = tap('notif-3');
    await renderHook(() => useExperimentNotificationResponses());

    await waitFor(() => expect(Notifications.clearLastNotificationResponse).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does nothing for an experiment that no longer exists', async () => {
    (getExperiment as jest.Mock).mockResolvedValue(undefined);
    mockResponse = tap('notif-4');
    await renderHook(() => useExperimentNotificationResponses());

    await waitFor(() => expect(Notifications.clearLastNotificationResponse).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does nothing when there is no last response', async () => {
    await renderHook(() => useExperimentNotificationResponses());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getExperiment).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('survives a failed lookup', async () => {
    (getExperiment as jest.Mock).mockRejectedValue(new Error('boom'));
    mockResponse = tap('notif-5');
    await renderHook(() => useExperimentNotificationResponses());

    await waitFor(() => expect(Notifications.clearLastNotificationResponse).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });
});
