import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SEVERITY_SCALE, type SeverityValue, severityLabel } from './severity';

export interface SeveritySelectorProps {
  value: SeverityValue | null;
  onChange: (value: SeverityValue) => void;
  onClear?: () => void;
}

/** 1–5 severity picker (1 = mild, 5 = very severe) with the label shown below. */
export function SeveritySelector({ value, onChange, onClear }: SeveritySelectorProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {SEVERITY_SCALE.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={`Severity ${option.value}: ${option.label}`}
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[
                styles.cell,
                { backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement },
              ]}>
              <ThemedText type={selected ? 'smallBold' : 'small'}>{option.value}</ThemedText>
            </Pressable>
          );
        })}
      </View>
      {value != null ? (
        <ThemedText type="small" themeColor="textSecondary">
          {severityLabel(value)}
        </ThemedText>
      ) : null}
      {onClear && value != null ? (
        <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel="Clear severity">
          <ThemedText type="link" themeColor="textSecondary">
            Clear
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
