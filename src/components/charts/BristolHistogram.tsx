// Zero-dependency mini histogram — seven thin vertical bars showing how BM
// entries are distributed across the Bristol scale (1-7). Plain Views, no
// SVG. Purely presentational: takes precomputed counts, does no analysis.

import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { BAD_BRISTOL_VALUES, BRISTOL_VALUES } from '@/features/bm/bristol';
import { useTheme } from '@/hooks/use-theme';

const BAR_HEIGHT = 32;
const MIN_BAR_HEIGHT = 3;

const BAD_VALUE_SET = new Set<number>(BAD_BRISTOL_VALUES);

export interface BristolHistogramProps {
  /** Counts for Bristol values [1, 2, 3, 4, 5, 6, 7], in order. */
  counts: readonly number[];
}

/** "Bad" (hard or loose) Bristol values lean toward `danger`, typical values toward `primary`. */
function barColor(value: number, theme: ReturnType<typeof useTheme>): string {
  return BAD_VALUE_SET.has(value) ? theme.danger : theme.primary;
}

/**
 * Seven thin bars, one per Bristol value, height proportional to that
 * value's share of the total. Renders nothing but a hairline baseline when
 * there is no data (total 0).
 */
export function BristolHistogram({ counts }: BristolHistogramProps) {
  const theme = useTheme();
  const total = counts.reduce((sum, c) => sum + c, 0);
  const max = Math.max(...counts, 1);
  const summary =
    total > 0
      ? `Bristol distribution: ${BRISTOL_VALUES.map((v, i) => `${counts[i]} at ${v}`).join(', ')}, out of ${total}.`
      : 'Bristol distribution: no BMs logged yet.';

  return (
    <View style={styles.container} accessibilityLabel={summary}>
      <View style={styles.row}>
        {BRISTOL_VALUES.map((value, i) => {
          const count = counts[i];
          const height = count > 0 ? Math.max(MIN_BAR_HEIGHT, (count / max) * BAR_HEIGHT) : MIN_BAR_HEIGHT;
          return (
            <View key={value} style={styles.barSlot}>
              <View
                style={[
                  styles.bar,
                  {
                    height,
                    backgroundColor: count > 0 ? barColor(value, theme) : theme.border,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.labels}>
        {BRISTOL_VALUES.map((value) => (
          <ThemedText key={value} type="small" themeColor="textSecondary" style={styles.label}>
            {value}
          </ThemedText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.half,
    height: BAR_HEIGHT,
  },
  barSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: 8,
    borderRadius: Spacing.half,
  },
  labels: {
    flexDirection: 'row',
    gap: Spacing.half,
  },
  label: {
    flex: 1,
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
  },
});
