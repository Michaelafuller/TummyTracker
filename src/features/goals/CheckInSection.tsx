import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';

import { FormField } from '@/components/form-fields';
import { ThemedText } from '@/components/themed-text';
import { TimeField } from '@/components/time-field';
import { Spacing } from '@/constants/theme';
import { usePrefsStore } from '@/features/prefs/prefsStore';
import { disableCheckIn, ensureNotificationPermission, getCheckIn, refreshCheckIn } from './checkInService';
import { useGoalsStore } from './goalsStore';

/**
 * Daily check-in enable+time control (HANDOFF.md Phase 4), Goals tab.
 * Persisted prefs are the source of truth for "enabled" (HANDOFF.md Cycle A
 * fix — the OS-scheduled notification used to be, but firing it silently
 * disabled the toggle): this component reads via `usePrefsStore` and writes
 * exclusively through its `setCheckIn` action. The one-time OS-schedule
 * adoption (pre-existing installs) runs inside `checkInService.getCheckIn`
 * on mount; its result is synced into the store below.
 */
export function CheckInSection() {
  const checkInEnabled = usePrefsStore((state) => state.checkInEnabled);
  const checkInHour = usePrefsStore((state) => state.checkInHour);
  const checkInMinute = usePrefsStore((state) => state.checkInMinute);
  const setCheckIn = usePrefsStore((state) => state.setCheckIn);
  const hasFloorGoal = useGoalsStore((state) => state.goals.some((g) => g.direction === 'floor'));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    getCheckIn().then((state) => {
      if (!active) return;
      setCheckIn(state.enabled, state.hour, state.minute);
      setReady(true);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; setCheckIn is a stable zustand action.
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
      // Toggle semantics with zero floor goals (design contract): the flag
      // persists true and the switch stays ON even though nothing gets
      // scheduled (refreshCheckIn no-ops until a floor goal exists).
      setCheckIn(true, checkInHour, checkInMinute);
      await refreshCheckIn(checkInHour, checkInMinute);
    } else {
      setCheckIn(false, checkInHour, checkInMinute);
      await disableCheckIn();
    }
  }

  async function commitTime(hour: number, minute: number) {
    setCheckIn(checkInEnabled, hour, minute);
    if (checkInEnabled) {
      await refreshCheckIn(hour, minute);
    }
  }

  if (!ready) return null;

  return (
    <View style={styles.section}>
      <ThemedText type="subtitle">Daily check-in</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        One reminder naming any floor goals still unmet for the day. Nothing to check in on means
        nothing fires.
      </ThemedText>

      <View style={styles.row}>
        <ThemedText type="smallBold">Check-in</ThemedText>
        <Switch value={checkInEnabled} onValueChange={toggle} accessibilityLabel="Daily check-in" />
      </View>

      {checkInEnabled && !hasFloorGoal ? (
        <ThemedText type="small" themeColor="textSecondary">
          Add a floor goal to get check-ins.
        </ThemedText>
      ) : null}

      <FormField label="Time">
        <TimeField
          hour={checkInHour}
          minute={checkInMinute}
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
