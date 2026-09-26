import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { canStepServings, formatServings, stepServings, type StepDirection } from '@/lib/servings';
import { ThemedText } from './themed-text';

export interface ServingsStepperProps {
  /** What the servings belong to — folded into every accessibility label. */
  itemName: string;
  value: number;
  onChange: (value: number) => void;
  /** Prefix for the three testIDs: `${testID}-dec`, `-value`, `-inc`. */
  testID?: string;
}

/**
 * Compact − / value / + control for adjusting an item's servings in half
 * steps (meal review screen). The math lives in `src/lib/servings.ts`.
 */
export function ServingsStepper({ itemName, value, onChange, testID }: ServingsStepperProps) {
  const theme = useTheme();

  function button(direction: StepDirection, glyph: string, label: string) {
    const enabled = canStepServings(value, direction);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} servings of ${itemName}`}
        accessibilityState={{ disabled: !enabled }}
        disabled={!enabled}
        // 32 + 2×8 slop = the 48dp Android minimum touch target.
        hitSlop={Spacing.two}
        testID={testID ? `${testID}-${direction === 'up' ? 'inc' : 'dec'}` : undefined}
        onPress={() => onChange(stepServings(value, direction))}
        style={[styles.button, { borderColor: theme.border, opacity: enabled ? 1 : 0.4 }]}>
        <ThemedText type="smallBold">{glyph}</ThemedText>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      {button('down', '−', 'Decrease')}
      <ThemedText
        type="small"
        accessibilityLabel={`${formatServings(value)} servings of ${itemName}`}
        testID={testID ? `${testID}-value` : undefined}
        style={styles.value}>
        {`${formatServings(value)}×`}
      </ThemedText>
      {button('up', '+', 'Increase')}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    minWidth: 36,
    textAlign: 'center',
  },
});
