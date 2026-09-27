import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { listMedications } from '@/db/repository';
import type { Medication } from '@/db/schema';
import { useTheme } from '@/hooks/use-theme';
import { formatDoseSummary } from '@/lib/medications';

/**
 * Medications inventory (HANDOFF.md #5, #6 — Cycle A). Cycle B adds a recent-
 * doses list and the fixed "Create Entry" button on top of this.
 */
export default function MedicationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [medications, setMedications] = useState<Medication[]>([]);

  useFocusEffect(
    useCallback(() => {
      listMedications()
        .then(setMedications)
        .catch(() => setMedications([]));
    }, []),
  );

  const active = medications.filter((med) => med.isActive);
  const inactive = medications.filter((med) => !med.isActive);

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

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + BottomTabInset + Spacing.four },
        ]}>
        <ThemedText type="subtitle">Medications</ThemedText>

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

        <PrimaryButton
          label="Add medication"
          accessibilityLabel="Add medication"
          onPress={() => router.push('/medication/new')}
        />
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
});
