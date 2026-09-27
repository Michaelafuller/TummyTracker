import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SegmentedControl, type SegmentOption } from '@/components/segmented-control';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { EntryList } from '@/features/logging/EntryList';
import { useMedicationDoses, useMedicationEvents, useMedications } from '@/features/medications/useMedicationData';
import { medicationEventsToJournalItems, type JournalItem } from '@/lib/journal';

/**
 * Every logged medication entry, newest first, grouped by day (HANDOFF.md
 * #10) — reached from the Meds tab's "See all history" link. Filter chips are
 * "All" plus one per medication that has at least one dose (inactive
 * medications included, same #11 invariant as the Journal's medication
 * items) — a medication that was never actually logged doesn't clutter the
 * chip row.
 */
export default function MedicationHistoryScreen() {
  const insets = useSafeAreaInsets();
  const medications = useMedications();
  const events = useMedicationEvents();
  const doses = useMedicationDoses();
  const [filter, setFilter] = useState<string>('all');

  const items = useMemo(
    () => medicationEventsToJournalItems(events, doses, medications),
    [events, doses, medications],
  );

  const medsWithDoses = useMemo(() => {
    const idsWithDoses = new Set(doses.map((dose) => dose.medicationId));
    return medications.filter((med) => idsWithDoses.has(med.id));
  }, [medications, doses]);

  const filterOptions: SegmentOption<string>[] = useMemo(
    () => [{ value: 'all', label: 'All' }, ...medsWithDoses.map((med) => ({ value: med.id, label: med.name }))],
    [medsWithDoses],
  );

  const filteredItems: JournalItem[] = useMemo(() => {
    if (filter === 'all') return items;
    const eventIdsForMed = new Set(doses.filter((dose) => dose.medicationId === filter).map((dose) => dose.eventId));
    return items.filter((item) => item.kind === 'medication' && eventIdsForMed.has(item.id));
  }, [items, doses, filter]);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.six },
        ]}>
        <SegmentedControl options={filterOptions} value={filter} onChange={(value) => value && setFilter(value)} />

        <EntryList items={filteredItems} emptyLabel="No doses logged yet." />
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
});
