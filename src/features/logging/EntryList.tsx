import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { MedicationEventRow } from '@/features/medications/MedicationEventRow';
import { groupEntriesByDay, type JournalItem } from '@/lib/journal';
import { EntryRow } from './EntryRow';

function dayHeading(key: string): string {
  const date = new Date(`${key}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export interface EntryListProps {
  /** Merged log + medication rows (HANDOFF.md §5) — build with logEntriesToJournalItems
   *  and/or medicationEventsToJournalItems before filtering/passing them here. */
  items: JournalItem[];
  emptyLabel?: string;
}

/** Renders Journal items grouped by day with a heading per day: log items as
 *  the existing EntryRow (unchanged), medication items as MedicationEventRow. */
export function EntryList({ items, emptyLabel = 'No entries in this period.' }: EntryListProps) {
  const groups = groupEntriesByDay(items);

  if (groups.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
        {emptyLabel}
      </ThemedText>
    );
  }

  return (
    <View style={styles.list}>
      {groups.map((group) => (
        <View key={group.key} style={styles.group}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {dayHeading(group.key)}
          </ThemedText>
          {group.entries.map((item) =>
            item.kind === 'log' ? (
              <EntryRow key={item.id} entry={item.entry} />
            ) : (
              <MedicationEventRow key={item.id} item={item} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.four,
  },
  group: {
    gap: Spacing.two,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.four,
  },
});
