import { render } from '@testing-library/react-native';
import { type ViewProps } from 'react-native';

import { Colors } from '@/constants/theme';
import { KEYBOARD_TOOLBAR_THEME, KeyboardDoneToolbar } from '../keyboard-done-toolbar';

let mockPathname = '/medication/entry/new';
jest.mock('expo-router', () => ({ usePathname: () => mockPathname }));

// KC path: the module resolves getKeyboardController() once at module scope,
// so the (hoisted) mock must be in place before the import above evaluates —
// same pattern as keyboard-aware-screen.kc.test.tsx.
jest.mock('@/lib/keyboard', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over top-level imports.
  const { View } = require('react-native');
  return {
    getKeyboardController: () => ({
      KeyboardToolbar: (props: ViewProps & { theme?: unknown }) => <View {...props} testID="kc-toolbar" />,
    }),
  };
});

describe('KeyboardDoneToolbar (KC path, GitHub #2)', () => {
  it('renders the keyboard-controller toolbar (prev / next / Done) with the app theme', async () => {
    const { getByTestId } = await render(<KeyboardDoneToolbar />);
    expect(getByTestId('kc-toolbar').props.theme).toBe(KEYBOARD_TOOLBAR_THEME);
  });

  it('is hidden on Home, where it covered the Recent search box', async () => {
    mockPathname = '/';
    const { queryByTestId } = await render(<KeyboardDoneToolbar />);
    expect(queryByTestId('kc-toolbar')).toBeNull();
    mockPathname = '/medication/entry/new';
  });

  it('themes the toolbar from the app palette in both schemes', () => {
    for (const scheme of ['light', 'dark'] as const) {
      expect(KEYBOARD_TOOLBAR_THEME[scheme]).toEqual({
        primary: Colors[scheme].link,
        disabled: Colors[scheme].textSecondary,
        background: Colors[scheme].backgroundElement,
        ripple: Colors[scheme].border,
      });
    }
  });
});
