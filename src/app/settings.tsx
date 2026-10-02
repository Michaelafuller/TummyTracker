import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-fields';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TimeField } from '@/components/time-field';
import { BottomTabInset, Spacing } from '@/constants/theme';
import {
  createLogEntry,
  getLogEntry,
  insertDayCheckInsPreservingIds,
  insertDayFactorsPreservingIds,
  insertSavedMealsPreservingIds,
  insertExperimentsPreservingIds,
  insertMealComponents,
  insertMedicationDosesPreservingIds,
  insertMedicationEventsPreservingIds,
  insertMedicationRemindersPreservingIds,
  insertMedicationsPreservingIds,
  listAllExperiments,
  listAllMedicationDoses,
  listAllMedicationEvents,
  listAllMedications,
  listLogEntries,
} from '@/db/repository';
import {
  backUpToFolderNow,
  chooseBackupFolder,
  exportBackupViaShare,
  turnOffAutoBackup,
} from '@/features/backup/backupService';
import { disableDayCheckIn, refreshDayCheckIn } from '@/features/checkin/dayCheckInService';
import { requestExperimentNotificationRefresh } from '@/features/experiments/experimentNotifications';
import {
  DEFAULT_REMINDERS,
  REMINDER_SLOTS,
  type ReminderSlot,
  type RemindersState,
} from '@/features/notifications/model';
import { disableReminder, enableReminder, ensureNotificationPermission, getReminders } from '@/features/notifications/service';
import { usePrefsStore } from '@/features/prefs/prefsStore';
import { useTheme } from '@/hooks/use-theme';
import { lastBackupLabel } from '@/lib/autoBackup';
import { dosesForRestoredEvents, parseBackupJson } from '@/lib/backup';
import { buildReportHtml, REPORT_RANGES, type ReportRangeDays } from '@/lib/report';

const REPORT_RANGE_LABELS: Record<ReportRangeDays, string> = {
  14: '2 weeks',
  30: '30 days',
  90: '90 days',
};

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const offlineMode = usePrefsStore((s) => s.offlineMode);
  const setOfflineMode = usePrefsStore((s) => s.setOfflineMode);
  const dayCheckInEnabled = usePrefsStore((s) => s.dayCheckInEnabled);
  const dayCheckInHour = usePrefsStore((s) => s.dayCheckInHour);
  const dayCheckInMinute = usePrefsStore((s) => s.dayCheckInMinute);
  const setDayCheckIn = usePrefsStore((s) => s.setDayCheckIn);
  const trackPeriod = usePrefsStore((s) => s.trackPeriod);
  const setTrackPeriod = usePrefsStore((s) => s.setTrackPeriod);
  const lastBackupAt = usePrefsStore((s) => s.lastBackupAt);
  const autoBackupDirUri = usePrefsStore((s) => s.autoBackupDirUri);
  const autoBackupDirName = usePrefsStore((s) => s.autoBackupDirName);
  const autoBackupError = usePrefsStore((s) => s.autoBackupError);
  const [reminders, setReminders] = useState<RemindersState>(DEFAULT_REMINDERS);
  const [loading, setLoading] = useState(true);
  const [dataWorking, setDataWorking] = useState(false);
  const [backupWorking, setBackupWorking] = useState(false);
  const [reportRange, setReportRange] = useState<ReportRangeDays>(30);
  const [reportWorking, setReportWorking] = useState(false);
  // Read once on mount, not Date.now() in render — the "last backup" line
  // only needs to be roughly current (GitHub #14).
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    getReminders().then((state) => {
      if (!active) return;
      setReminders(state);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function toggle(slot: ReminderSlot, value: boolean) {
    if (value) {
      const time = { hour: reminders[slot].hour, minute: reminders[slot].minute };
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

  async function commitTime(slot: ReminderSlot, hour: number, minute: number) {
    setReminders((prev) => ({ ...prev, [slot]: { ...prev[slot], hour, minute } }));
    if (reminders[slot].enabled) {
      await enableReminder(slot, hour, minute);
    }
  }

  async function toggleDayCheckIn(value: boolean) {
    if (value) {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        Alert.alert(
          'Notifications are off',
          'Enable notifications for TummyTracker in your system settings to get the day check-in.',
        );
        return;
      }
      setDayCheckIn(true, dayCheckInHour, dayCheckInMinute);
      await refreshDayCheckIn(dayCheckInHour, dayCheckInMinute);
    } else {
      setDayCheckIn(false, dayCheckInHour, dayCheckInMinute);
      await disableDayCheckIn();
    }
  }

  async function commitDayCheckInTime(hour: number, minute: number) {
    setDayCheckIn(dayCheckInEnabled, hour, minute);
    if (dayCheckInEnabled) {
      await refreshDayCheckIn(hour, minute);
    }
  }

  async function handleExport() {
    setDataWorking(true);
    try {
      const shared = await exportBackupViaShare();
      if (!shared) {
        Alert.alert('Sharing not available', 'Cannot share files on this device.');
      }
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setDataWorking(false);
    }
  }

  async function handleChooseBackupFolder() {
    setBackupWorking(true);
    try {
      const result = await chooseBackupFolder();
      if (result === 'chosen') {
        const name = usePrefsStore.getState().autoBackupDirName;
        Alert.alert(`Backup saved to ${name}.`);
      }
      // 'cancelled': no-op. 'failed': the folder is kept and autoBackupError
      // now holds the friendly message, shown below (HANDOFF.md §4).
    } finally {
      setBackupWorking(false);
    }
  }

  async function handleBackUpNow() {
    setBackupWorking(true);
    try {
      const result = await backUpToFolderNow();
      if (result.ok) {
        const name = usePrefsStore.getState().autoBackupDirName;
        Alert.alert(`Backup saved to ${name}.`);
      }
    } finally {
      setBackupWorking(false);
    }
  }

  async function handleTurnOffAutoBackup() {
    setBackupWorking(true);
    try {
      await turnOffAutoBackup();
    } finally {
      setBackupWorking(false);
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
          const created = await createLogEntry(rest);
          // createLogEntry always mints a fresh id, so re-key this entry's component
          // rows to it — otherwise a repeated import would collide on component id.
          const components = parsed.mealComponents
            .filter((c) => c.entryId === entry.id)
            .map((c) => ({ ...c, id: `${created.id}:${c.id}`, entryId: created.id }));
          await insertMealComponents(components);
          imported++;
        }
      }

      // Medications preserve their ids on import (unlike log entries above) —
      // #11's dose records reference a stable medicationId (HANDOFF.md Cycle A).
      const medResult = await insertMedicationsPreservingIds(parsed.medications);
      const eventResult = await insertMedicationEventsPreservingIds(parsed.medicationEvents);
      // Only doses of events restored just now — an existing event keeps its own
      // (possibly edited) doses; see dosesForRestoredEvents.
      await insertMedicationDosesPreservingIds(
        dosesForRestoredEvents(parsed.medicationDoses, eventResult.insertedIds),
      );

      // Medication reminder schedule (GitHub #29): ids preserved, an id that
      // already exists on the device is skipped.
      await insertMedicationRemindersPreservingIds(parsed.medicationReminders);

      const medSummary =
        parsed.medications.length > 0
          ? ` Imported ${medResult.inserted} ${medResult.inserted === 1 ? 'medication' : 'medications'} (${medResult.skipped} already existed).`
          : '';

      // Day check-ins: the device's own answer for a day wins over a
      // backup's (insertDayCheckInsPreservingIds skips on date OR id match).
      const dayCheckInResult = await insertDayCheckInsPreservingIds(parsed.dayCheckIns);
      const dayCheckInSummary =
        parsed.dayCheckIns.length > 0
          ? ` Imported ${dayCheckInResult.inserted} ${dayCheckInResult.inserted === 1 ? 'day check-in' : 'day check-ins'} (${dayCheckInResult.skipped} already existed).`
          : '';

      // Daily factors (GitHub #23): the device's own row for a day wins,
      // whole (insertDayFactorsPreservingIds skips on date OR id match).
      const dayFactorResult = await insertDayFactorsPreservingIds(parsed.dayFactors);
      const dayFactorSummary =
        parsed.dayFactors.length > 0
          ? ` Imported ${dayFactorResult.inserted} ${dayFactorResult.inserted === 1 ? 'day of factors' : 'days of factors'} (${dayFactorResult.skipped} already existed).`
          : '';

      // Saved meals (GitHub #25): ids preserved; a meal whose id OR name
      // already exists on the device is skipped (the device wins, with its own
      // items), and only restored meals bring their items.
      const savedMealResult = await insertSavedMealsPreservingIds(parsed.savedMeals, parsed.savedMealComponents);
      const savedMealSummary =
        parsed.savedMeals.length > 0
          ? ` Imported ${savedMealResult.inserted} ${savedMealResult.inserted === 1 ? 'saved meal' : 'saved meals'} (${savedMealResult.skipped} already existed).`
          : '';

      // Experiments (GitHub #19): ids preserved like medications; a restored
      // 'active' row is demoted to 'abandoned' rather than dropped when the
      // device already has (or this file already restored) an active one.
      const experimentResult = await insertExperimentsPreservingIds(parsed.experiments);
      // A restored active experiment needs its phase reminders armed (or a
      // demoted one's cancelled) — fire-and-forget, own slot only.
      requestExperimentNotificationRefresh();
      const experimentSummary =
        parsed.experiments.length > 0
          ? ` Imported ${experimentResult.inserted} ${experimentResult.inserted === 1 ? 'experiment' : 'experiments'} (${experimentResult.skipped} already existed).`
          : '';

      Alert.alert(
        'Import complete',
        `Imported ${imported} ${imported === 1 ? 'entry' : 'entries'} (${skipped} already existed).${medSummary}${dayCheckInSummary}${dayFactorSummary}${savedMealSummary}${experimentSummary}`,
      );
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    } finally {
      setDataWorking(false);
    }
  }

  async function handleCreateReport() {
    setReportWorking(true);
    try {
      const [entries, meds, events, doses, experiments] = await Promise.all([
        listLogEntries(),
        listAllMedications(),
        listAllMedicationEvents(),
        listAllMedicationDoses(),
        listAllExperiments(),
      ]);
      const html = buildReportHtml(entries, Date.now(), reportRange, { meds, events, doses }, experiments);
      // Dynamic import only — the installed dev client on the owner's Pixel
      // predates expo-print; a static import would crash Metro (CLAUDE.md §0
      // in docs/HANDOFF.md). Any failure here (module missing, print/share
      // failure) falls through to the catch below.
      const Print = await import('expo-print');
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share report' });
    } catch {
      Alert.alert(
        'Update required',
        'Creating a PDF needs the app build that includes printing — install the next dev build, then try again.',
      );
    } finally {
      setReportWorking(false);
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
          // The Stack header (src/app/_layout.tsx) now supplies the "Settings"
          // title and its own safe-area top inset — this screen only needs a
          // small fixed gap under the header, not insets.top (HANDOFF.md §5).
          { paddingTop: Spacing.three, paddingBottom: insets.bottom + BottomTabInset + Spacing.four },
        ]}>
        {/* Data section */}
        <ThemedText type="smallBold">Data</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Your journal lives only on this device. Export a backup before switching phones.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" accessibilityLabel={lastBackupLabel(lastBackupAt, now)}>
          {lastBackupLabel(lastBackupAt, now)}
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

        {Platform.OS === 'android' && (
          <View style={styles.row}>
            <ThemedText type="smallBold">Automatic backup</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Once a day, when you open the app, a backup is saved to a folder you choose. The
              newest 7 are kept. Pick a folder outside the app (like Documents or a cloud drive
              folder) so it survives reinstalling.
            </ThemedText>
            {autoBackupDirUri == null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose backup folder"
                disabled={backupWorking}
                onPress={handleChooseBackupFolder}
                style={[
                  styles.dataButton,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: backupWorking ? 0.5 : 1 },
                ]}>
                <ThemedText type="smallBold">Choose backup folder</ThemedText>
              </Pressable>
            ) : (
              <View style={styles.row}>
                <ThemedText type="small" themeColor="textSecondary">
                  Saving to: {autoBackupDirName}
                </ThemedText>
                <View style={styles.backupActionsRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Back up to folder now"
                    disabled={backupWorking}
                    onPress={handleBackUpNow}
                    style={[
                      styles.backupActionButton,
                      { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: backupWorking ? 0.5 : 1 },
                    ]}>
                    <ThemedText type="smallBold">Back up now</ThemedText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Change folder"
                    disabled={backupWorking}
                    onPress={handleChooseBackupFolder}
                    style={[
                      styles.backupActionButton,
                      { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: backupWorking ? 0.5 : 1 },
                    ]}>
                    <ThemedText type="smallBold">Change folder</ThemedText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Turn off automatic backup"
                    disabled={backupWorking}
                    onPress={handleTurnOffAutoBackup}
                    style={[
                      styles.backupActionButton,
                      { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: backupWorking ? 0.5 : 1 },
                    ]}>
                    <ThemedText type="smallBold">Turn off</ThemedText>
                  </Pressable>
                </View>
              </View>
            )}
            {autoBackupError != null && (
              <ThemedText type="small" themeColor="danger">
                {autoBackupError}
              </ThemedText>
            )}
          </View>
        )}

        <View style={styles.divider} />

        {/* Doctor report section */}
        <ThemedText type="smallBold">Doctor report</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          A printable summary of your logs and patterns to share with a professional.
        </ThemedText>
        <View style={styles.chipRow}>
          {REPORT_RANGES.map((days) => {
            const selected = days === reportRange;
            return (
              <Pressable
                key={days}
                accessibilityRole="button"
                accessibilityLabel={REPORT_RANGE_LABELS[days]}
                accessibilityState={{ selected }}
                onPress={() => setReportRange(days)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.accent : theme.backgroundElement,
                    borderColor: selected ? theme.accent : theme.border,
                  },
                ]}>
                <ThemedText
                  type={selected ? 'smallBold' : 'small'}
                  themeColor={selected ? undefined : 'textSecondary'}
                  style={selected ? { color: theme.accentText } : undefined}>
                  {REPORT_RANGE_LABELS[days]}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create PDF report"
          disabled={reportWorking}
          onPress={handleCreateReport}
          style={[styles.dataButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: reportWorking ? 0.5 : 1 }]}>
          <ThemedText type="smallBold">Create PDF report</ThemedText>
        </Pressable>

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
              <TimeField
                hour={reminders[slot].hour}
                minute={reminders[slot].minute}
                onChange={(hour, minute) => commitTime(slot, hour, minute)}
                accessibilityLabel={`${slot} reminder time`}
              />
            </FormField>
          </View>
        ))}

        <View style={styles.divider} />

        {/* Day check-in section (GitHub #13) */}
        <ThemedText type="smallBold">Day check-in</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          An evening notification asking whether today was a fine day or a rough day — answering
          takes one tap.
        </ThemedText>
        <View style={styles.row}>
          <View style={styles.rowHeader}>
            <ThemedText type="smallBold">Day check-in</ThemedText>
            <Switch
              value={dayCheckInEnabled}
              onValueChange={toggleDayCheckIn}
              accessibilityLabel="Day check-in"
            />
          </View>
          <FormField label="Time">
            <TimeField
              hour={dayCheckInHour}
              minute={dayCheckInMinute}
              onChange={commitDayCheckInTime}
              accessibilityLabel="Day check-in time"
            />
          </FormField>
        </View>
        <View style={styles.row}>
          <View style={styles.rowHeader}>
            <View style={styles.rowLabel}>
              <ThemedText type="smallBold">Track period</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Adds a period option to the day details. Off by default; your data never leaves this
                device.
              </ThemedText>
            </View>
            <Switch value={trackPeriod} onValueChange={setTrackPeriod} accessibilityLabel="Track period" testID="track-period-switch" />
          </View>
        </View>

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
  backupActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  backupActionButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  dataButton: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
