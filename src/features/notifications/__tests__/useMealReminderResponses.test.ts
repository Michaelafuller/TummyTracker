import * as Notifications from 'expo-notifications';
import { renderHook, waitFor } from '@testing-library/react-native';

import { DEFAULT_TAP_ACTION } from '../model';
import { useMealReminderResponses } from '../useMealReminderResponses';

let mockResponse: unknown = null;
const mockPush = jest.fn();

jest.mock('expo-notifications', () => ({
  useLastNotificationResponse: jest.fn(() => mockResponse),
  clearLastNotificationResponse: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

function tap(
  identifier = 'notif-1',
  data: Record<string, unknown> = { slot: 'breakfast', hour: 8, minute: 0 },
  actionIdentifier = DEFAULT_TAP_ACTION,
  date = 1_000,
) {
  return { actionIdentifier, notification: { date, request: { identifier, content: { data } } } };
}

beforeEach(() => {
  mockResponse = null;
  jest.clearAllMocks();
});

describe('useMealReminderResponses', () => {
  it('opens the quick log for the tapped slot once, and clears the response', async () => {
    mockResponse = tap('notif-1', { slot: 'dinner', hour: 18, minute: 30 });
    const { rerender } = await renderHook(() => useMealReminderResponses());
    await rerender({});
    await rerender({});

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/quick-log', params: { slot: 'dinner' } }),
    );
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(Notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
  });

  // Review 2026-10-02: a DAILY trigger keeps its identifier every day; Home can
  // stay mounted for days, so the identifier alone ignored tomorrow's tap.
  it('the same daily reminder tapped again the next day opens the quick log again', async () => {
    mockResponse = tap('daily-breakfast', { slot: 'breakfast' }, DEFAULT_TAP_ACTION, 1_000);
    const { rerender } = await renderHook(() => useMealReminderResponses());
    expect(mockPush).toHaveBeenCalledTimes(1);

    mockResponse = tap('daily-breakfast', { slot: 'breakfast' }, DEFAULT_TAP_ACTION, 1_000 + 24 * 60 * 60 * 1000);
    await rerender({});
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it('handles a different notification identifier separately', async () => {
    mockResponse = tap('notif-a', { slot: 'lunch' });
    const { rerender } = await renderHook(() => useMealReminderResponses());
    expect(mockPush).toHaveBeenCalledTimes(1);

    mockResponse = tap('notif-b', { slot: 'breakfast' });
    await rerender({});
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/quick-log', params: { slot: 'breakfast' } });
  });

  it('ignores other slots, non-default actions, and no response', async () => {
    mockResponse = tap('n2', { slot: 'day-check-in', date: '2026-10-01' });
    const first = await renderHook(() => useMealReminderResponses());
    await first.unmount();

    mockResponse = tap('n3', { slot: 'lunch' }, 'something-else');
    const second = await renderHook(() => useMealReminderResponses());
    await second.unmount();

    mockResponse = null;
    await renderHook(() => useMealReminderResponses());

    expect(mockPush).not.toHaveBeenCalled();
    expect(Notifications.clearLastNotificationResponse).not.toHaveBeenCalled();
  });

  it('still navigates when clearing the response throws', async () => {
    (Notifications.clearLastNotificationResponse as jest.Mock).mockImplementationOnce(() => {
      throw new Error('boom');
    });
    mockResponse = tap('n4', { slot: 'breakfast' });
    await renderHook(() => useMealReminderResponses());
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
