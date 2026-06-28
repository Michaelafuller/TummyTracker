import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAllEntries } from '@/features/logging/useEntries';
import { EntryList } from '@/features/logging/EntryList';
import { useTheme } from '@/hooks/use-theme';
import { formatDateInput } from '@/lib/datetime';
import {
  type CalendarMode,
  entryDateKeys,
  type EntryTypeFilter,
  filterByEntryType,
  filterEntriesInRange,
  formatPeriodLabel,
  getPeriodRange,
} from '@/lib/journal';

const MODE_OPTIONS = [
  { value: 'day' as const, label: 'Day' },
  { value: 'week' as const, label: 'Week' },
  { value: 'month' as const, label: 'Month' },
];

const FILTER_OPTIONS = [
  { value: 'all' as const, label: 'All' },
  { value: 'food' as const, label: 'Food' },
  { value: 'bm' as const, label: 'BM' },
];

export default function BrowseScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const entries = useAllEntries();

  const [mode, setMode] = useState<CalendarMode>('day');
  const [filter, setFilter] = useState<EntryTypeFilter>('all');
  const [selectedDate, setSelectedDate] = useState(() => formatDateInput(Date.now()));

  const anchorMs = useMemo(() => new Date(`${selectedDate}T00:00:00`).getTime(), [selectedDate]);

  const typeFiltered = useMemo(() => filterByEntryType(entries, filter), [entries, filter]);

  const visibleEntries = useMemo(
    () => filterEntriesInRange(typeFiltered, getPeriodRange(anchorMs, mode)),
    [typeFiltered, anchorMs, mode],
  );

  const markedDates = useMemo(() => {
    const marks: Record<string, { marked?: boolean; selected?: boolean; selectedColor?: string }> =
      {};
    for (const key of entryDateKeys(typeFiltered)) {
      marks[key] = { marked: true };
    }
    marks[selectedDate] = { ...marks[selectedDate], selected: true, selectedColor: theme.text };
    return marks;
  }, [typeFiltered, selectedDate, theme.text]);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.six },
        ]}>
        <ThemedText type="subtitle">Journal</ThemedText>

        <SegmentedControl
          options={MODE_OPTIONS}
          value={mode}
          onChange={(value) => value && setMode(value)}
        />

        <SegmentedControl
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(value) => value && setFilter(value)}
        />

        <Calendar
          key={theme.background /* re-theme on scheme change */}
          current={selectedDate}
          onDayPress={(day) => setSelectedDate(day.dateString)}
          markedDates={markedDates}
          enableSwipeMonths
          theme={{
            calendarBackground: theme.background,
            dayTextColor: theme.text,
            monthTextColor: theme.text,
            textSectionTitleColor: theme.textSecondary,
            todayTextColor: theme.text,
            selectedDayBackgroundColor: theme.text,
            selectedDayTextColor: theme.background,
            dotColor: theme.text,
            arrowColor: theme.text,
          }}
        />

        <View style={styles.listWrapper}>
          <View style={styles.periodHeader}>
            <ThemedText type="smallBold">{formatPeriodLabel(anchorMs, mode)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {visibleEntries.length} {visibleEntries.length === 1 ? 'entry' : 'entries'}
            </ThemedText>
          </View>
          <EntryList entries={visibleEntries} />
        </View>
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
  listWrapper: {
    marginTop: Spacing.two,
    gap: Spacing.three,
  },
  periodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
});
