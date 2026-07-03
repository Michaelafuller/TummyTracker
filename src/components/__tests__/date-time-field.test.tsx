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
