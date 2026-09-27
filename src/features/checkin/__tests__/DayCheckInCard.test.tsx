import { fireEvent, render } from '@testing-library/react-native';

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

let mockCheckIns: { date: string; status: 'fine' | 'rough' }[] = [];
jest.mock('../useDayCheckIns', () => ({
  useDayCheckIns: () => mockCheckIns,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckIns = [];
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
