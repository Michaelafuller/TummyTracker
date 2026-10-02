import { fireEvent, render } from '@testing-library/react-native';

import { setDayFactors } from '@/db/repository';
import { usePrefsStore } from '@/features/prefs/prefsStore';
import { formatDateInput } from '@/lib/datetime';
import DayDetailsScreen from '../day-details';

const mockBack = jest.fn();
let mockParams: { date?: string | string[] } = {};
const mockScreenOptions = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockParams,
  Stack: {
    Screen: (props: { options?: unknown }) => {
      mockScreenOptions(props.options);
      return null;
    },
  },
}));

jest.mock('@/lib/haptics', () => ({
  tapFeedback: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/repository', () => ({
  setDayFactors: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/features/checkin/useDayFactors', () => ({
  useDayFactors: () => [],
}));

type TreeNode = { type?: unknown; parent?: TreeNode | null } | null | undefined;

/** Host-component walk: RN's ScrollView renders the native `RCTScrollView` host node. */
function hasScrollViewAncestor(node: TreeNode): boolean {
  for (let current = node?.parent; current; current = current.parent) {
    if (current.type === 'RCTScrollView') return true;
  }
  return false;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  usePrefsStore.setState({ trackPeriod: false });
});

describe('DayDetailsScreen', () => {
  it('shows the chips for the date param and saves to that date', async () => {
    mockParams = { date: '2026-01-05' };
    const { getByLabelText } = await render(<DayDetailsScreen />);
    await fireEvent.press(getByLabelText('Stress: 4'));
    expect(setDayFactors).toHaveBeenLastCalledWith('2026-01-05', { stress: 4 });
  });

  it('titles a non-today date "Details for <long date>"', async () => {
    mockParams = { date: '2026-01-05' };
    await render(<DayDetailsScreen />);
    expect(mockScreenOptions).toHaveBeenCalledWith({ title: 'Details for January 5, 2026' });
  });

  it('falls back to today (title and writes) when the date param is missing', async () => {
    const { getByLabelText } = await render(<DayDetailsScreen />);
    expect(mockScreenOptions).toHaveBeenCalledWith({ title: "Today's details" });
    await fireEvent.press(getByLabelText('Sleep: Good'));
    expect(setDayFactors).toHaveBeenLastCalledWith(formatDateInput(Date.now()), { sleep: 'good' });
  });

  it('falls back to today when the date param is not a real day', async () => {
    mockParams = { date: '2026-02-30' };
    await render(<DayDetailsScreen />);
    expect(mockScreenOptions).toHaveBeenCalledWith({ title: "Today's details" });
  });

  it('titles today\'s own date "Today\'s details"', async () => {
    mockParams = { date: formatDateInput(Date.now()) };
    await render(<DayDetailsScreen />);
    expect(mockScreenOptions).toHaveBeenCalledWith({ title: "Today's details" });
  });

  it('accepts an array date param (first value)', async () => {
    mockParams = { date: ['2026-01-05', '2026-01-06'] };
    await render(<DayDetailsScreen />);
    expect(mockScreenOptions).toHaveBeenCalledWith({ title: 'Details for January 5, 2026' });
  });

  it('renders the Period row inside the scroll view when tracking is on', async () => {
    usePrefsStore.setState({ trackPeriod: true });
    const { getByLabelText, getByTestId } = await render(<DayDetailsScreen />);
    expect(getByLabelText('Period: Yes')).toBeTruthy();
    // The bug: Home's fixed layout pushed this row behind the tab bar. Here it
    // must sit inside a ScrollView so it is always reachable.
    expect(hasScrollViewAncestor(getByTestId('day-factor-period-true'))).toBe(true);
    expect(hasScrollViewAncestor(getByTestId('day-details-done'))).toBe(true);
  });

  it('has no Period row when tracking is off', async () => {
    const { queryByLabelText } = await render(<DayDetailsScreen />);
    expect(queryByLabelText('Period: Yes')).toBeNull();
  });

  it('Done goes back', async () => {
    const { getByLabelText } = await render(<DayDetailsScreen />);
    await fireEvent.press(getByLabelText('Done'));
    expect(mockBack).toHaveBeenCalled();
  });
});
