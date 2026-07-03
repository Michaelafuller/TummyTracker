/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Contrast ratios below are computed via the WCAG relative-luminance formula
// (sRGB -> linear -> 0.2126R + 0.7152G + 0.0722B, then (L1+0.05)/(L2+0.05)),
// not estimated. Dark mode is the reference palette ("really nice") — light
// mode is a "white cards on a tinted canvas" scheme so cards read as distinct
// surfaces instead of nearly matching the page background (HANDOFF 1.6).
export const Colors = {
  light: {
    text: '#1A1016',                // 18.6:1 on backgroundElement — AAA ✓
    background: '#F2F7F7',          // soft teal-tinted off-white canvas
    backgroundElement: '#FFFFFF',   // white cards — separated from canvas by border, not just fill color
    backgroundSelected: '#C5E3E3',  // stronger teal tint for selected state
    textSecondary: '#53696B',       // 5.8:1 on backgroundElement — AA ✓
    border: '#D3E4E4',              // hairline between backgroundElement and background
    primary: '#5BC0BE',             // CTA button background
    primaryText: '#0D2426',         // 7.0:1 on primary — AAA (large) / AA (small) ✓
    danger: '#B3261E',              // 6.5:1 on backgroundElement — AA ✓
    link: '#0F6E6C',                // 6.1:1 on backgroundElement — AA ✓
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
    danger: '#FF8A80',              // 7.6:1 on background — AAA ✓
    link: '#7FD4D2',                // 10.2:1 on background — AAA ✓
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
