import { fireEvent, render } from '@testing-library/react-native';

import { Colors } from '@/constants/theme';
import { PrimaryButton } from '../primary-button';

describe('PrimaryButton', () => {
  it('renders the label and calls onPress when tapped', async () => {
    const onPress = jest.fn();
    const { getByText } = await render(<PrimaryButton label="Save" onPress={onPress} />);

    await fireEvent.press(getByText('Save'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('uses label as the accessibility label by default', async () => {
    const { getByLabelText } = await render(<PrimaryButton label="Save meal" onPress={jest.fn()} />);
    expect(getByLabelText('Save meal')).toBeTruthy();
  });

  it('an explicit accessibilityLabel overrides the visible label (e.g. a stable label while text switches to "Saving…")', async () => {
    const { getByLabelText, getByText } = await render(
      <PrimaryButton label="Saving…" accessibilityLabel="Save meal" onPress={jest.fn()} />,
    );
    expect(getByLabelText('Save meal')).toBeTruthy();
    expect(getByText('Saving…')).toBeTruthy();
  });

  it('is styled on the primary/primaryText palette tokens, not black/white', async () => {
    const { getByLabelText, getByText } = await render(<PrimaryButton label="Save" onPress={jest.fn()} />);
    expect(getByLabelText('Save')).toHaveStyle({ backgroundColor: Colors.light.primary });
    expect(getByText('Save')).toHaveStyle({ color: Colors.light.primaryText });
  });

  it('does not call onPress and lowers opacity when disabled', async () => {
    const onPress = jest.fn();
    const { getByLabelText } = await render(<PrimaryButton label="Save" onPress={onPress} disabled />);

    const button = getByLabelText('Save');
    expect(button).toHaveStyle({ opacity: 0.5 });
    await fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
  });

  it('sets accessibilityState.disabled to match the disabled prop', async () => {
    const { getByLabelText } = await render(<PrimaryButton label="Save" onPress={jest.fn()} disabled />);
    expect(getByLabelText('Save').props.accessibilityState).toEqual({ disabled: true });
  });
});
