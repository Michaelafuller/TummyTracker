import { fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { DateTimeField } from '../date-time-field';

// RNTL v14 renders asynchronously: `render` and `fireEvent.*` both return promises.
//
// Jest resolves @react-native-community/datetimepicker's `.ios.js` variant
// regardless of the `Platform.OS` we set below (Jest's haste config always
// picks the ios platform file at module-resolution time, not at runtime). Its
// wrapper expects a native-shaped event (`event.nativeEvent.timestamp`), so
// synthetic `onChange` events must be shaped that way rather than as the
// unified `(event, date)` pair our own component's handlers receive.
function nativeChangeEvent(date: Date) {
  return { nativeEvent: { timestamp: date.getTime(), utcOffset: 0 } };
}

describe('DateTimeField picker dismissal', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('on Android, a change event commits the value and closes the picker', async () => {
    Platform.OS = 'android';
    const onDateChange = jest.fn();
    const onTimeChange = jest.fn();
    const { getByLabelText, getByTestId, queryByTestId } = await render(
      <DateTimeField
        dateInput="2026-06-27"
        timeInput="08:30"
        onDateChange={onDateChange}
        onTimeChange={onTimeChange}
      />,
    );

    await fireEvent.press(getByLabelText('Choose time'));
    expect(getByTestId('date-time-picker')).toBeTruthy();

    await fireEvent(getByTestId('date-time-picker'), 'onChange', nativeChangeEvent(new Date(2026, 5, 27, 9, 15)));

    expect(onTimeChange).toHaveBeenCalledWith('09:15');
    expect(queryByTestId('date-time-picker')).toBeNull();
  });

  it('on iOS, a change event commits the value but does NOT unmount the picker', async () => {
    Platform.OS = 'ios';
    const onDateChange = jest.fn();
    const onTimeChange = jest.fn();
    const { getByLabelText, getByTestId } = await render(
      <DateTimeField
        dateInput="2026-06-27"
        timeInput="08:30"
        onDateChange={onDateChange}
        onTimeChange={onTimeChange}
      />,
    );

    await fireEvent.press(getByLabelText('Choose time'));
    await fireEvent(getByTestId('date-time-picker'), 'onChange', nativeChangeEvent(new Date(2026, 5, 27, 9, 15)));

    expect(onTimeChange).toHaveBeenCalledWith('09:15');
    // Still mounted — a wheel-pause commit must not unmount the spinner.
    expect(getByTestId('date-time-picker')).toBeTruthy();
  });

  it('on iOS, tapping Done closes the picker', async () => {
    Platform.OS = 'ios';
    const onDateChange = jest.fn();
    const onTimeChange = jest.fn();
    const { getByLabelText, getByTestId, queryByTestId } = await render(
      <DateTimeField
        dateInput="2026-06-27"
        timeInput="08:30"
        onDateChange={onDateChange}
        onTimeChange={onTimeChange}
      />,
    );

    await fireEvent.press(getByLabelText('Choose time'));
    expect(getByTestId('date-time-picker')).toBeTruthy();

    await fireEvent.press(getByLabelText('Done choosing time'));
    expect(queryByTestId('date-time-picker')).toBeNull();
  });

  it('opening the other chip switches modes without losing state', async () => {
    Platform.OS = 'ios';
    const onDateChange = jest.fn();
    const onTimeChange = jest.fn();
    const { getByLabelText, getByTestId } = await render(
      <DateTimeField
        dateInput="2026-06-27"
        timeInput="08:30"
        onDateChange={onDateChange}
        onTimeChange={onTimeChange}
      />,
    );

    await fireEvent.press(getByLabelText('Choose time'));
    await fireEvent(getByTestId('date-time-picker'), 'onChange', nativeChangeEvent(new Date(2026, 5, 27, 9, 15)));
    expect(onTimeChange).toHaveBeenCalledWith('09:15');

    await fireEvent.press(getByLabelText('Choose date'));
    expect(getByLabelText('Done choosing date')).toBeTruthy();
    // Time commit from before was not lost — onDateChange hasn't fired yet, and
    // onTimeChange retains its prior call.
    expect(onDateChange).not.toHaveBeenCalled();
    expect(onTimeChange).toHaveBeenCalledTimes(1);
  });
});

describe('DateTimeField mode="date" (HANDOFF.md §7 — additive date-only mode)', () => {
  it('hides the time chip and the Now shortcut, and keeps the date chip', async () => {
    const { getByLabelText, queryByLabelText } = await render(
      <DateTimeField
        dateInput="2026-06-27"
        timeInput="00:00"
        onDateChange={jest.fn()}
        onTimeChange={jest.fn()}
        mode="date"
      />,
    );

    expect(getByLabelText('Choose date')).toBeTruthy();
    expect(queryByLabelText('Choose time')).toBeNull();
    expect(queryByLabelText('Set to now')).toBeNull();
  });

  it('shows a Clear link when onClear is set and a date is present, and pressing it calls onClear', async () => {
    const onClear = jest.fn();
    const { getByLabelText } = await render(
      <DateTimeField
        dateInput="2026-06-27"
        timeInput="00:00"
        onDateChange={jest.fn()}
        onTimeChange={jest.fn()}
        mode="date"
        onClear={onClear}
      />,
    );

    await fireEvent.press(getByLabelText('Clear date'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('does not show Clear when the date is empty, even with onClear set', async () => {
    const { queryByLabelText } = await render(
      <DateTimeField
        dateInput=""
        timeInput="00:00"
        onDateChange={jest.fn()}
        onTimeChange={jest.fn()}
        mode="date"
        onClear={jest.fn()}
      />,
    );

    expect(queryByLabelText('Clear date')).toBeNull();
  });

  it('does not show Clear when onClear is omitted, even with a date set', async () => {
    const { queryByLabelText } = await render(
      <DateTimeField
        dateInput="2026-06-27"
        timeInput="00:00"
        onDateChange={jest.fn()}
        onTimeChange={jest.fn()}
        mode="date"
      />,
    );

    expect(queryByLabelText('Clear date')).toBeNull();
  });

  it('supports a custom label and a custom date-chip accessibility label, for two date fields on one screen', async () => {
    const { getByText, getByLabelText } = await render(
      <>
        <DateTimeField
          dateInput="2026-01-01"
          timeInput="00:00"
          onDateChange={jest.fn()}
          onTimeChange={jest.fn()}
          mode="date"
          label="Start date"
          dateAccessibilityLabel="Choose start date"
        />
        <DateTimeField
          dateInput="2026-02-01"
          timeInput="00:00"
          onDateChange={jest.fn()}
          onTimeChange={jest.fn()}
          mode="date"
          label="End date"
          dateAccessibilityLabel="Choose end date"
        />
      </>,
    );

    expect(getByText('Start date')).toBeTruthy();
    expect(getByText('End date')).toBeTruthy();
    expect(getByLabelText('Choose start date')).toBeTruthy();
    expect(getByLabelText('Choose end date')).toBeTruthy();
  });
});

describe('DateTimeField default mode ("datetime") is unchanged', () => {
  it('still shows the time chip and Now shortcut, with the default "When" label', async () => {
    const { getByLabelText, getByText } = await render(
      <DateTimeField
        dateInput="2026-06-27"
        timeInput="08:30"
        onDateChange={jest.fn()}
        onTimeChange={jest.fn()}
      />,
    );

    expect(getByText('When')).toBeTruthy();
    expect(getByLabelText('Choose date')).toBeTruthy();
    expect(getByLabelText('Choose time')).toBeTruthy();
    expect(getByLabelText('Set to now')).toBeTruthy();
  });
});
