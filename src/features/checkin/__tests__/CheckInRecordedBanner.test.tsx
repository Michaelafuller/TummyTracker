import { act, fireEvent, render } from '@testing-library/react-native';

import { tapFeedback } from '@/lib/haptics';
import { formatDateInput } from '@/lib/datetime';
import { useCheckInFeedbackStore } from '../checkInFeedbackStore';
import { CheckInRecordedBanner } from '../CheckInRecordedBanner';

jest.mock('@/lib/haptics', () => ({
  tapFeedback: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  useCheckInFeedbackStore.setState({ recorded: null });
});

afterEach(() => {
  jest.useRealTimers();
});

// RNTL v14: act() is async — always awaited.
async function show(status: 'fine' | 'rough', date: string, at = Date.now()) {
  await act(async () => {
    useCheckInFeedbackStore.getState().show({ date, status, at });
  });
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('CheckInRecordedBanner', () => {
  it('renders nothing when nothing was recorded', async () => {
    const { queryByTestId } = await render(<CheckInRecordedBanner />);
    expect(queryByTestId('check-in-recorded-banner')).toBeNull();
    expect(tapFeedback).not.toHaveBeenCalled();
  });

  it('shows the confirmation and fires success feedback once', async () => {
    const { getByTestId, getByText } = await render(<CheckInRecordedBanner />);
    await show('rough', formatDateInput(Date.now()));

    expect(getByTestId('check-in-recorded-banner')).toBeTruthy();
    expect(getByText('✓ Rough day recorded')).toBeTruthy();
    expect(tapFeedback).toHaveBeenCalledTimes(1);
    expect(tapFeedback).toHaveBeenCalledWith('success');
  });

  it('names the day when it was not today', async () => {
    const { getByText } = await render(<CheckInRecordedBanner />);
    const now = new Date(2026, 8, 3, 12, 0).getTime();
    await show('fine', '2026-09-02', now);
    expect(getByText('✓ Fine day recorded for Sep 2')).toBeTruthy();
  });

  it('hides itself after 4 seconds', async () => {
    const { queryByTestId } = await render(<CheckInRecordedBanner />);
    await show('fine', formatDateInput(Date.now()));
    expect(queryByTestId('check-in-recorded-banner')).toBeTruthy();

    await advance(3900);
    expect(queryByTestId('check-in-recorded-banner')).toBeTruthy();

    await advance(200);
    expect(queryByTestId('check-in-recorded-banner')).toBeNull();
  });

  it('hides on tap', async () => {
    const { getByTestId, queryByTestId } = await render(<CheckInRecordedBanner />);
    await show('fine', formatDateInput(Date.now()));

    await fireEvent.press(getByTestId('check-in-recorded-banner'));
    expect(queryByTestId('check-in-recorded-banner')).toBeNull();
  });

  it('a newer answer restarts the timer and fires feedback again', async () => {
    const { queryByTestId } = await render(<CheckInRecordedBanner />);
    const today = formatDateInput(Date.now());
    await show('fine', today, 1000);
    await advance(3000);
    await show('rough', today, 2000);
    expect(tapFeedback).toHaveBeenCalledTimes(2);

    await advance(3000);
    expect(queryByTestId('check-in-recorded-banner')).toBeTruthy();
    await advance(1100);
    expect(queryByTestId('check-in-recorded-banner')).toBeNull();
  });
});
