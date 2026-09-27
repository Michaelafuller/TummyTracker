import { fireEvent, render } from '@testing-library/react-native';
import { Keyboard, Platform, Text } from 'react-native';

import { Spacing } from '@/constants/theme';
import { FormScrollView, KeyboardShiftView } from '../keyboard-aware-screen';

/**
 * Fallback-path tests (default Jest env — `getKeyboardController()` always
 * returns null under jest-expo, see src/lib/keyboard.ts). These exercise the
 * plain `KeyboardAvoidingView` + `ScrollView` implementation that is today's
 * exact behavior; see keyboard-aware-screen.kc.test.tsx for the KC path.
 */
describe('FormScrollView (fallback)', () => {
  it('renders its children', async () => {
    const { getByText } = await render(
      <FormScrollView>
        <Text>hello</Text>
      </FormScrollView>,
    );
    expect(getByText('hello')).toBeTruthy();
  });

  it('applies keyboardShouldPersistTaps="handled"', async () => {
    const { getByTestId } = await render(
      <FormScrollView testID="form-scroll">
        <Text>content</Text>
      </FormScrollView>,
    );
    expect(getByTestId('form-scroll').props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('uses the shared default content style when no override is given', async () => {
    const { getByTestId } = await render(
      <FormScrollView testID="form-scroll">
        <Text>content</Text>
      </FormScrollView>,
    );
    expect(getByTestId('form-scroll').props.contentContainerStyle).toEqual({
      padding: Spacing.four,
      paddingBottom: Spacing.six,
      gap: Spacing.four,
    });
  });

  it('an explicit contentContainerStyle replaces the default', async () => {
    const override = { padding: 1 };
    const { getByTestId } = await render(
      <FormScrollView testID="form-scroll" contentContainerStyle={override}>
        <Text>content</Text>
      </FormScrollView>,
    );
    expect(getByTestId('form-scroll').props.contentContainerStyle).toBe(override);
  });
});

describe('KeyboardShiftView (fallback)', () => {
  it('renders its children', async () => {
    const { getByText } = await render(
      <KeyboardShiftView>
        <Text>shifted</Text>
      </KeyboardShiftView>,
    );
    expect(getByText('shifted')).toBeTruthy();
  });
});

describe('keyboard dismissal (GitHub #2, fallback path)', () => {
  it('FormScrollView drag-dismisses on iOS only (Android keeps its Back key)', async () => {
    const { getByTestId } = await render(
      <FormScrollView testID="form-scroll">
        <Text>content</Text>
      </FormScrollView>,
    );
    expect(getByTestId('form-scroll').props.keyboardDismissMode).toBe(
      Platform.OS === 'ios' ? 'interactive' : 'none',
    );
  });

  it('KeyboardShiftView: tapping empty space dismisses the keyboard', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const { getByTestId } = await render(
      <KeyboardShiftView>
        <Text>content</Text>
      </KeyboardShiftView>,
    );
    await fireEvent.press(getByTestId('dismiss-keyboard-area'));
    expect(dismiss).toHaveBeenCalledTimes(1);
    dismiss.mockRestore();
  });

  it("KeyboardShiftView: the caller's layout style lands on the inner area so gap still spaces its children", async () => {
    const { getByTestId } = await render(
      <KeyboardShiftView style={{ gap: 12, paddingTop: 8 }}>
        <Text>a</Text>
        <Text>b</Text>
      </KeyboardShiftView>,
    );
    expect(getByTestId('dismiss-keyboard-area')).toHaveStyle({ gap: 12, paddingTop: 8, flex: 1 });
  });

  it('KeyboardShiftView: the dismiss area is background, not an accessibility element', async () => {
    const { getByTestId } = await render(
      <KeyboardShiftView>
        <Text>content</Text>
      </KeyboardShiftView>,
    );
    expect(getByTestId('dismiss-keyboard-area').props.accessible).toBe(false);
  });
});
