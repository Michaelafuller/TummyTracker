import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { drilldownSummary, findingInstances, type DrilldownKind } from '@/features/analysis/drilldown';
import { useAllEntries } from '@/features/logging/useEntries';
import { useTheme } from '@/hooks/use-theme';
import { formatLongDate, formatTime12h } from '@/lib/datetime';

function isDrilldownKind(value: unknown): value is DrilldownKind {
  return value === 'food' || value === 'tag';
}

export default function InsightDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; value?: string }>();
  const entries = useAllEntries();

  const valid = isDrilldownKind(params.kind) && typeof params.value === 'string' && params.value.trim().length > 0;

  if (!valid) {
    return (
      <ThemedView style={styles.centered}>
        <Stack.Screen options={{ title: 'Finding' }} />
        <ThemedText type="smallBold">Nothing to show</ThemedText>
      </ThemedView>
    );
  }

  const kind = params.kind as DrilldownKind;
  const value = params.value as string;
  const instances = findingInstances(entries, kind, value);
  const summary = drilldownSummary(instances);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: value }} />
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          {`${summary.count} logs · ${summary.outcomes} followed by a rough outcome within 24 h`}
        </ThemedText>

        {instances.length === 0 ? (
          <View style={styles.centeredInline}>
            <ThemedText type="small" themeColor="textSecondary">
              No matching logs.
            </ThemedText>
          </View>
        ) : (
          <View style={styles.list}>
            {instances.map(({ entry, followedByOutcome }) => (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${entry.name}, ${formatLongDate(entry.loggedAt)}`}
                onPress={() => router.push(`/entry/${entry.id}`)}
                style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <View style={styles.rowBody}>
                  <ThemedText type="smallBold">
                    {`${formatLongDate(entry.loggedAt)} · ${formatTime12h(entry.loggedAt)}`}
                  </ThemedText>
                  <ThemedText type="small">{entry.name}</ThemedText>
                  {followedByOutcome ? (
                    <ThemedText type="small" themeColor="danger">
                      Rough outcome within 24 h
                    </ThemedText>
                  ) : null}
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  ›
                </ThemedText>
              </Pressable>
            ))}
          </View>
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
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  centeredInline: {
    alignItems: 'center',
    padding: Spacing.four,
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowBody: {
    flex: 1,
    gap: Spacing.half,
  },
});
