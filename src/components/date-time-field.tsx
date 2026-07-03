import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
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
 * - Android's dialog fires `onChange` once (commit) — conditional render, closes on
 *   commit or on `event.type === 'dismissed'`.
 * - iOS's spinner fires `onChange` on every wheel pause. Committing on every change
 *   is fine, but closing on the first one isn't — it unmounts the picker mid-scroll.
 *   So on iOS the picker renders inline and only a "Done" chip closes it.
 */
export function DateTimeField({
  dateInput,
  timeInput,
  onDateChange,
  onTimeChange,
  error,
}: DateTimeFieldProps) {
  const theme = useTheme();
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);

  function commit(mode: 'date' | 'time', date: Date) {
    if (mode === 'date') {
      onDateChange(formatDateInput(date.getTime()));
    } else {
      onTimeChange(formatTimeInput(date.getTime()));
    }
  }

  function handleAndroidChange(event: DateTimePickerEvent, date: Date | undefined) {
    if (event.type === 'dismissed' || !date) {
      setPickerMode(null);
      return;
    }
    if (pickerMode) commit(pickerMode, date);
    setPickerMode(null);
  }

  function handleIosChange(_event: DateTimePickerEvent, date: Date | undefined) {
    if (!date || !pickerMode) return;
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
    <FormField label="When" error={error}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose date"
          onPress={() => setPickerMode('date')}
          style={[chipStyle, styles.flex]}>
          <ThemedText type="small">{dateInput || 'Date'}</ThemedText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose time"
          onPress={() => setPickerMode('time')}
          style={chipStyle}>
          <ThemedText type="small">{timeDisplay || 'Time'}</ThemedText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Set to now"
          onPress={handleNow}
          style={[chipStyle, styles.nowChip]}>
          <ThemedText type="smallBold">Now</ThemedText>
        </Pressable>
      </View>

      {pickerMode !== null && !isIos && (
        <DateTimePicker
          testID="date-time-picker"
          value={toDate(dateInput, timeInput)}
          mode={pickerMode}
          display="default"
          onChange={handleAndroidChange}
        />
      )}

      {pickerMode !== null && isIos && (
        <View style={styles.iosPicker}>
          <DateTimePicker
            testID="date-time-picker"
            value={toDate(dateInput, timeInput)}
            mode={pickerMode}
            display="spinner"
            onChange={handleIosChange}
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
