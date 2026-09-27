import { usePathname } from 'expo-router';

import { Colors } from '@/constants/theme';
import { getKeyboardController } from '@/lib/keyboard';

// Resolved once at module scope, like app-providers.tsx's KeyboardProvider —
// see src/lib/keyboard.ts for why the native-module probe must be synchronous.
const kc = getKeyboardController();

/** Toolbar colours from the app palette (both schemes; the toolbar picks by OS scheme). */
export const KEYBOARD_TOOLBAR_THEME = {
  light: {
    primary: Colors.light.link,
    disabled: Colors.light.textSecondary,
    background: Colors.light.backgroundElement,
    ripple: Colors.light.border,
  },
  dark: {
    primary: Colors.dark.link,
    disabled: Colors.dark.textSecondary,
    background: Colors.dark.backgroundElement,
    ripple: Colors.dark.border,
  },
};

/**
 * App-wide bar above the keyboard with previous / next field arrows and a
 * **Done** button that hides the keyboard (GitHub #2). Needed most on iOS:
 * there is no Back key, and the numeric keypads the app uses for dose,
 * calories and servings (`decimal-pad`) have no return key at all, so without
 * this a keyboard could only be dismissed by tapping outside the field.
 *
 * Mounted once inside KeyboardProvider (app-providers.tsx); it only shows
 * while a text input is focused. Renders nothing when the running client
 * predates react-native-keyboard-controller's native module.
 *
 * Not on Home: Home doesn't scroll, and its Recent search box sits just above
 * the keyboard, so the 42dp bar covered the very field being typed into
 * (seen on the Pixel 5). The search is a single-line input whose own return
 * key already closes the keyboard, and Home dismisses on tap-outside
 * (KeyboardShiftView), so the bar adds nothing there.
 */
export function KeyboardDoneToolbar() {
  const pathname = usePathname();
  if (!kc || TOOLBAR_HIDDEN_ON.has(pathname)) return null;
  return <kc.KeyboardToolbar theme={KEYBOARD_TOOLBAR_THEME} />;
}

/** Routes without the toolbar — see KeyboardDoneToolbar. `/` is the Home tab. */
export const TOOLBAR_HIDDEN_ON: ReadonlySet<string> = new Set(['/']);
