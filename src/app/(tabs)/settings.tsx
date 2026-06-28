import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormField, ThemedTextInput } from '@/components/form-fields';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { createLogEntry, getLogEntry, listLogEntries } from '@/db/repository';
import {
  DEFAULT_REMINDERS,
  REMINDER_SLOTS,
  type ReminderSlot,
  type RemindersState,
} from '@/features/notifications/model';
import { disableReminder, enableReminder, getReminders } from '@/features/notifications/service';
import { usePrefsStore } from '@/features/prefs/prefsStore';
import { formatClock, parseClockTime } from '@/lib/datetime';
import { entriesToJson, parseBackupJson } from '@/lib/backup';
import { useTheme } from '@/hooks/use-theme';

type TimeInputs = Record<ReminderSlot, string>;

function timeInputsFrom(state: RemindersState): TimeInputs {
  return {
    breakfast: formatClock(state.breakfast.hour, state.breakfast.minute),
    lunch: formatClock(state.lunch.hour, state.lunch.minute),
    dinner: formatClock(state.dinner.hour, state.dinner.minute),
  };
}

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const offlineMode = usePrefsStore((s) => s.offlineMode);
  const setOfflineMode = usePrefsStore((s) => s.setOfflineMode);
  const [reminders, setReminders] = useState<RemindersState>(DEFAULT_REMINDERS);
  const [timeInputs, setTimeInputs] = useState<TimeInputs>(() => timeInputsFrom(DEFAULT_REMINDERS));
  const [loading, setLoading] = useState(true);
  const [dataWorking, setDataWorking] = useState(false);

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

  async function handleExport() {
    setDataWorking(true);
    try {
      const entries = await listLogEntries();
      const json = entriesToJson(entries);
      const file = new File(Paths.cache, 'tummytracker-backup.json');
      file.write(json);
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Sharing not available', 'Cannot share files on this device.');
        return;
      }
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save backup' });
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setDataWorking(false);
    }
  }

  async function handleImport() {
    setDataWorking(true);
    try {
      const picked = await File.pickFileAsync({ mimeTypes: ['application/json'] });
      if (picked.canceled) return;
      const text = await picked.result.text();
      const parsed = parseBackupJson(text);
      if (!parsed.ok) {
        Alert.alert('Import failed', parsed.error);
        return;
      }
      let imported = 0;
      let skipped = 0;
      for (const entry of parsed.entries) {
        const existing = await getLogEntry(entry.id);
        if (existing) {
          skipped++;
        } else {
          const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = entry;
          await createLogEntry(rest);
          imported++;
        }
      }
      Alert.alert('Import complete', `Imported ${imported} ${imported === 1 ? 'entry' : 'entries'} (${skipped} already existed).`);
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    } finally {
      setDataWorking(false);
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
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + BottomTabInset + Spacing.four },
        ]}>
        <ThemedText type="subtitle">Settings</ThemedText>

        {/* Data section */}
        <ThemedText type="smallBold">Data</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Your journal lives only on this device. Export a backup before switching phones.
        </ThemedText>
        <View style={styles.dataRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Export data"
            disabled={dataWorking}
            onPress={handleExport}
            style={[styles.dataButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: dataWorking ? 0.5 : 1 }]}>
            <ThemedText type="smallBold">Export data</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Import data"
            disabled={dataWorking}
            onPress={handleImport}
            style={[styles.dataButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: dataWorking ? 0.5 : 1 }]}>
            <ThemedText type="smallBold">Import data</ThemedText>
          </Pressable>
        </View>

        <View style={styles.divider} />

        {/* Reminders section */}
        <ThemedText type="smallBold">Reminders</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Scheduled reminders to log meals and rate how they sat with you. Nothing leaves your
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

        <View style={styles.divider} />

        {/* App section */}
        <ThemedText type="smallBold">App</ThemedText>

        <View style={styles.row}>
          <View style={styles.rowHeader}>
            <View style={styles.rowLabel}>
              <ThemedText type="smallBold">Offline mode</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Disables Open Food Facts lookups. Barcode scans fall back to manual entry. No
                external calls are made.
              </ThemedText>
            </View>
            <Switch
              value={offlineMode}
              onValueChange={setOfflineMode}
              accessibilityLabel="Offline mode"
            />
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
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
    gap: Spacing.three,
  },
  rowLabel: {
    flex: 1,
    gap: Spacing.one,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'transparent',
  },
  dataRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  dataButton: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
});
