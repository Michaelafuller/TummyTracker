import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { LogEntry } from '@/db/schema';
import { groupEntriesByDay } from '@/lib/journal';
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
  entries: LogEntry[];
  emptyLabel?: string;
}

/** Renders entries grouped by day with a heading per day. */
export function EntryList({ entries, emptyLabel = 'No entries in this period.' }: EntryListProps) {
  const groups = groupEntriesByDay(entries);

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
          {group.entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
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
