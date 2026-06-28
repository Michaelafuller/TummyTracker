/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1A1016',            // 17.1:1 on background — AAA ✓
    background: '#FFFFFF',
    backgroundElement: '#EDF6F6',   // light teal wash — fills, not text bg
    backgroundSelected: '#C5E3E3',  // stronger teal tint for selected state
    textSecondary: '#69585F',       // 6.1:1 on background — AA ✓
    border: '#BCDCDC',              // subtle teal border
    primary: '#5BC0BE',             // CTA button background
    primaryText: '#0D2426',         // 7.0:1 on primary — AAA (large) / AA (small) ✓
  },
  dark: {
    text: '#F0ECEE',            // 13.4:1 on background — AAA ✓
    background: '#0D1C20',          // very dark teal
    backgroundElement: '#162B30',   // cards, inputs
    backgroundSelected: '#1E3D44',  // visible selected state
    textSecondary: '#B7ADCF',       // 7.7:1 on background — AAA ✓
    border: '#2A4A51',              // dark teal border
    primary: '#5BC0BE',             // same teal — 7.6:1 on dark bg ✓
    primaryText: '#0D2426',         // 7.0:1 on primary — same in both modes ✓
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
