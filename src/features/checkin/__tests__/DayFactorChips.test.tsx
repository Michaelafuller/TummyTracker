import { fireEvent, render } from '@testing-library/react-native';

import { setDayFactors } from '@/db/repository';
import { usePrefsStore } from '@/features/prefs/prefsStore';
import { recordDayCheckIn } from '../dayCheckInService';
import { DayFactorChips } from '../DayFactorChips';

jest.mock('@/lib/haptics', () => ({
  tapFeedback: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../dayCheckInService', () => ({
  recordDayCheckIn: jest.fn().mockResolvedValue(undefined),
}));

// The chips read and write the day_factor table (GitHub #23).
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

beforeEach(() => {
  jest.clearAllMocks();
  mockFactors = [];
  usePrefsStore.setState({ trackPeriod: false });
});

describe('DayFactorChips (GitHub #23)', () => {
  it('renders sleep, stress, alcohol and caffeine chips — and no period chips by default', async () => {
    const { getByLabelText, queryByLabelText, getByText } = await render(<DayFactorChips date="2026-06-15" />);

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
    expect(getByText('Optional. Tap a chosen chip again to clear it.')).toBeTruthy();
  });

  it('tapping a chip saves only that field for the date, immediately', async () => {
    const { getByLabelText } = await render(<DayFactorChips date="2026-06-15" />);

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

  it('shows the selected chip from the date\'s row and clears it when tapped again', async () => {
    mockFactors = [factorRow({ stress: 4, sleep: 'poor' })];
    const { getByLabelText } = await render(<DayFactorChips date="2026-06-15" />);

    expect(getByLabelText('Stress: 4').props.accessibilityState.selected).toBe(true);
    expect(getByLabelText('Stress: 3').props.accessibilityState.selected).toBe(false);
    expect(getByLabelText('Sleep: Poor').props.accessibilityState.selected).toBe(true);

    await fireEvent.press(getByLabelText('Stress: 4'));
    expect(setDayFactors).toHaveBeenLastCalledWith('2026-06-15', { stress: null });
    await fireEvent.press(getByLabelText('Sleep: Poor'));
    expect(setDayFactors).toHaveBeenLastCalledWith('2026-06-15', { sleep: null });
  });

  it('ignores a factor row for a different date', async () => {
    mockFactors = [factorRow({ stress: 4 }, '2026-06-14')];
    const { getByLabelText } = await render(<DayFactorChips date="2026-06-15" />);
    expect(getByLabelText('Stress: 4').props.accessibilityState.selected).toBe(false);
  });

  it('changing a selected chip to another value sets the new value (not a clear)', async () => {
    mockFactors = [factorRow({ stress: 4 })];
    const { getByLabelText } = await render(<DayFactorChips date="2026-06-15" />);
    await fireEvent.press(getByLabelText('Stress: 2'));
    expect(setDayFactors).toHaveBeenLastCalledWith('2026-06-15', { stress: 2 });
  });

  it('shows period chips only when tracking is enabled, and saves a boolean', async () => {
    usePrefsStore.setState({ trackPeriod: true });
    const { getByLabelText } = await render(<DayFactorChips date="2026-06-15" />);

    await fireEvent.press(getByLabelText('Period: Yes'));
    expect(setDayFactors).toHaveBeenLastCalledWith('2026-06-15', { period: true });
    await fireEvent.press(getByLabelText('Period: No'));
    expect(setDayFactors).toHaveBeenLastCalledWith('2026-06-15', { period: false });
  });

  it('a "No" period selection clears when tapped again (null, not false)', async () => {
    usePrefsStore.setState({ trackPeriod: true });
    mockFactors = [factorRow({ period: false })];
    const { getByLabelText } = await render(<DayFactorChips date="2026-06-15" />);
    expect(getByLabelText('Period: No').props.accessibilityState.selected).toBe(true);
    await fireEvent.press(getByLabelText('Period: No'));
    expect(setDayFactors).toHaveBeenLastCalledWith('2026-06-15', { period: null });
  });

  it('does not touch the fine/rough check-in', async () => {
    const { getByLabelText } = await render(<DayFactorChips date="2026-06-15" />);
    await fireEvent.press(getByLabelText('Stress: 5'));
    expect(recordDayCheckIn).not.toHaveBeenCalled();
  });
});
