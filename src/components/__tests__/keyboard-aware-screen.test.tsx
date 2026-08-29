import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

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
