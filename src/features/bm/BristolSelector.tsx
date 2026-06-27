import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { BRISTOL_SCALE, type BristolValue, bristolLabel } from './bristol';

export interface BristolSelectorProps {
  value: BristolValue | null;
  onChange: (value: BristolValue) => void;
  onClear?: () => void;
}

/** 1–7 Bristol Stool Scale picker with the selected type's description shown below. */
export function BristolSelector({ value, onChange, onClear }: BristolSelectorProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {BRISTOL_SCALE.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={`Type ${option.value}: ${option.label}`}
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
          {bristolLabel(value)}
        </ThemedText>
      ) : null}
      {onClear && value != null ? (
        <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel="Clear Bristol type">
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
