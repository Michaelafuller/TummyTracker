import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedTextInput } from '@/components/form-fields';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { LogEntry } from '@/db/schema';
import { useTheme } from '@/hooks/use-theme';
import { filterRecents } from '@/lib/recents';

function slug(name: string): string {
  return (name || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function secondaryLine(entry: LogEntry): string {
  const parts: string[] = [];
  if (entry.mealSlot) parts.push(entry.mealSlot);
  if (entry.calories != null) parts.push(`${entry.calories} kcal`);
  return parts.join(' · ');
}

export interface RecentFoodPickerProps {
  entries: LogEntry[];
  onSelect: (entry: LogEntry) => void;
  limit?: number;
}

/**
 * Searchable quick-add list for the Home screen's "Recent" section (HANDOFF
 * 1.4) — replaces the old horizontal chip ScrollView. A ThemedTextInput above
 * a plain conditional list of up to `limit` suggestion rows; no dropdown/
 * overlay library, this renders inline inside the caller's ScrollView.
 */
export function RecentFoodPicker({ entries, onSelect, limit = 6 }: RecentFoodPickerProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const results = useMemo(() => filterRecents(entries, query, limit), [entries, query, limit]);

  return (
    <View style={styles.container}>
      <ThemedTextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search past foods…"
        accessibilityLabel="Search past foods"
        autoCapitalize="none"
      />
      <View style={styles.list}>
        {results.map((entry) => {
          const secondary = secondaryLine(entry);
          return (
            <Pressable
              key={entry.id}
              testID={`recent-${slug(entry.name)}`}
              accessibilityRole="button"
              accessibilityLabel={`Re-log ${entry.name}`}
              onPress={() => onSelect(entry)}
              style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <ThemedText type="small" numberOfLines={1}>
                {entry.name}
              </ThemedText>
              {secondary ? (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {secondary}
                </ThemedText>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
});
