import * as Notifications from 'expo-notifications';
import { renderHook, waitFor } from '@testing-library/react-native';

import { DAY_CHECK_IN_ACTIONS, DAY_CHECK_IN_SLOT } from '../dayCheckInModel';
import { recordDayCheckIn } from '../dayCheckInService';
import { useDayCheckInResponses } from '../useDayCheckInResponses';

let mockResponse: unknown = null;

jest.mock('expo-notifications', () => ({
  useLastNotificationResponse: jest.fn(() => mockResponse),
  dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
  clearLastNotificationResponse: jest.fn(),
}));

jest.mock('../dayCheckInService', () => ({
  recordDayCheckIn: jest.fn().mockResolvedValue(undefined),
}));

function fineResponse(identifier = 'notif-1', date = '2026-06-14') {
  return {
    actionIdentifier: DAY_CHECK_IN_ACTIONS.fine,
    notification: { request: { identifier, content: { data: { slot: DAY_CHECK_IN_SLOT, date } } } },
  };
}

beforeEach(() => {
  mockResponse = null;
  jest.clearAllMocks();
});

describe('useDayCheckInResponses', () => {
  it('records the notification\'s own date, not today\'s, on a Fine action', async () => {
    mockResponse = fineResponse('notif-1', '2026-06-14');
    const { rerender } = await renderHook(() => useDayCheckInResponses());
    rerender({});

    await waitFor(() => expect(recordDayCheckIn).toHaveBeenCalledWith('2026-06-14', 'fine'));
  });

  it('dismisses the notification and clears the last response after recording', async () => {
    mockResponse = fineResponse('notif-2', '2026-06-14');
    const { rerender } = await renderHook(() => useDayCheckInResponses());
    rerender({});

    await waitFor(() => expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('notif-2'));
    expect(Notifications.clearLastNotificationResponse).toHaveBeenCalled();
  });

  it('records a Rough action with its own status', async () => {
    mockResponse = {
      actionIdentifier: DAY_CHECK_IN_ACTIONS.rough,
      notification: { request: { identifier: 'notif-3', content: { data: { slot: DAY_CHECK_IN_SLOT, date: '2026-06-14' } } } },
    };
    const { rerender } = await renderHook(() => useDayCheckInResponses());
    rerender({});

    await waitFor(() => expect(recordDayCheckIn).toHaveBeenCalledWith('2026-06-14', 'rough'));
  });

  it('does nothing for a plain body tap (parses to null)', async () => {
    mockResponse = {
      actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
      notification: { request: { identifier: 'notif-4', content: { data: { slot: DAY_CHECK_IN_SLOT, date: '2026-06-14' } } } },
    };
    const { rerender } = await renderHook(() => useDayCheckInResponses());
    rerender({});

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(recordDayCheckIn).not.toHaveBeenCalled();
    expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalled();
  });

  it('records the same response only once even across re-renders', async () => {
    mockResponse = fineResponse('notif-5', '2026-06-14');
    const { rerender } = await renderHook(() => useDayCheckInResponses());
    rerender({});
    await waitFor(() => expect(recordDayCheckIn).toHaveBeenCalledTimes(1));

    // Re-render again with the SAME response object still current (e.g. a
    // sibling state update) — must not record a second time.
    rerender({});
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(recordDayCheckIn).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is no last response', async () => {
    mockResponse = null;
    await renderHook(() => useDayCheckInResponses());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(recordDayCheckIn).not.toHaveBeenCalled();
  });
});
