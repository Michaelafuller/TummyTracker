import DateTimePicker, { type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { FormField } from '@/components/form-fields';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatClock12h, formatDateInput, formatTimeInput, parseClockTime, parseDateTime } from '@/lib/datetime';

export interface DateTimeFieldProps {
  dateInput: string;
  timeInput: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  error?: string;
  /** FormField's own label. Defaults to "When" — every existing caller is unchanged. */
  label?: string;
  /**
   * 'date' hides the time chip and the Now shortcut, for a date-only field
   * (e.g. a medication's optional start/end date, HANDOFF.md §7). Defaults to
   * 'datetime', so every existing caller renders exactly as before.
   */
  mode?: 'datetime' | 'date';
  /** Shows a "Clear" link (when a date is set) that lets an optional date be emptied. */
  onClear?: () => void;
  /** Overrides the "Choose date" chip's accessibilityLabel — needed when two
   *  DateTimeFields render on one screen (e.g. Start date / End date) so each
   *  chip is uniquely findable. Defaults to "Choose date". */
  dateAccessibilityLabel?: string;
  /** Overrides the Clear link's accessibilityLabel. Defaults to "Clear date". */
  clearAccessibilityLabel?: string;
}

/** Resolves the current date/time state as a Date object for the picker initial value. */
function toDate(dateInput: string, timeInput: string): Date {
  const parsed = parseDateTime(dateInput, timeInput);
  return parsed.ms != null ? new Date(parsed.ms) : new Date();
}

/**
 * Native date/time picker field with a Now shortcut.
 * Shows two Pressable chips (date and time) that each open the OS-native picker.
 *
 * Platform behavior differs because the native picker itself behaves differently
 * (confirmed root cause, owner-verified on iOS):
 * - Android's dialog fires `onValueChange` once (commit) — conditional render, closes
 *   on commit or on `onDismiss` (the picker was dismissed without a value).
 * - iOS's spinner fires `onValueChange` on every wheel pause. Committing on every
 *   change is fine, but closing on the first one isn't — it unmounts the picker
 *   mid-scroll. So on iOS the picker renders inline and only a "Done" chip closes
 *   it; `onDismiss` is omitted there since the inline spinner has no native dismiss
 *   gesture of its own to react to.
 *
 * Uses `onValueChange`/`onDismiss` rather than the deprecated `onChange` (same
 * installed picker version, 9.1.0 — these are JS-level prop names on it already).
 */
export function DateTimeField({
  dateInput,
  timeInput,
  onDateChange,
  onTimeChange,
  error,
  label = 'When',
  mode = 'datetime',
  onClear,
  dateAccessibilityLabel = 'Choose date',
  clearAccessibilityLabel = 'Clear date',
}: DateTimeFieldProps) {
  const theme = useTheme();
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const isDateOnly = mode === 'date';

  function commit(mode: 'date' | 'time', date: Date) {
    if (mode === 'date') {
      onDateChange(formatDateInput(date.getTime()));
    } else {
      onTimeChange(formatTimeInput(date.getTime()));
    }
  }

  function handleAndroidValueChange(_event: DateTimePickerChangeEvent, date: Date) {
    if (pickerMode) commit(pickerMode, date);
    setPickerMode(null);
  }

  function handleAndroidDismiss() {
    setPickerMode(null);
  }

  function handleIosValueChange(_event: DateTimePickerChangeEvent, date: Date) {
    if (!pickerMode) return;
    commit(pickerMode, date);
  }

  function handleNow() {
    const now = Date.now();
    onDateChange(formatDateInput(now));
    onTimeChange(formatTimeInput(now));
  }

  const chipStyle = [styles.chip, { backgroundColor: theme.backgroundElement, borderColor: theme.border }];

  const parsedTime = parseClockTime(timeInput);
  const timeDisplay = parsedTime ? formatClock12h(parsedTime.hour, parsedTime.minute) : timeInput;

  const isIos = Platform.OS === 'ios';

  return (
    <FormField label={label} error={error}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={dateAccessibilityLabel}
          onPress={() => setPickerMode('date')}
          style={[chipStyle, styles.flex]}>
          <ThemedText type="small">{dateInput || 'Date'}</ThemedText>
        </Pressable>

        {!isDateOnly && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose time"
            onPress={() => setPickerMode('time')}
            style={chipStyle}>
            <ThemedText type="small">{timeDisplay || 'Time'}</ThemedText>
          </Pressable>
        )}

        {!isDateOnly && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Set to now"
            onPress={handleNow}
            style={[chipStyle, styles.nowChip]}>
            <ThemedText type="smallBold">Now</ThemedText>
          </Pressable>
        )}
      </View>

      {onClear && dateInput ? (
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel={clearAccessibilityLabel}>
          <ThemedText type="link" themeColor="textSecondary">
            Clear
          </ThemedText>
        </Pressable>
      ) : null}

      {pickerMode !== null && !isIos && (
        <DateTimePicker
          testID="date-time-picker"
          value={toDate(dateInput, timeInput)}
          mode={pickerMode}
          display="default"
          onValueChange={handleAndroidValueChange}
          onDismiss={handleAndroidDismiss}
        />
      )}

      {pickerMode !== null && isIos && (
        <View style={styles.iosPicker}>
          <DateTimePicker
            testID="date-time-picker"
            value={toDate(dateInput, timeInput)}
            mode={pickerMode}
            display="spinner"
            onValueChange={handleIosValueChange}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={pickerMode === 'date' ? 'Done choosing date' : 'Done choosing time'}
            onPress={() => setPickerMode(null)}
            style={[chipStyle, styles.doneChip]}>
            <ThemedText type="smallBold">Done</ThemedText>
          </Pressable>
        </View>
      )}
    </FormField>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    justifyContent: 'center',
  },
  nowChip: {
    paddingHorizontal: Spacing.two,
  },
  iosPicker: {
    gap: Spacing.two,
  },
  doneChip: {
    alignItems: 'center',
  },
});
