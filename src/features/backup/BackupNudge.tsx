// Home's "back up now" nudge (GitHub #14). Renders nothing until the prefs
// store has loaded AND the last backup is stale (or there's never been one) —
// see docs/HANDOFF.md §4 — so it never flashes on launch.

import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { usePrefsStore } from '@/features/prefs/prefsStore';
import { useTheme } from '@/hooks/use-theme';
import { lastBackupLabel, shouldNudgeBackup } from '@/lib/autoBackup';
import { backUpToFolderNow, exportBackupViaShare } from './backupService';

type BackupNudgeProps = {
  hasData: boolean;
  now: number;
};

export function BackupNudge({ hasData, now }: BackupNudgeProps) {
  const theme = useTheme();
  const loaded = usePrefsStore((s) => s.loaded);
  const lastBackupAt = usePrefsStore((s) => s.lastBackupAt);
  const autoBackupDirUri = usePrefsStore((s) => s.autoBackupDirUri);
  const [working, setWorking] = useState(false);

  if (!loaded || !shouldNudgeBackup(lastBackupAt, now, hasData)) {
    return null;
  }

  async function handleBackUpNow() {
    setWorking(true);
    try {
      if (Platform.OS === 'android' && autoBackupDirUri) {
        const result = await backUpToFolderNow();
        if (!result.ok) {
          Alert.alert("Backup didn't complete", result.error);
        }
      } else {
        const shared = await exportBackupViaShare();
        if (!shared) {
          Alert.alert('Sharing not available', 'Cannot share files on this device.');
        }
      }
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  }

  return (
    <View style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        {lastBackupLabel(lastBackupAt, now)}
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back up now"
        disabled={working}
        onPress={handleBackUpNow}
        style={[styles.button, { borderColor: theme.border, opacity: working ? 0.5 : 1 }]}>
        <ThemedText type="smallBold">Back up now</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  label: {
    flex: 1,
  },
  button: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
});
