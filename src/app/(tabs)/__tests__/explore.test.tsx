import React from 'react';
import { PixelRatio } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { usePrefsStore } from '@/features/prefs/prefsStore';
import BrowseScreen from '../explore';

jest.mock('react-native-calendars', () => ({
  Calendar: 'MockCalendar',
  WeekCalendar: 'MockWeekCalendar',
  CalendarProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/features/logging/useEntries', () => ({
  useAllEntries: () => [],
}));

jest.mock('@/features/logging/EntryList', () => ({
  EntryList: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => {
  usePrefsStore.setState({ offlineMode: false, loaded: true });
});

describe('BrowseScreen calendar toggle', () => {
  it('defaults to collapsed state (Expand calendar button visible)', async () => {
    const { getByLabelText } = await render(<BrowseScreen />);
    expect(getByLabelText('Expand calendar')).toBeTruthy();
  });

  it('expands when the toggle is pressed', async () => {
    const { getByLabelText } = await render(<BrowseScreen />);
    await fireEvent.press(getByLabelText('Expand calendar'));
    expect(getByLabelText('Collapse calendar')).toBeTruthy();
  });

  it('collapses again on a second press', async () => {
    const { getByLabelText } = await render(<BrowseScreen />);
    await fireEvent.press(getByLabelText('Expand calendar'));
    await fireEvent.press(getByLabelText('Collapse calendar'));
    expect(getByLabelText('Expand calendar')).toBeTruthy();
  });
});

describe('BrowseScreen week strip sizing', () => {
  it('waits for the frame to be measured before mounting the week strip', async () => {
    const { queryByTestId, getByTestId } = await render(<BrowseScreen />);
    expect(getByTestId('week-calendar-frame')).toBeTruthy();
    expect(queryByTestId('week-calendar')).toBeNull();
  });

  it('pages the week strip by the measured frame width, not the screen width', async () => {
    const { getByTestId } = await render(<BrowseScreen />);
    await fireEvent(getByTestId('week-calendar-frame'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 344.6, height: 80 } },
    });
    // Pixel-exact, never rounded to whole dp (344.6 → 345 would page off-grid).
    expect(getByTestId('week-calendar').props.calendarWidth).toBe(PixelRatio.roundToNearestPixel(344.6));
    expect(getByTestId('week-calendar').props.calendarWidth).not.toBe(345);
  });

  it('themes today distinctly from the selected day', async () => {
    const { getByTestId } = await render(<BrowseScreen />);
    await fireEvent(getByTestId('week-calendar-frame'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 345, height: 80 } },
    });
    const { theme } = getByTestId('week-calendar').props;
    expect(theme.todayBackgroundColor).toBeDefined();
    expect(theme.todayBackgroundColor).not.toBe(theme.selectedDayBackgroundColor);
  });
});
