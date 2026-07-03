// Zero-dependency mini histogram — five thin vertical bars showing how a
// finding's sentiment ratings (1-5) are distributed. Plain Views, no SVG.
// Purely presentational: takes precomputed counts, does no analysis itself.

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { SENTIMENT_VALUES } from '@/features/sentiment/scale';
import { useTheme } from '@/hooks/use-theme';

const BAR_HEIGHT = 32;
const MIN_BAR_HEIGHT = 3;

export interface MiniHistogramProps {
  /** Counts for sentiment values [1, 2, 3, 4, 5], in order. */
  counts: readonly [number, number, number, number, number];
}

/** Low sentiment values lean toward `danger`, high values toward `primary`. */
function barColor(index: number, theme: ReturnType<typeof useTheme>): string {
  // index 0 (sentiment 1) -> danger, index 4 (sentiment 5) -> primary; blend via
  // the two nearest theme tokens (no gradients available without a new dep, so
  // pick tone by which half of the scale the bucket falls in).
  return index <= 1 ? theme.danger : index === 2 ? theme.textSecondary : theme.primary;
}

/**
 * Five thin bars, one per sentiment value, height proportional to that
 * value's share of the total. Renders nothing but a hairline baseline when
 * there is no data (total 0).
 */
export function MiniHistogram({ counts }: MiniHistogramProps) {
  const theme = useTheme();
  const total = counts.reduce((sum, c) => sum + c, 0);
  const max = Math.max(...counts, 1);
  const summary =
    total > 0
      ? `Sentiment distribution: ${SENTIMENT_VALUES.map((v, i) => `${counts[i]} rated ${v}`).join(', ')}, out of ${total} total.`
      : 'Sentiment distribution: no rated entries yet.';

  return (
    <View style={styles.row} accessibilityLabel={summary}>
      {counts.map((count, i) => {
        const height = count > 0 ? Math.max(MIN_BAR_HEIGHT, (count / max) * BAR_HEIGHT) : MIN_BAR_HEIGHT;
        return (
          <View key={SENTIMENT_VALUES[i]} style={styles.barSlot}>
            <View
              style={[
                styles.bar,
                {
                  height,
                  backgroundColor: count > 0 ? barColor(i, theme) : theme.border,
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.half,
    height: BAR_HEIGHT,
  },
  barSlot: {
    width: 8,
    justifyContent: 'flex-end',
  },
  bar: {
    width: 8,
    borderRadius: Spacing.half,
  },
});
