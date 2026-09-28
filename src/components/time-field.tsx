import DateTimePicker, { type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
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
 * DateTimeField (CLAUDE.md / HANDOFF 1.3, updated HANDOFF #16 §4): Android
 * commits+closes on `onValueChange` and closes without committing on
 * `onDismiss`; iOS keeps the spinner mounted through every wheel-pause
 * `onValueChange` and only closes on the "Done" chip (no `onDismiss` there —
 * see DateTimeField for why).
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

  function handleAndroidValueChange(_event: DateTimePickerChangeEvent, date: Date) {
    commit(date);
    setOpen(false);
  }

  function handleAndroidDismiss() {
    setOpen(false);
  }

  function handleIosValueChange(_event: DateTimePickerChangeEvent, date: Date) {
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
          onValueChange={handleAndroidValueChange}
          onDismiss={handleAndroidDismiss}
        />
      )}

      {open && isIos && (
        <View style={styles.iosPicker}>
          <DateTimePicker
            testID="time-field-picker"
            value={toDate()}
            mode="time"
            display="spinner"
            onValueChange={handleIosValueChange}
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
