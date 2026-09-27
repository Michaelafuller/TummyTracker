import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { FormScrollView } from '@/components/keyboard-aware-screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { LogEntry } from '@/db/schema';
import { getLogEntry } from '@/db/repository';
import { computeInsights } from '@/features/analysis/insights';
import {
  hoursBeforeLabel,
  lookback,
  untimedBeforeLabel,
  LOOKBACK_HOURS,
  type LookbackHours,
  type LookbackItem,
} from '@/features/analysis/lookback';
import { isOutcome } from '@/features/analysis/temporal';
import { EntryRow } from '@/features/logging/EntryRow';
import { useAllEntries } from '@/features/logging/useEntries';
import { MedicationEventRow } from '@/features/medications/MedicationEventRow';
import { useMedicationDoses, useMedicationEvents, useMedications } from '@/features/medications/useMedicationData';
import { useTheme } from '@/hooks/use-theme';
import { formatLongDate } from '@/lib/datetime';
import { medicationEventsToJournalItems, type MedicationJournalItem } from '@/lib/journal';
import type { ConfidenceTier } from '@/lib/stats';

// undefined = still loading, null = not found.
type LoadState = LogEntry | null | undefined;

const HOUR_OPTIONS = LOOKBACK_HOURS.map((h) => ({ value: String(h), label: `${h} h` }));

const SUSPICION_LABEL: Record<ConfidenceTier, string> = {
  high: 'High suspicion',
  medium: 'Medium',
  low: 'Low',
};

/**
 * Duplicated from `(tabs)/insights.tsx`'s ConfidenceChip colour choices
 * (HANDOFF.md #15 §2: not worth refactoring Insights for a 3-way colour
 * switch) — high fills with the primary teal, medium with the
 * selected-state tint, low with a bare border tint.
 */
function SuspicionChip({ confidence }: { confidence: ConfidenceTier }) {
  const theme = useTheme();
  const backgroundColor =
    confidence === 'high' ? theme.primary : confidence === 'medium' ? theme.backgroundSelected : theme.border;
  const textColor = confidence === 'high' ? theme.primaryText : theme.text;
  return (
    <View style={[styles.chip, { backgroundColor }]}>
      <ThemedText type="small" style={[styles.chipText, { color: textColor }]}>
        {SUSPICION_LABEL[confidence]}
      </ThemedText>
    </View>
  );
}

function FoodGroup({ item }: { item: Extract<LookbackItem, { kind: 'food' }> }) {
  const timeLabel = hoursBeforeLabel(item.hoursBefore);
  const suspicionText =
    item.suspicion == null
      ? 'No pattern yet'
      : `${SUSPICION_LABEL[item.suspicion]}, linked to rough outcomes: ${item.matches.map((m) => m.label).join(', ')}`;

  // Not collapsed into one accessible node: that would hide the nested
  // EntryRow (the tap target that opens the meal) from screen readers and
  // Maestro. The composite summary lives on the suspicion line instead.
  return (
    <View style={styles.group}>
      <ThemedText type="small" themeColor="textSecondary">
        {timeLabel}
      </ThemedText>
      <EntryRow entry={item.entry} />
      {item.suspicion == null ? (
        <ThemedText
          type="small"
          themeColor="textSecondary"
          accessibilityLabel={`${item.entry.name}, ${timeLabel}, ${suspicionText}`}>
          No pattern yet
        </ThemedText>
      ) : (
        <View
          style={styles.suspicionRow}
          accessible
          accessibilityLabel={`${item.entry.name}, ${timeLabel}, ${suspicionText}`}>
          <SuspicionChip confidence={item.suspicion} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.matchedLabels}>
            {`Linked to rough outcomes: ${item.matches.map((m) => m.label).join(', ')}`}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

function MedicationGroup({
  item,
  outcomeAt,
}: {
  item: Extract<LookbackItem, { kind: 'medication' }>;
  outcomeAt: number;
}) {
  return (
    <View style={styles.group}>
      <ThemedText type="small" themeColor="textSecondary">
        {item.hoursBefore == null
          ? untimedBeforeLabel(outcomeAt, item.item.loggedAt)
          : hoursBeforeLabel(item.hoursBefore)}
      </ThemedText>
      <MedicationEventRow item={item.item} />
    </View>
  );
}

export default function OutcomeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<LoadState>(undefined);
  const [hours, setHours] = useState<LookbackHours>(24);

  const loadEntry = useCallback(async () => {
    const found = await getLogEntry(id);
    setEntry(found ?? null);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadEntry();
    }, [loadEntry]),
  );

  const entries = useAllEntries();
  const medications = useMedications();
  const medicationEvents = useMedicationEvents();
  const medicationDoses = useMedicationDoses();

  if (entry === undefined) {
    return (
      <ThemedView style={styles.centered}>
        <Stack.Screen options={{ title: 'What came before' }} />
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (entry === null || !isOutcome(entry)) {
    return (
      <ThemedView style={styles.centered}>
        <Stack.Screen options={{ title: 'What came before' }} />
        <ThemedText type="smallBold">Nothing to show</ThemedText>
      </ThemedView>
    );
  }

  const medicationItems: MedicationJournalItem[] = medicationEventsToJournalItems(
    medicationEvents,
    medicationDoses,
    medications,
  ).filter((item): item is MedicationJournalItem => item.kind === 'medication');
  const insights = computeInsights(entries);
  const items = lookback(entry, entries, medicationItems, insights, hours);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'What came before' }} />
      <FormScrollView contentContainerStyle={styles.content}>
        <View style={styles.outcomeSection}>
          <EntryRow entry={entry} />
          <ThemedText type="small" themeColor="textSecondary">
            {formatLongDate(entry.loggedAt)}
          </ThemedText>
        </View>

        <SegmentedControl
          options={HOUR_OPTIONS}
          value={String(hours)}
          onChange={(value) => value && setHours(Number(value) as LookbackHours)}
        />

        {items.length === 0 ? (
          <View style={styles.centeredInline}>
            <ThemedText type="small" themeColor="textSecondary">
              {`Nothing logged in the ${hours} h before this.`}
            </ThemedText>
            {hours < 72 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Try a longer window.
              </ThemedText>
            ) : null}
          </View>
        ) : (
          <View style={styles.list}>
            {items.map((item) =>
              item.kind === 'food' ? (
                <FoodGroup key={item.entry.id} item={item} />
              ) : (
                <MedicationGroup key={item.item.id} item={item} outcomeAt={entry.loggedAt} />
              ),
            )}
          </View>
        )}

        <ThemedText type="small" themeColor="textSecondary">
          Suspicion comes from your Insights patterns (a rough outcome within 24 h of eating).
          Medications aren&apos;t part of the pattern analysis yet. Observations, not medical
          advice.
        </ThemedText>
      </FormScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    gap: Spacing.one,
  },
  content: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  outcomeSection: {
    gap: Spacing.one,
  },
  list: {
    gap: Spacing.four,
  },
  group: {
    gap: Spacing.one,
  },
  suspicionRow: {
    gap: Spacing.one,
  },
  matchedLabels: {
    flexShrink: 1,
  },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: Spacing.four,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
  },
  chipText: {
    fontWeight: '700',
  },
});
