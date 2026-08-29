import { render } from '@testing-library/react-native';
import { Text, type ViewProps } from 'react-native';

import { Spacing } from '@/constants/theme';
import { FormScrollView, KeyboardShiftView } from '../keyboard-aware-screen';

// keyboard-aware-screen.tsx resolves its implementation from
// getKeyboardController() ONCE at module scope (see src/lib/keyboard.ts's
// header). `jest.mock` calls are hoisted (by babel-plugin-jest-hoist) above
// every import in this file, so the mock below is in place before
// `../keyboard-aware-screen` above is ever evaluated, regardless of source
// order — matching the house `jest.mock('@/lib/prefs', ...)` pattern used
// elsewhere in this repo. The factory can't close over the top-level `View`
// import (Jest's hoist guard forbids referencing out-of-scope variables from
// inside a `jest.mock` factory), so it requires react-native itself instead.
jest.mock('@/lib/keyboard', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over top-level imports.
  const { View } = require('react-native');
  return {
    getKeyboardController: () => ({
      // Marker testID applied AFTER the prop spread: FormScrollView/
      // KeyboardShiftView pass their own (possibly undefined) `testID`
      // through, which would otherwise clobber the fixed one below.
      KeyboardAwareScrollView: (props: ViewProps & { bottomOffset?: number }) => (
        <View {...props} testID="kc-aware-scroll-view" />
      ),
      KeyboardAvoidingView: (props: ViewProps & { behavior?: string }) => (
        <View {...props} testID="kc-avoiding-view" />
      ),
    }),
  };
});

describe('FormScrollView (KC path)', () => {
  it('renders KC KeyboardAwareScrollView with the default bottomOffset and children', async () => {
    const { getByTestId, getByText } = await render(
      <FormScrollView>
        <Text>hello</Text>
      </FormScrollView>,
    );
    const scrollView = getByTestId('kc-aware-scroll-view');
    expect(scrollView.props.bottomOffset).toBe(Spacing.six);
    expect(scrollView.props.contentContainerStyle).toEqual({
      padding: Spacing.four,
      paddingBottom: Spacing.six,
      gap: Spacing.four,
    });
    expect(scrollView.props.keyboardShouldPersistTaps).toBe('handled');
    expect(getByText('hello')).toBeTruthy();
  });

  it('an explicit bottomOffset overrides the default', async () => {
    const { getByTestId } = await render(
      <FormScrollView bottomOffset={12}>
        <Text>hello</Text>
      </FormScrollView>,
    );
    expect(getByTestId('kc-aware-scroll-view').props.bottomOffset).toBe(12);
  });

  it('an explicit contentContainerStyle overrides the default', async () => {
    const override = { padding: 1 };
    const { getByTestId } = await render(
      <FormScrollView contentContainerStyle={override}>
        <Text>hello</Text>
      </FormScrollView>,
    );
    expect(getByTestId('kc-aware-scroll-view').props.contentContainerStyle).toBe(override);
  });
});

describe('KeyboardShiftView (KC path)', () => {
  it('renders KC KeyboardAvoidingView with behavior="padding" and children', async () => {
    const { getByTestId, getByText } = await render(
      <KeyboardShiftView>
        <Text>shifted</Text>
      </KeyboardShiftView>,
    );
    expect(getByTestId('kc-avoiding-view').props.behavior).toBe('padding');
    expect(getByText('shifted')).toBeTruthy();
  });
});
