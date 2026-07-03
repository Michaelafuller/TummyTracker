// Zero-dependency horizontal bar pair — compares a temporal finding's tag hit
// rate against the overall base rate. Plain Views, no SVG.

import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface BarMeterProps {
  /** Label for the top ("this tag") bar, e.g. "onion". */
  label: string;
  /** This tag's hit rate, 0-1. */
  rate: number;
  /** The overall base rate, 0-1, for comparison. */
  baseRate: number;
}

/** Horizontal bar pair: tag hit-rate vs. base rate, each labeled with a percentage. */
export function BarMeter({ label, rate, baseRate }: BarMeterProps) {
  const theme = useTheme();
  const ratePct = Math.round(rate * 100);
  const basePct = Math.round(baseRate * 100);
  const accessibilityLabel = `${label}: followed by a rough outcome ${ratePct}% of the time, versus ${basePct}% baseline.`;

  return (
    <View style={styles.container} accessibilityLabel={accessibilityLabel}>
      <View style={styles.row}>
        <View style={[styles.track, { backgroundColor: theme.border }]}>
          <View style={[styles.fill, { width: `${Math.min(100, ratePct)}%`, backgroundColor: theme.danger }]} />
        </View>
        <ThemedText type="small" style={styles.pct}>{`${ratePct}%`}</ThemedText>
      </View>
      <View style={styles.row}>
        <View style={[styles.track, { backgroundColor: theme.border }]}>
          <View
            style={[styles.fill, { width: `${Math.min(100, basePct)}%`, backgroundColor: theme.textSecondary }]}
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.pct}>{`${basePct}%`}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.half,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: Spacing.half,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Spacing.half,
  },
  pct: {
    width: 40,
    textAlign: 'right',
  },
});
