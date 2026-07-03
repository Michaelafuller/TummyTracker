import { fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { TimeField } from '../time-field';

// RNTL v14 renders asynchronously: `render` and `fireEvent.*` both return promises.
// See date-time-field.test.tsx for why synthetic onChange events must be
// shaped as native events (`{ nativeEvent: { timestamp } }`).
function nativeChangeEvent(date: Date) {
  return { nativeEvent: { timestamp: date.getTime(), utcOffset: 0 } };
}

describe('TimeField', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('displays the current time as a 12-hour chip', async () => {
    const { getByLabelText } = await render(
      <TimeField hour={8} minute={0} onChange={jest.fn()} accessibilityLabel="breakfast reminder time" />,
    );
    expect(getByLabelText('breakfast reminder time')).toBeTruthy();
    expect(getByLabelText('breakfast reminder time')).toHaveTextContent('8:00 AM');
  });

  it('on Android, a change event commits the value and closes the picker', async () => {
    Platform.OS = 'android';
    const onChange = jest.fn();
    const { getByLabelText, getByTestId, queryByTestId } = await render(
      <TimeField hour={8} minute={0} onChange={onChange} accessibilityLabel="breakfast reminder time" />,
    );

    await fireEvent.press(getByLabelText('breakfast reminder time'));
    expect(getByTestId('time-field-picker')).toBeTruthy();

    const changed = new Date();
    changed.setHours(9, 15, 0, 0);
    await fireEvent(getByTestId('time-field-picker'), 'onChange', nativeChangeEvent(changed));

    expect(onChange).toHaveBeenCalledWith(9, 15);
    expect(queryByTestId('time-field-picker')).toBeNull();
  });

  it('on iOS, a change event commits the value but does NOT unmount the picker, and Done closes it', async () => {
    Platform.OS = 'ios';
    const onChange = jest.fn();
    const { getByLabelText, getByTestId, queryByTestId } = await render(
      <TimeField hour={8} minute={0} onChange={onChange} accessibilityLabel="breakfast reminder time" />,
    );

    await fireEvent.press(getByLabelText('breakfast reminder time'));
    const changed = new Date();
    changed.setHours(9, 15, 0, 0);
    await fireEvent(getByTestId('time-field-picker'), 'onChange', nativeChangeEvent(changed));

    expect(onChange).toHaveBeenCalledWith(9, 15);
    expect(getByTestId('time-field-picker')).toBeTruthy();

    await fireEvent.press(getByLabelText('Done choosing time'));
    expect(queryByTestId('time-field-picker')).toBeNull();
  });
});
