import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, PixelRatio, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Calendar, CalendarProvider, WeekCalendar } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { EntryList } from '@/features/logging/EntryList';
import { useAllEntries } from '@/features/logging/useEntries';
import { useMedicationDoses, useMedicationEvents, useMedications } from '@/features/medications/useMedicationData';
import { useTheme } from '@/hooks/use-theme';
import { formatDateInput } from '@/lib/datetime';
import {
  buildCalendarTheme,
  type CalendarMode,
  entryDateKeys,
  type EntryTypeFilter,
  filterEntriesInRange,
  filterJournalItems,
  formatPeriodLabel,
  getPeriodRange,
  logEntriesToJournalItems,
  medicationEventsToJournalItems,
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
  { value: 'symptom' as const, label: 'Symptom' },
  { value: 'meds' as const, label: 'Meds' },
];

export default function BrowseScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const entries = useAllEntries();
  const medications = useMedications();
  const medicationEvents = useMedicationEvents();
  const medicationDoses = useMedicationDoses();

  const [mode, setMode] = useState<CalendarMode>('day');
  const [filter, setFilter] = useState<EntryTypeFilter>('all');
  const [selectedDate, setSelectedDate] = useState(() => formatDateInput(Date.now()));
  const [calendarExpanded, setCalendarExpanded] = useState(false);

  const anchorMs = useMemo(() => new Date(`${selectedDate}T00:00:00`).getTime(), [selectedDate]);

  // Merge log entries (food/BM/symptom, unchanged) with medication events
  // (HANDOFF.md §5) before filtering/ranging/grouping — every downstream
  // helper (filterEntriesInRange, groupEntriesByDay, entryDateKeys) already
  // works on `{ loggedAt }`, so the merged list reuses them without a fork.
  const journalItems = useMemo(
    () => [
      ...logEntriesToJournalItems(entries),
      ...medicationEventsToJournalItems(medicationEvents, medicationDoses, medications),
    ],
    [entries, medicationEvents, medicationDoses, medications],
  );

  const typeFiltered = useMemo(() => filterJournalItems(journalItems, filter), [journalItems, filter]);

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
    marks[selectedDate] = { ...marks[selectedDate], selected: true, selectedColor: theme.accent };
    return marks;
  }, [typeFiltered, selectedDate, theme.accent]);

  const calendarTheme = useMemo(() => buildCalendarTheme(theme), [theme]);

  // WeekCalendar pages by `calendarWidth`, defaulting to the full SCREEN width —
  // but it sits inside this screen's horizontal padding, so each week page was
  // wider than its frame: day numbers drifted right of their weekday headers
  // (Saturday clipped off) and swipes snapped off-grid. Measure the real frame
  // and hand that over instead; null until the first layout pass.
  const [weekFrameWidth, setWeekFrameWidth] = useState<number | null>(null);
  function handleWeekFrameLayout(event: LayoutChangeEvent) {
    // Pixel-exact, NOT whole-dp: the list snaps to multiples of its own
    // viewport width, so a page even 0.3dp wider (344.73 → 345 on the Pixel 5)
    // leaves every swipe resting between pages.
    const width = PixelRatio.roundToNearestPixel(event.nativeEvent.layout.width);
    setWeekFrameWidth((prev) => (prev === width ? prev : width));
  }

  // Key changes on theme, expanded/collapsed toggle, or frame width so the
  // calendars remount with the correct selectedDate and page geometry.
  const calendarKey = `${theme.background}-${calendarExpanded ? 'month' : `week-${weekFrameWidth}`}`;

  const monthLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

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

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={calendarExpanded ? 'Collapse calendar' : 'Expand calendar'}
          onPress={() => setCalendarExpanded((e) => !e)}
          style={styles.calendarToggle}>
          <ThemedText type="smallBold">{monthLabel}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {calendarExpanded ? '▲' : '▼'}
          </ThemedText>
        </Pressable>

        {calendarExpanded ? (
          <Calendar
            key={`cal-${calendarKey}`}
            current={selectedDate}
            onDayPress={(day) => setSelectedDate(day.dateString)}
            markedDates={markedDates}
            enableSwipeMonths
            theme={calendarTheme}
          />
        ) : (
          <View testID="week-calendar-frame" onLayout={handleWeekFrameLayout}>
            {/* Mount only once measured: the initial scroll offset is computed
                from calendarWidth, so a first render at screen width would
                start the strip misaligned. */}
            {weekFrameWidth != null ? (
              <CalendarProvider
                key={`week-provider-${calendarKey}`}
                date={selectedDate}
                onDateChanged={(d) => setSelectedDate(d)}>
                <WeekCalendar
                  testID="week-calendar"
                  calendarWidth={weekFrameWidth}
                  current={selectedDate}
                  onDayPress={(day) => setSelectedDate(day.dateString)}
                  markedDates={markedDates}
                  hideDayNames={false}
                  theme={calendarTheme}
                />
              </CalendarProvider>
            ) : null}
          </View>
        )}

        <View style={styles.listWrapper}>
          <View style={styles.periodHeader}>
            <ThemedText type="smallBold">{formatPeriodLabel(anchorMs, mode)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {visibleEntries.length} {visibleEntries.length === 1 ? 'entry' : 'entries'}
            </ThemedText>
          </View>
          <EntryList items={visibleEntries} />
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
  calendarToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
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
