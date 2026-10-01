import { fireEvent, render } from '@testing-library/react-native';

import { setDayFactors } from '@/db/repository';
import { usePrefsStore } from '@/features/prefs/prefsStore';
import { recordDayCheckIn } from '../dayCheckInService';
import { DayCheckInCard } from '../DayCheckInCard';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/lib/haptics', () => ({
  tapFeedback: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../dayCheckInService', () => ({
  recordDayCheckIn: jest.fn().mockResolvedValue(undefined),
}));

// Today's day-details chips (GitHub #23) read and write the day_factor table.
jest.mock('@/db/repository', () => ({
  setDayFactors: jest.fn().mockResolvedValue(undefined),
}));

let mockFactors: unknown[] = [];
jest.mock('../useDayFactors', () => ({
  useDayFactors: () => mockFactors,
}));

function factorRow(overrides: Record<string, unknown>, date = '2026-06-15') {
  return {
    id: `f-${date}`,
    date,
    sleep: null,
    stress: null,
    alcohol: null,
    caffeine: null,
    period: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

let mockCheckIns: { date: string; status: 'fine' | 'rough' }[] = [];
jest.mock('../useDayCheckIns', () => ({
  useDayCheckIns: () => mockCheckIns,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckIns = [];
  mockFactors = [];
  usePrefsStore.setState({ trackPeriod: false });
});

describe('DayCheckInCard', () => {
  it('renders neither button selected when today has no answer yet', async () => {
    const { getByTestId } = await render(<DayCheckInCard date="2026-06-15" />);
    expect(getByTestId('day-check-in-fine').props.accessibilityState.selected).toBe(false);
    expect(getByTestId('day-check-in-rough').props.accessibilityState.selected).toBe(false);
  });

  it('tapping Fine records today\'s date as fine', async () => {
    const { getByTestId } = await render(<DayCheckInCard date="2026-06-15" />);
    await fireEvent.press(getByTestId('day-check-in-fine'));
    expect(recordDayCheckIn).toHaveBeenCalledWith('2026-06-15', 'fine');
  });

  it('tapping Rough records today\'s date as rough', async () => {
    const { getByTestId } = await render(<DayCheckInCard date="2026-06-15" />);
    await fireEvent.press(getByTestId('day-check-in-rough'));
    expect(recordDayCheckIn).toHaveBeenCalledWith('2026-06-15', 'rough');
  });

  it('shows Fine as selected when today is already answered fine', async () => {
    mockCheckIns = [{ date: '2026-06-15', status: 'fine' }];
    const { getByTestId } = await render(<DayCheckInCard date="2026-06-15" />);
    expect(getByTestId('day-check-in-fine').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('day-check-in-rough').props.accessibilityState.selected).toBe(false);
  });

  it('shows Rough as selected and the "Add a symptom" link when today is rough', async () => {
    mockCheckIns = [{ date: '2026-06-15', status: 'rough' }];
    const { getByTestId, getByLabelText, getByText } = await render(<DayCheckInCard date="2026-06-15" />);
    expect(getByTestId('day-check-in-rough').props.accessibilityState.selected).toBe(true);
    expect(getByText('Rough day noted.')).toBeTruthy();

    await fireEvent.press(getByLabelText('Add a symptom for today'));
    expect(mockPush).toHaveBeenCalledWith('/symptom/new');
  });

  it('does not show the "Add a symptom" link when today is fine', async () => {
    mockCheckIns = [{ date: '2026-06-15', status: 'fine' }];
    const { queryByLabelText } = await render(<DayCheckInCard date="2026-06-15" />);
    expect(queryByLabelText('Add a symptom for today')).toBeNull();
  });

  it('ignores a check-in row for a different date', async () => {
    mockCheckIns = [{ date: '2026-06-14', status: 'rough' }];
    const { getByTestId } = await render(<DayCheckInCard date="2026-06-15" />);
    expect(getByTestId('day-check-in-fine').props.accessibilityState.selected).toBe(false);
    expect(getByTestId('day-check-in-rough').props.accessibilityState.selected).toBe(false);
  });
});

describe('DayCheckInCard — day details (GitHub #23)', () => {
  it('is collapsed by default: an "Add details" link and no chips', async () => {
    const { getByLabelText, getByText, queryByTestId } = await render(<DayCheckInCard date="2026-06-15" />);
    expect(getByLabelText('Add details for today')).toBeTruthy();
    expect(getByText('Add details')).toBeTruthy();
    expect(queryByTestId('day-factors')).toBeNull();
  });

  it('expands to sleep, stress, alcohol and caffeine chips — and no period chips by default', async () => {
    const { getByLabelText, queryByLabelText } = await render(<DayCheckInCard date="2026-06-15" />);
    await fireEvent.press(getByLabelText('Add details for today'));

    for (const label of [
      'Sleep: Poor',
      'Sleep: OK',
      'Sleep: Good',
      'Stress: 1',
      'Stress: 5',
      'Alcohol: None',
      'Alcohol: Some',
      'Alcohol: A lot',
      'Caffeine: None',
      'Caffeine: Usual',
      'Caffeine: More',
    ]) {
      expect(getByLabelText(label)).toBeTruthy();
    }
    expect(queryByLabelText('Period: Yes')).toBeNull();
    expect(queryByLabelText('Period: No')).toBeNull();
  });

  it('collapses again with "Hide details"', async () => {
    const { getByLabelText, queryByTestId } = await render(<DayCheckInCard date="2026-06-15" />);
    await fireEvent.press(getByLabelText('Add details for today'));
    expect(queryByTestId('day-factors')).not.toBeNull();
    await fireEvent.press(getByLabelText('Hide details for today'));
    expect(queryByTestId('day-factors')).toBeNull();
  });

  it('tapping a chip saves only that field for today, immediately', async () => {
    const { getByLabelText } = await render(<DayCheckInCard date="2026-06-15" />);
    await fireEvent.press(getByLabelText('Add details for today'));

    await fireEvent.press(getByLabelText('Stress: 4'));
    expect(setDayFactors).toHaveBeenLastCalledWith('2026-06-15', { stress: 4 });

    await fireEvent.press(getByLabelText('Sleep: Poor'));
    expect(setDayFactors).toHaveBeenLastCalledWith('2026-06-15', { sleep: 'poor' });

    await fireEvent.press(getByLabelText('Alcohol: A lot'));
    expect(setDayFactors).toHaveBeenLastCalledWith('2026-06-15', { alcohol: 'a_lot' });

    await fireEvent.press(getByLabelText('Caffeine: More'));
    expect(setDayFactors).toHaveBeenLastCalledWith('2026-06-15', { caffeine: 'more' });
    expect(setDayFactors).toHaveBeenCalledTimes(4);
  });

  it('shows the selected chip from today\'s row and clears it when tapped again', async () => {
    mockFactors = [factorRow({ stress: 4, sleep: 'poor' })];
    const { getByLabelText } = await render(<DayCheckInCard date="2026-06-15" />);
    await fireEvent.press(getByLabelText('Add details for today'));

    expect(getByLabelText('Stress: 4').props.accessibilityState.selected).toBe(true);
    expect(getByLabelText('Stress: 3').props.accessibilityState.selected).toBe(false);
    expect(getByLabelText('Sleep: Poor').props.accessibilityState.selected).toBe(true);

    await fireEvent.press(getByLabelText('Stress: 4'));
    expect(setDayFactors).toHaveBeenLastCalledWith('2026-06-15', { stress: null });
    await fireEvent.press(getByLabelText('Sleep: Poor'));
    expect(setDayFactors).toHaveBeenLastCalledWith('2026-06-15', { sleep: null });
  });

  it('changing a selected chip to another value sets the new value (not a clear)', async () => {
    mockFactors = [factorRow({ stress: 4 })];
    const { getByLabelText } = await render(<DayCheckInCard date="2026-06-15" />);
    await fireEvent.press(getByLabelText('Add details for today'));
    await fireEvent.press(getByLabelText('Stress: 2'));
    expect(setDayFactors).toHaveBeenLastCalledWith('2026-06-15', { stress: 2 });
  });

  it('summarizes the set details in the collapsed row', async () => {
    mockFactors = [factorRow({ stress: 4, sleep: 'poor' })];
    const { getByText, getByLabelText } = await render(<DayCheckInCard date="2026-06-15" />);
    expect(getByText('Stress 4 · Poor sleep')).toBeTruthy();
    // The link keeps its label so it stays findable.
    expect(getByLabelText('Add details for today')).toBeTruthy();
  });

  it('ignores a factor row for a different date', async () => {
    mockFactors = [factorRow({ stress: 4 }, '2026-06-14')];
    const { getByText } = await render(<DayCheckInCard date="2026-06-15" />);
    expect(getByText('Add details')).toBeTruthy();
  });

  it('a row whose chips were all cleared summarizes as "Add details"', async () => {
    mockFactors = [factorRow({})];
    const { getByText } = await render(<DayCheckInCard date="2026-06-15" />);
    expect(getByText('Add details')).toBeTruthy();
  });

  it('shows period chips only when tracking is enabled, and saves a boolean', async () => {
    usePrefsStore.setState({ trackPeriod: true });
    const { getByLabelText } = await render(<DayCheckInCard date="2026-06-15" />);
    await fireEvent.press(getByLabelText('Add details for today'));

    await fireEvent.press(getByLabelText('Period: Yes'));
    expect(setDayFactors).toHaveBeenLastCalledWith('2026-06-15', { period: true });
    await fireEvent.press(getByLabelText('Period: No'));
    expect(setDayFactors).toHaveBeenLastCalledWith('2026-06-15', { period: false });
  });

  it('a "No" period selection clears when tapped again (null, not false)', async () => {
    usePrefsStore.setState({ trackPeriod: true });
    mockFactors = [factorRow({ period: false })];
    const { getByLabelText } = await render(<DayCheckInCard date="2026-06-15" />);
    await fireEvent.press(getByLabelText('Add details for today'));
    expect(getByLabelText('Period: No').props.accessibilityState.selected).toBe(true);
    await fireEvent.press(getByLabelText('Period: No'));
    expect(setDayFactors).toHaveBeenLastCalledWith('2026-06-15', { period: null });
  });

  it('keeps period out of the summary while tracking is off', async () => {
    mockFactors = [factorRow({ period: true })];
    const { getByText } = await render(<DayCheckInCard date="2026-06-15" />);
    expect(getByText('Add details')).toBeTruthy();
  });

  it('includes period in the summary when tracking is on', async () => {
    usePrefsStore.setState({ trackPeriod: true });
    mockFactors = [factorRow({ stress: 2, period: true })];
    const { getByText } = await render(<DayCheckInCard date="2026-06-15" />);
    expect(getByText('Stress 2 · Period')).toBeTruthy();
  });

  it('does not touch the fine/rough check-in', async () => {
    const { getByLabelText } = await render(<DayCheckInCard date="2026-06-15" />);
    await fireEvent.press(getByLabelText('Add details for today'));
    await fireEvent.press(getByLabelText('Stress: 5'));
    expect(recordDayCheckIn).not.toHaveBeenCalled();
  });
});
