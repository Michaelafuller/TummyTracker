// Past-experiments list (GitHub #19, Cycle B) — every experiment, newest
// first, reached from the Insights watchlist's "Past experiments" link. A
// completed row shows its FROZEN verdict (verdictJson); nothing here
// re-evaluates a finished experiment.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { experimentStatusLine, formatDayRange } from '@/features/experiments/copy';
import { experimentSchedule } from '@/features/experiments/engine';
import { useExperiments } from '@/features/experiments/useExperiments';
import { useTheme } from '@/hooks/use-theme';
import { formatDateInput } from '@/lib/datetime';

export default function ExperimentHistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const experiments = useExperiments();
  // Lazy-init so today's key is read once per mount, not on every render.
  const [todayKey] = useState(() => formatDateInput(Date.now()));

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.six },
        ]}>
        {experiments.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            No experiments yet.
          </ThemedText>
        ) : (
          experiments.map((exp) => {
            const range = formatDayRange(exp.startDate, experimentSchedule(exp).lastDay);
            const status = experimentStatusLine(exp, todayKey);
            return (
              <Pressable
                key={exp.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${exp.term} experiment, ${range}, ${status}`}
                onPress={() => router.push(`/experiment/${exp.id}`)}
                style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <ThemedText type="smallBold">{exp.term}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {range}
                </ThemedText>
                <ThemedText type="small">{status}</ThemedText>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  row: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
