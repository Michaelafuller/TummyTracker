import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { drilldownSummary, findingInstances, type DrilldownKind } from '@/features/analysis/drilldown';
import {
  doseRows,
  doseSplit,
  formatServings,
  groupComponentsByEntry,
  mealAmount,
} from '@/features/analysis/doseResponse';
import { delayPhrase, latencyLine, latencySummary } from '@/features/analysis/latency';
import { outcomeRateForKey, PROFILE_WINDOWS_H } from '@/features/analysis/temporal';
import { useAllEntries, useAllMealComponents } from '@/features/logging/useEntries';
import { useTheme } from '@/hooks/use-theme';
import { formatLongDate, formatTime12h } from '@/lib/datetime';
import { parseTagsJson } from '@/lib/ingredients';
import type { LogEntry } from '@/db/schema';

const HOUR_MS = 60 * 60 * 1000;

function isDrilldownKind(value: unknown): value is DrilldownKind {
  return value === 'food' || value === 'tag';
}

/** Grouping keys for the timing profile — the same grouping the finding itself uses (insights.ts). */
function profileKeysOf(kind: DrilldownKind) {
  return (meal: LogEntry) => {
    if (kind === 'tag') return parseTagsJson(meal.tagsJson).map((tag) => ({ key: tag, label: tag }));
    const name = meal.name.trim();
    return name.length > 0 ? [{ key: name.toLowerCase(), label: name }] : [];
  };
}

export default function InsightDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; value?: string; window?: string }>();
  const entries = useAllEntries();
  const mealComponents = useAllMealComponents();
  const componentsByEntry = useMemo(() => groupComponentsByEntry(mealComponents), [mealComponents]);

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
  // `window=48` comes from a "Slower patterns" card; anything else is the 24 h default.
  const windowHours = params.window === '48' ? 48 : 24;
  const instances = findingInstances(entries, kind, value, windowHours * HOUR_MS);
  const summary = drilldownSummary(instances);
  const latency = latencySummary(
    instances.flatMap((instance) => (instance.outcomeDelayMs == null ? [] : [instance.outcomeDelayMs])),
  );

  // Dose-response (#22): the split is over exactly the meals listed below, with
  // their existing outcome flags. Numbers only — no verdict text.
  const amountOf = (entry: LogEntry) => mealAmount(entry, componentsByEntry.get(entry.id) ?? [], kind, value);
  const dose = doseSplit(instances, amountOf);
  const doseText = dose ? doseRows(dose) : null;

  // Timing profile (#21): context only — the same key at 6 / 24 / 48 / 72 h,
  // never gated and never a finding. Longer windows also catch more unrelated
  // rough days, hence the baseline beside every row.
  const keysOf = profileKeysOf(kind);
  const profileKey = kind === 'food' ? value.trim().toLowerCase() : value;
  const profile = PROFILE_WINDOWS_H.flatMap((hours) => {
    const rate = outcomeRateForKey(entries, keysOf, profileKey, hours * HOUR_MS);
    return rate ? [{ hours, rate }] : [];
  });

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: value }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summaryBlock}>
          <ThemedText type="small" themeColor="textSecondary">
            {`${summary.count} logs · ${summary.outcomes} followed by a rough outcome within ${windowHours} h`}
          </ThemedText>
          {latency ? (
            <ThemedText type="small" themeColor="textSecondary">
              {latencyLine(latency)}
            </ThemedText>
          ) : null}
        </View>

        {profile.length > 0 ? (
          <View style={styles.profile}>
            <ThemedText type="smallBold">How the pattern changes with time</ThemedText>
            {profile.map(({ hours, rate }) => (
              <ThemedText key={hours} type="small">
                {`Within ${hours} h: ${rate.hits} of ${rate.occurrences} ${rate.occurrences === 1 ? 'meal' : 'meals'} ` +
                  `(${Math.round(rate.hitRate * 100)}%) · baseline ${Math.round(rate.baseRate * 100)}%`}
              </ThemedText>
            ))}
            <ThemedText type="small" themeColor="textSecondary">
              Longer windows catch slower reactions but also more unrelated rough days.
            </ThemedText>
          </View>
        ) : null}

        {doseText ? (
          <View style={styles.profile}>
            <ThemedText type="smallBold">By amount</ThemedText>
            <ThemedText type="small">{doseText.larger}</ThemedText>
            <ThemedText type="small">{doseText.smaller}</ThemedText>
            {kind === 'tag' ? (
              <ThemedText type="small" themeColor="textSecondary">
                Amounts are servings of the foods that contain it.
              </ThemedText>
            ) : null}
          </View>
        ) : null}

        {instances.length === 0 ? (
          <View style={styles.centeredInline}>
            <ThemedText type="small" themeColor="textSecondary">
              No matching logs.
            </ThemedText>
          </View>
        ) : (
          <View style={styles.list}>
            {instances.map(({ entry, outcomeDelayMs }) => (
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
                  {dose ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatServings(amountOf(entry))}
                    </ThemedText>
                  ) : null}
                  {outcomeDelayMs != null ? (
                    <ThemedText type="small" themeColor="danger">
                      {`Rough outcome ${delayPhrase(outcomeDelayMs)}`}
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
  summaryBlock: {
    gap: Spacing.half,
  },
  profile: {
    gap: Spacing.one,
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
