import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, View } from 'react-native';

import { FormField, ThemedTextInput } from '@/components/form-fields';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  DEFAULT_REMINDERS,
  REMINDER_SLOTS,
  type ReminderSlot,
  type RemindersState,
} from '@/features/notifications/model';
import { disableReminder, enableReminder, getReminders } from '@/features/notifications/service';
import { formatClock, parseClockTime } from '@/lib/datetime';

type TimeInputs = Record<ReminderSlot, string>;

function timeInputsFrom(state: RemindersState): TimeInputs {
  return {
    breakfast: formatClock(state.breakfast.hour, state.breakfast.minute),
    lunch: formatClock(state.lunch.hour, state.lunch.minute),
    dinner: formatClock(state.dinner.hour, state.dinner.minute),
  };
}

export default function SettingsScreen() {
  const [reminders, setReminders] = useState<RemindersState>(DEFAULT_REMINDERS);
  const [timeInputs, setTimeInputs] = useState<TimeInputs>(() => timeInputsFrom(DEFAULT_REMINDERS));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getReminders().then((state) => {
      if (!active) return;
      setReminders(state);
      setTimeInputs(timeInputsFrom(state));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function toggle(slot: ReminderSlot, value: boolean) {
    if (value) {
      const time = parseClockTime(timeInputs[slot]) ?? {
        hour: reminders[slot].hour,
        minute: reminders[slot].minute,
      };
      const ok = await enableReminder(slot, time.hour, time.minute);
      if (!ok) {
        Alert.alert(
          'Notifications are off',
          'Enable notifications for TummyTracker in your system settings to get reminders.',
        );
        return;
      }
      setReminders((prev) => ({ ...prev, [slot]: { enabled: true, ...time } }));
    } else {
      await disableReminder(slot);
      setReminders((prev) => ({ ...prev, [slot]: { ...prev[slot], enabled: false } }));
    }
  }

  async function commitTime(slot: ReminderSlot) {
    const time = parseClockTime(timeInputs[slot]);
    if (!time) {
      // Revert to the last good value.
      setTimeInputs((prev) => ({
        ...prev,
        [slot]: formatClock(reminders[slot].hour, reminders[slot].minute),
      }));
      return;
    }
    setReminders((prev) => ({ ...prev, [slot]: { ...prev[slot], ...time } }));
    if (reminders[slot].enabled) {
      await enableReminder(slot, time.hour, time.minute);
    }
  }

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        Daily local reminders to log a meal and rate how it sat with you. Nothing leaves your
        device.
      </ThemedText>

      {REMINDER_SLOTS.map((slot) => (
        <View key={slot} style={styles.row}>
          <View style={styles.rowHeader}>
            <ThemedText type="smallBold">{slot[0].toUpperCase() + slot.slice(1)}</ThemedText>
            <Switch
              value={reminders[slot].enabled}
              onValueChange={(value) => toggle(slot, value)}
              accessibilityLabel={`${slot} reminder`}
            />
          </View>
          <FormField label="Time">
            <ThemedTextInput
              value={timeInputs[slot]}
              onChangeText={(value) => setTimeInputs((prev) => ({ ...prev, [slot]: value }))}
              onBlur={() => commitTime(slot)}
              onSubmitEditing={() => commitTime(slot)}
              placeholder="HH:MM"
              accessibilityLabel={`${slot} reminder time`}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
            />
          </FormField>
        </View>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.four,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    gap: Spacing.two,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
