import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SENTIMENT_SCALE, type SentimentValue } from './scale';

export interface SentimentSelectorProps {
  value: SentimentValue | null;
  onChange: (value: SentimentValue) => void;
  /** When provided, a "Clear" affordance is shown so a rating can be removed. */
  onClear?: () => void;
}

/**
 * The 1–5 emoji sentiment scale. Standalone and reusable — used in the entry form
 * and (later) for rating an entry after the fact. The emoji/label come from the
 * single source of truth in scale.ts (CLAUDE.md §7).
 */
export function SentimentSelector({ value, onChange, onClear }: SentimentSelectorProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {SENTIMENT_SCALE.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityHint={`${option.value} of 5`}
              accessibilityState={{ selected }}
              style={[
                styles.option,
                { backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement },
              ]}>
              <ThemedText style={styles.emoji}>{option.emoji}</ThemedText>
            </Pressable>
          );
        })}
      </View>
      {onClear && value != null ? (
        <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel="Clear sentiment">
          <ThemedText type="link" themeColor="textSecondary">
            Clear rating
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
    gap: Spacing.two,
  },
  option: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 28,
    lineHeight: 34,
  },
});
