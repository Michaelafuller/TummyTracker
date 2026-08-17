import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

export interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Falls back to `label` when omitted (some callers keep a stable label,
   * e.g. "Save meal", while the visible text switches to "Saving…"). */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shared full-width primary CTA (HANDOFF.md Cycle C, design contract §4):
 * the app's near-identical submit buttons (LogEntryForm, ComponentForm,
 * BmForm, SymptomForm, review.tsx) were five copies of the same
 * `backgroundColor: theme.text` / `color: theme.background` inverted-fill
 * Pressable. Unified here on `primary`/`primaryText` — already the styles of
 * the home CTA and insights badges — so the app has one CTA style, not two.
 */
export function PrimaryButton({ label, onPress, disabled = false, accessibilityLabel, style }: PrimaryButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { backgroundColor: theme.primary, opacity: disabled ? 0.5 : 1 }, style]}>
      <ThemedText style={[styles.label, { color: theme.primaryText }]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: 600,
  },
});
