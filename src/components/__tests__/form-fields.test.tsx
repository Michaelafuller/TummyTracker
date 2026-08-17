import { fireEvent, render } from '@testing-library/react-native';

import { ThemedTextInput } from '../form-fields';

/**
 * Wrapper contract tests for the dictation-safe fix (HANDOFF.md Cycle B).
 * `fireEvent.changeText` cannot reproduce real iOS dictation's marked-text
 * stream, so these assert the contract the fix actually promises instead:
 * a user-typed change round-trips through `onChangeText` without the
 * wrapper forcing a different value back into the field (that forcing is
 * exactly what invalidated the marked-text session and doubled the text),
 * while a genuine *programmatic* `value` change (search-result fill,
 * serving-size rescale, form reset — none of which come from this
 * component's own `onChangeText`) still reaches the field.
 */
function ControlledField({ value, onChangeText }: { value: string; onChangeText: (text: string) => void }) {
  return <ThemedTextInput value={value} onChangeText={onChangeText} accessibilityLabel="field" />;
}

describe('ThemedTextInput', () => {
  it('shows the initial value', async () => {
    const { getByDisplayValue } = await render(<ControlledField value="hello" onChangeText={jest.fn()} />);
    expect(getByDisplayValue('hello')).toBeTruthy();
  });

  it('round-trips a user-typed change through onChangeText exactly once', async () => {
    const onChangeText = jest.fn();
    const { getByLabelText } = await render(<ControlledField value="start" onChangeText={onChangeText} />);

    await fireEvent.changeText(getByLabelText('field'), 'typed by user');

    expect(onChangeText).toHaveBeenCalledTimes(1);
    expect(onChangeText).toHaveBeenCalledWith('typed by user');
  });

  it('does not fire another onChangeText of its own once the caller commits the typed value back as `value`', async () => {
    const onChangeText = jest.fn();
    const { getByLabelText, rerender } = await render(<ControlledField value="start" onChangeText={onChangeText} />);

    await fireEvent.changeText(getByLabelText('field'), 'typed by user');
    // Every real call site re-renders with the new value straight from its
    // own onChangeText handler's state update — mirror that here.
    await rerender(<ControlledField value="typed by user" onChangeText={onChangeText} />);

    expect(onChangeText).toHaveBeenCalledTimes(1);
  });

  it('applies consecutive user keystrokes without the wrapper resetting the field between them', async () => {
    const onChangeText = jest.fn();
    const { getByLabelText, getByDisplayValue, rerender } = await render(
      <ControlledField value="" onChangeText={onChangeText} />,
    );
    const field = getByLabelText('field');

    await fireEvent.changeText(field, 'a');
    await rerender(<ControlledField value="a" onChangeText={onChangeText} />);
    await fireEvent.changeText(field, 'ab');
    await rerender(<ControlledField value="ab" onChangeText={onChangeText} />);
    await fireEvent.changeText(field, 'abc');
    await rerender(<ControlledField value="abc" onChangeText={onChangeText} />);

    expect(onChangeText).toHaveBeenNthCalledWith(1, 'a');
    expect(onChangeText).toHaveBeenNthCalledWith(2, 'ab');
    expect(onChangeText).toHaveBeenNthCalledWith(3, 'abc');
    expect(getByDisplayValue('abc')).toBeTruthy();
  });

  it('a programmatic value change (not echoed from onChangeText) still reaches the field', async () => {
    const onChangeText = jest.fn();
    const { getByDisplayValue, rerender } = await render(<ControlledField value="start" onChangeText={onChangeText} />);

    // e.g. an OFF search-result fill or a serving-size rescale: the caller
    // changes `value` directly, never through this field's own onChangeText.
    await rerender(<ControlledField value="filled by search" onChangeText={onChangeText} />);

    expect(getByDisplayValue('filled by search')).toBeTruthy();
    expect(onChangeText).not.toHaveBeenCalled();
  });
});
