import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SYMPTOM_TYPES, type SymptomTypeValue } from './symptomTypes';

export interface SymptomTypePickerProps {
  value: SymptomTypeValue | null;
  onChange: (value: SymptomTypeValue) => void;
  onClear?: () => void;
}

/** Grid picker for the nine symptom types, mirroring BristolSelector's chip layout. */
export function SymptomTypePicker({ value, onChange, onClear }: SymptomTypePickerProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {SYMPTOM_TYPES.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[
                styles.chip,
                { backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement },
              ]}>
              <ThemedText type={selected ? 'smallBold' : 'small'}>{option.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>
      {onClear && value != null ? (
        <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel="Clear symptom type">
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    minHeight: 36,
    justifyContent: 'center',
  },
});
