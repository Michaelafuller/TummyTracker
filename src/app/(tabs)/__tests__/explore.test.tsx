import React from 'react';
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
