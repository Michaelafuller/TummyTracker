import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatClock12h } from '@/lib/datetime';

export interface TimeFieldProps {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
  /** Accessibility label for the chip, e.g. "breakfast reminder time". */
  accessibilityLabel: string;
}

/**
 * Single-chip native time picker, used for reminder times (hour/minute state,
 * no date component). Shares the iOS-vs-Android picker dismissal behavior with
 * DateTimeField (CLAUDE.md / HANDOFF 1.3): Android commits+closes on `onChange`;
 * iOS keeps the spinner mounted through every wheel-pause `onChange` and only
 * closes on the "Done" chip.
 */
export function TimeField({ hour, minute, onChange, accessibilityLabel }: TimeFieldProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const isIos = Platform.OS === 'ios';

  function toDate(): Date {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d;
  }

  function commit(date: Date) {
    onChange(date.getHours(), date.getMinutes());
  }

  function handleAndroidChange(event: DateTimePickerEvent, date: Date | undefined) {
    if (event.type === 'dismissed' || !date) {
      setOpen(false);
      return;
    }
    commit(date);
    setOpen(false);
  }

  function handleIosChange(_event: DateTimePickerEvent, date: Date | undefined) {
    if (!date) return;
    commit(date);
  }

  const chipStyle = [styles.chip, { backgroundColor: theme.backgroundElement, borderColor: theme.border }];

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={() => setOpen(true)}
        style={chipStyle}>
        <ThemedText type="small">{formatClock12h(hour, minute)}</ThemedText>
      </Pressable>

      {open && !isIos && (
        <DateTimePicker
          testID="time-field-picker"
          value={toDate()}
          mode="time"
          display="default"
          onChange={handleAndroidChange}
        />
      )}

      {open && isIos && (
        <View style={styles.iosPicker}>
          <DateTimePicker
            testID="time-field-picker"
            value={toDate()}
            mode="time"
            display="spinner"
            onChange={handleIosChange}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done choosing time"
            onPress={() => setOpen(false)}
            style={[chipStyle, styles.doneChip]}>
            <ThemedText type="smallBold">Done</ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    justifyContent: 'center',
  },
  iosPicker: {
    gap: Spacing.two,
  },
  doneChip: {
    alignItems: 'center',
  },
});
