import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const BUTTON_SIZE = 44;

/**
 * How far from the screen's right edge the gear reaches (its right offset +
 * width + a small gap). A tab screen whose top content could run under the
 * gear pads that content's right side by this minus its own horizontal
 * padding — e.g. Insights' disclaimer, which has no title row above it.
 */
export const SETTINGS_BUTTON_CLEARANCE = Spacing.three + BUTTON_SIZE + Spacing.two;

/**
 * Gear button rendered once above every tab (HANDOFF.md §5 — Settings left
 * the tab bar for a top-right overlay). Reuses the existing settings tab
 * icon image, tinted `textSecondary` like any other secondary control.
 */
export function SettingsButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Settings"
      testID="open-settings"
      onPress={() => router.push('/settings')}
      style={[
        styles.button,
        {
          top: insets.top + Spacing.two,
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}>
      <Image
        source={require('@/assets/images/tabIcons/settings.png')}
        style={[styles.icon, { tintColor: theme.textSecondary }]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: Spacing.three,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  icon: {
    width: 24,
    height: 24,
  },
});
