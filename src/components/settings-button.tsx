import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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
    width: 44,
    height: 44,
    borderRadius: 22,
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
