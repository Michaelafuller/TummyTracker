// Zero-dependency weekly trend chart — bar height proportional to average
// sentiment (1-5 scale) for each rolling 7-day bucket. Plain Views, no SVG.

import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { SentimentValue } from '@/features/sentiment/scale';
import { SENTIMENT_VALUES } from '@/features/sentiment/scale';
import type { WeekBucket } from '@/lib/chartData';
import { useTheme } from '@/hooks/use-theme';

const CHART_HEIGHT = 64;
const MIN_SCALE = SENTIMENT_VALUES[0];
const MAX_SCALE = SENTIMENT_VALUES[SENTIMENT_VALUES.length - 1] as SentimentValue;

export interface TrendBarsProps {
  buckets: readonly WeekBucket[];
}

function barColor(avg: number, theme: ReturnType<typeof useTheme>): string {
  if (avg <= 2.5) return theme.danger;
  if (avg < 3.5) return theme.textSecondary;
  return theme.primary;
}

/**
 * One bar per weekly bucket; height proportional to that week's average
 * sentiment on the 1-5 scale. Weeks with no rated entries render as an empty
 * (unfilled) slot rather than a zero-height bar, since "no data" and "worst
 * possible rating" are different things.
 */
export function TrendBars({ buckets }: TrendBarsProps) {
  const theme = useTheme();
  const withData = buckets.filter((b) => b.avg != null);
  const summary =
    withData.length > 0
      ? `Weekly sentiment trend: ${withData.map((b) => `week of ${b.label}, average ${b.avg} from ${b.count} rated ${b.count === 1 ? 'entry' : 'entries'}`).join('; ')}.`
      : 'Weekly sentiment trend: not enough rated entries yet.';

  return (
    <View style={styles.container} accessibilityLabel={summary}>
      <View style={styles.chart}>
        {buckets.map((bucket) => {
          const heightRatio = bucket.avg != null ? (bucket.avg - MIN_SCALE) / (MAX_SCALE - MIN_SCALE) : 0;
          const height = bucket.avg != null ? Math.max(4, heightRatio * CHART_HEIGHT) : 0;
          return (
            <View key={bucket.label} style={styles.barSlot}>
              <View style={[styles.track, { borderColor: theme.border }]}>
                {bucket.avg != null ? (
                  <View style={[styles.bar, { height, backgroundColor: barColor(bucket.avg, theme) }]} />
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.labels}>
        {buckets.map((bucket) => (
          <ThemedText key={bucket.label} type="small" themeColor="textSecondary" style={styles.label}>
            {bucket.label}
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
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT,
    gap: Spacing.one,
  },
  barSlot: {
    flex: 1,
    height: CHART_HEIGHT,
    justifyContent: 'flex-end',
  },
  track: {
    flex: 1,
    justifyContent: 'flex-end',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bar: {
    borderTopLeftRadius: Spacing.half,
    borderTopRightRadius: Spacing.half,
  },
  labels: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  label: {
    flex: 1,
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
  },
});
