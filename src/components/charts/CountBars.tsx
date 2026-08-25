// Zero-dependency weekly BM count chart — bar height proportional to that
// week's BM count, with the "bad" (hard/loose Bristol) portion stacked at the
// bottom of each bar. Plain Views, no SVG.

import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { BmWeekBucket } from '@/lib/bmTrends';
import { useTheme } from '@/hooks/use-theme';

const CHART_HEIGHT = 64;

export interface CountBarsProps {
  buckets: readonly BmWeekBucket[];
}

/**
 * One bar per weekly bucket; height proportional to that week's BM count
 * relative to the busiest week shown. Each bar stacks the "bad" (hard or
 * loose Bristol) count at the bottom, under the remainder. A week with zero
 * BMs renders an empty (unfilled) track — that's real data, not "no data".
 */
export function CountBars({ buckets }: CountBarsProps) {
  const theme = useTheme();
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const withData = buckets.filter((b) => b.count > 0);
  const summary =
    withData.length > 0
      ? `Weekly BM count: ${withData
          .map(
            (b) =>
              `week of ${b.label}, ${b.count} ${b.count === 1 ? 'BM' : 'BMs'}${b.badCount > 0 ? ` (${b.badCount} irregular)` : ''}`,
          )
          .join('; ')}.`
      : 'Weekly BM count: no BMs logged yet.';

  return (
    <View style={styles.container} accessibilityLabel={summary}>
      <View style={styles.chart}>
        {buckets.map((bucket) => {
          const height = bucket.count > 0 ? Math.max(4, (bucket.count / max) * CHART_HEIGHT) : 0;
          const badHeight = bucket.count > 0 ? (bucket.badCount / bucket.count) * height : 0;
          const typicalHeight = height - badHeight;
          return (
            <View key={bucket.label} style={styles.barSlot}>
              <View style={[styles.track, { borderColor: theme.border }]}>
                {bucket.count > 0 ? (
                  <View style={[styles.bar, { height }]}>
                    {typicalHeight > 0 ? (
                      <View style={[styles.segment, { height: typicalHeight, backgroundColor: theme.primary }]} />
                    ) : null}
                    {badHeight > 0 ? (
                      <View style={[styles.segment, { height: badHeight, backgroundColor: theme.danger }]} />
                    ) : null}
                  </View>
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
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  segment: {
    width: '100%',
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
