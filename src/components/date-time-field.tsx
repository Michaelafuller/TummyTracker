import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FormField } from '@/components/form-fields';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateInput, formatTimeInput, parseDateTime } from '@/lib/datetime';

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

  function handlePickerChange(_event: DateTimePickerEvent, date: Date | undefined) {
    if (!date) {
      setPickerMode(null);
      return;
    }
    if (pickerMode === 'date') {
      onDateChange(formatDateInput(date.getTime()));
    } else if (pickerMode === 'time') {
      onTimeChange(formatTimeInput(date.getTime()));
    }
    setPickerMode(null);
  }

  function handleNow() {
    const now = Date.now();
    onDateChange(formatDateInput(now));
    onTimeChange(formatTimeInput(now));
  }

  const chipStyle = [styles.chip, { backgroundColor: theme.backgroundElement, borderColor: theme.border }];

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
          <ThemedText type="small">{timeInput || 'Time'}</ThemedText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Set to now"
          onPress={handleNow}
          style={[chipStyle, styles.nowChip]}>
          <ThemedText type="smallBold">Now</ThemedText>
        </Pressable>
      </View>

      {pickerMode !== null && (
        <DateTimePicker
          value={toDate(dateInput, timeInput)}
          mode={pickerMode}
          display="default"
          onChange={handlePickerChange}
        />
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
});
