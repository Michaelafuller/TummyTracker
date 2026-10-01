import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { BottomTabInset, Spacing } from '@/constants/theme';
import type { Medication } from '@/db/schema';
import { RegularMedsButton } from '@/features/medications/RegularMedsButton';
import { useMedicationDoses, useMedicationEvents, useMedications } from '@/features/medications/useMedicationData';
import { useTheme } from '@/hooks/use-theme';
import { formatTime12h } from '@/lib/datetime';
import { medicationEventsToJournalItems, type JournalItem } from '@/lib/journal';
import { formatDoseSummary } from '@/lib/medications';

const RECENT_DOSES_LIMIT = 5;

/**
 * Medications inventory (HANDOFF.md #5, #6 — Cycle A) plus Cycle B's fixed
 * "Create entry" CTA and a "Recent doses" list. All three live queries
 * (medications/events/doses) keep this screen current after a save/delete
 * anywhere in the app — no manual refetch.
 */
export default function MedicationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const medications = useMedications();
  const events = useMedicationEvents();
  const doses = useMedicationDoses();

  const active = medications.filter((med) => med.isActive);
  const inactive = medications.filter((med) => !med.isActive);

  // useMedicationEvents() is already newest-first, so the first 5 are the
  // most recent doses (#6) — nothing here infers a dose from a schedule
  // (invariant, HANDOFF.md §0), it only ever summarizes rows already logged.
  const recentDoses = useMemo(
    () => medicationEventsToJournalItems(events, doses, medications).slice(0, RECENT_DOSES_LIMIT),
    [events, doses, medications],
  );

  function renderRow(med: Medication) {
    const summary = formatDoseSummary(med);
    return (
      <Pressable
        key={med.id}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${med.name}`}
        testID={`med-row-${med.id}`}
        onPress={() => router.push({ pathname: '/medication/[id]', params: { id: med.id } })}
        style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View style={styles.rowLabel}>
          <ThemedText type="small" numberOfLines={1}>
            {med.name}
          </ThemedText>
          {summary ? (
            <ThemedText type="small" themeColor="textSecondary">
              {summary}
            </ThemedText>
          ) : null}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          ›
        </ThemedText>
      </Pressable>
    );
  }

  function renderRecentDose(item: JournalItem) {
    if (item.kind !== 'medication') return null;
    const timeLabel = item.timeKnown ? formatTime12h(item.loggedAt) : 'time not set';
    return (
      <Pressable
        key={item.id}
        accessibilityRole="button"
        accessibilityLabel={`Medication, ${item.summary}${item.notes ? ', has notes' : ''}`}
        testID={`recent-dose-${item.id}`}
        onPress={() => router.push({ pathname: '/medication/entry/[id]', params: { id: item.id } })}
        style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View style={styles.rowLabel}>
          <ThemedText type="small" themeColor="textSecondary">
            {timeLabel}
          </ThemedText>
          <ThemedText type="small" numberOfLines={1}>
            {item.summary}
          </ThemedText>
        </View>
        {item.notes ? <ThemedText style={styles.notesGlyph}>📝</ThemedText> : null}
        <ThemedText type="small" themeColor="textSecondary">
          ›
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.three,
            // Extra room so the fixed "Create entry" button below never
            // covers the last row (#6).
            paddingBottom: insets.bottom + BottomTabInset + Spacing.six + FIXED_BUTTON_SPACE,
          },
        ]}>
        <ThemedText type="subtitle">Medications</ThemedText>

        <RegularMedsButton />

        {medications.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            No medications yet.
          </ThemedText>
        ) : (
          <>
            {active.length > 0 ? (
              <View style={styles.section}>{active.map(renderRow)}</View>
            ) : (
              // Only inactive ones left — say so, rather than leaving a blank
              // gap above the "Inactive (n)" section.
              <ThemedText type="small" themeColor="textSecondary">
                No active medications.
              </ThemedText>
            )}

            {inactive.length > 0 ? (
              <Collapsible title={`Inactive (${inactive.length})`}>
                <View style={styles.section}>{inactive.map(renderRow)}</View>
              </Collapsible>
            ) : null}
          </>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add medication"
          onPress={() => router.push('/medication/new')}
          style={[styles.secondaryButton, { borderColor: theme.border }]}>
          <ThemedText type="smallBold">Add medication</ThemedText>
        </Pressable>

        <View style={styles.section}>
          <View style={styles.recentHeader}>
            <ThemedText type="smallBold">Recent doses</ThemedText>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="See all history"
              onPress={() => router.push('/medication/history')}>
              <ThemedText type="link">See all history</ThemedText>
            </Pressable>
          </View>

          {recentDoses.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No doses logged yet.
            </ThemedText>
          ) : (
            <View style={styles.section}>{recentDoses.map(renderRecentDose)}</View>
          )}
        </View>
      </ScrollView>

      <View
        style={[
          styles.fixedButtonWrapper,
          { paddingBottom: insets.bottom + BottomTabInset + Spacing.three, backgroundColor: theme.background },
        ]}>
        <PrimaryButton
          label="Create entry"
          accessibilityLabel="Create entry"
          disabled={active.length === 0}
          onPress={() => router.push('/medication/entry/new')}
        />
        {active.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            Add a medication to log doses
          </ThemedText>
        ) : null}
      </View>
    </ThemedView>
  );
}

const FIXED_BUTTON_SPACE = 96;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  section: {
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
  rowLabel: {
    flex: 1,
    gap: Spacing.half,
  },
  notesGlyph: {
    fontSize: 18,
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  fixedButtonWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.one,
  },
  hint: {
    textAlign: 'center',
  },
});
