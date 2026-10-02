import { fireEvent, render } from '@testing-library/react-native';

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
  it('shows an "Add details" row when nothing is set', async () => {
    const { getByLabelText, getByText, queryByTestId } = await render(<DayCheckInCard date="2026-06-15" />);
    expect(getByLabelText('Add details for today')).toBeTruthy();
    expect(getByText('Add details')).toBeTruthy();
    // The chips live on /day-details now, never inline on Home.
    expect(queryByTestId('day-factors')).toBeNull();
  });

  it('pressing the row pushes /day-details with today\'s date', async () => {
    const { getByTestId } = await render(<DayCheckInCard date="2026-06-15" />);
    await fireEvent.press(getByTestId('day-factors-toggle'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/day-details', params: { date: '2026-06-15' } });
  });

  it('summarizes the set details in the row and labels it as an edit', async () => {
    mockFactors = [factorRow({ stress: 4, sleep: 'poor' })];
    const { getByText, getByLabelText, queryByLabelText } = await render(<DayCheckInCard date="2026-06-15" />);
    expect(getByText('Stress 4 · Poor sleep')).toBeTruthy();
    expect(getByLabelText('Edit details for today: Stress 4 · Poor sleep')).toBeTruthy();
    expect(queryByLabelText('Add details for today')).toBeNull();
  });

  it('pressing the summary row also pushes /day-details', async () => {
    mockFactors = [factorRow({ stress: 4 })];
    const { getByTestId } = await render(<DayCheckInCard date="2026-06-15" />);
    await fireEvent.press(getByTestId('day-factors-toggle'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/day-details', params: { date: '2026-06-15' } });
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

  it('opening details does not touch the fine/rough check-in', async () => {
    const { getByTestId } = await render(<DayCheckInCard date="2026-06-15" />);
    await fireEvent.press(getByTestId('day-factors-toggle'));
    expect(recordDayCheckIn).not.toHaveBeenCalled();
  });
});
