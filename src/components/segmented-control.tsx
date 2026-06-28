import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  /** When true, tapping the selected segment again clears it (value becomes null). */
  allowClear?: boolean;
}

/** A simple wrapping chip group used for the entry type and meal-slot pickers. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  allowClear = false,
}: SegmentedControlProps<T>) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(allowClear && selected ? null : option.value)}
            style={[
              styles.chip,
              {
                // Selected chips invert (filled with the text colour) so the active
                // option is unmistakable in both light and dark themes.
                backgroundColor: selected ? theme.text : theme.backgroundElement,
                borderColor: selected ? theme.text : theme.border,
              },
            ]}>
            <ThemedText
              type={selected ? 'smallBold' : 'small'}
              themeColor={selected ? undefined : 'textSecondary'}
              style={selected ? { color: theme.background } : undefined}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
