// Zero-dependency weekly intake chart — bar height proportional to that
// week's average daily value for a given nutrition field. Plain Views, no SVG.

import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { IntakeWeekBucket } from '@/lib/chartData';
import { useTheme } from '@/hooks/use-theme';

const CHART_HEIGHT = 64;

export interface IntakeBarsProps {
  buckets: readonly IntakeWeekBucket[];
  noun: string;
  unit: string;
}

/**
 * One bar per weekly bucket; height proportional to that week's average
 * daily intake relative to the busiest week shown. A week with a real zero
 * average renders the minimum-height bar (zero intake is data); a week with
 * no logged value for this field renders an empty (unfilled) track.
 */
export function IntakeBars({ buckets, noun, unit }: IntakeBarsProps) {
  const theme = useTheme();
  const max = Math.max(...buckets.map((b) => b.avg ?? 0), 1);
  const withData = buckets.filter((b) => b.avg != null);
  const summary =
    withData.length > 0
      ? `Weekly ${noun} intake: ${withData.map((b) => `week of ${b.label}, about ${b.avg} ${unit} per day`).join('; ')}.`
      : `Weekly ${noun} intake: not enough nutrition data yet.`;

  return (
    // `accessible` is required for the label to become a real a11y node on
    // Android — without it the summary is invisible to TalkBack (and Maestro).
    <View style={styles.container} accessible accessibilityLabel={summary}>
      <View style={styles.chart}>
        {buckets.map((bucket) => {
          const height = bucket.avg != null ? Math.max(4, (bucket.avg / max) * CHART_HEIGHT) : 0;
          return (
            <View key={bucket.label} style={styles.barSlot}>
              <View style={[styles.track, { borderColor: theme.border }]}>
                {bucket.avg != null ? (
                  <View style={[styles.bar, { height, backgroundColor: theme.primary }]} />
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
