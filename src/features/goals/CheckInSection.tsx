import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';

import { FormField } from '@/components/form-fields';
import { ThemedText } from '@/components/themed-text';
import { TimeField } from '@/components/time-field';
import { Spacing } from '@/constants/theme';
import { DEFAULT_CHECK_IN, type CheckInState } from './checkInModel';
import { disableCheckIn, ensureNotificationPermission, getCheckIn, refreshCheckIn } from './checkInService';

/**
 * Daily check-in enable+time control (HANDOFF.md Phase 4), Goals tab. Mirrors
 * the reminders block in src/app/(tabs)/settings.tsx: the scheduled
 * notification itself is the source of truth (nothing persisted here beyond
 * it), and enabling follows the same request-permission-then-schedule flow
 * as `enableReminder` (leave the switch off if permission is declined).
 */
export function CheckInSection() {
  const [checkIn, setCheckIn] = useState<CheckInState>(DEFAULT_CHECK_IN);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getCheckIn().then((state) => {
      if (!active) return;
      setCheckIn(state);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function toggle(value: boolean) {
    if (value) {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        Alert.alert(
          'Notifications are off',
          'Enable notifications for TummyTracker in your system settings to get the daily check-in.',
        );
        return;
      }
      await refreshCheckIn(checkIn.hour, checkIn.minute);
      setCheckIn(await getCheckIn());
    } else {
      await disableCheckIn();
      setCheckIn((prev) => ({ ...prev, enabled: false }));
    }
  }

  async function commitTime(hour: number, minute: number) {
    setCheckIn((prev) => ({ ...prev, hour, minute }));
    if (checkIn.enabled) {
      await refreshCheckIn(hour, minute);
    }
  }

  if (loading) return null;

  return (
    <View style={styles.section}>
      <ThemedText type="subtitle">Daily check-in</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        One reminder naming any floor goals still unmet for the day. Nothing to check in on means
        nothing fires.
      </ThemedText>

      <View style={styles.row}>
        <ThemedText type="smallBold">Check-in</ThemedText>
        <Switch value={checkIn.enabled} onValueChange={toggle} accessibilityLabel="Daily check-in" />
      </View>

      <FormField label="Time">
        <TimeField
          hour={checkIn.hour}
          minute={checkIn.minute}
          onChange={commitTime}
          accessibilityLabel="Daily check-in time"
        />
      </FormField>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
