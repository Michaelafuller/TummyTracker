import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { createMedicationEvent, deleteMedicationEvent } from '@/db/repository';
import { useTheme } from '@/hooks/use-theme';
import { formatTime12h } from '@/lib/datetime';
import { formatDoseNumber, regularDoses } from '@/lib/medications';
import { useMedications } from './useMedicationData';

interface LoggedState {
  eventId: string;
  takenAt: number;
}

/**
 * One-tap "Took my regular meds" (GitHub #26). Writes exactly ONE medication
 * event (time = now) with each active regular medication's default dose and
 * unit — only ever on an explicit tap (invariant, HANDOFF.md §0). After a
 * successful log the button is replaced by "Logged at … · Undo", so a second
 * tap can't log twice; Undo deletes that one event and brings the button back.
 * The Undo offer ends when the screen loses focus: the Meds tab stays mounted
 * across tab switches, so without this it would still offer to undo
 * yesterday's dose the next morning (review 2026-10-01).
 * Renders nothing when no medication is regular (and active, with a dose).
 */
export function RegularMedsButton() {
  const theme = useTheme();
  const medications = useMedications();
  const [logged, setLogged] = useState<LoggedState | null>(null);
  // A ref (not state) so a fast second tap, before React re-renders, is
  // rejected synchronously.
  const inFlight = useRef(false);

  useFocusEffect(
    useCallback(
      () => () => {
        setLogged(null);
      },
      [],
    ),
  );

  const doses = useMemo(() => regularDoses(medications), [medications]);
  const summary = useMemo(() => {
    const byId = new Map(medications.map((med) => [med.id, med]));
    return doses.map((dose) => ({
      id: dose.medicationId,
      text: `${byId.get(dose.medicationId)?.name ?? 'Medication'} ${formatDoseNumber(dose.dose)} ${dose.doseUnit}`,
      name: byId.get(dose.medicationId)?.name ?? 'Medication',
    }));
  }, [doses, medications]);

  async function handleLog() {
    if (inFlight.current || doses.length === 0) return;
    inFlight.current = true;
    try {
      const takenAt = Date.now();
      const { event } = await createMedicationEvent({ takenAt, timeKnown: true, notes: null }, doses);
      setLogged({ eventId: event.id, takenAt });
    } catch {
      Alert.alert("Couldn't log your meds", 'Something went wrong saving it — try again.');
    } finally {
      inFlight.current = false;
    }
  }

  async function handleUndo() {
    if (inFlight.current || !logged) return;
    inFlight.current = true;
    try {
      await deleteMedicationEvent(logged.eventId);
      setLogged(null);
    } catch {
      Alert.alert("Couldn't undo that", 'Something went wrong removing it — try again.');
    } finally {
      inFlight.current = false;
    }
  }

  if (logged) {
    return (
      <View
        style={[styles.loggedRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        testID="regular-meds-logged">
        <ThemedText type="small" style={styles.loggedText}>
          {`Logged at ${formatTime12h(logged.takenAt)}`}
        </ThemedText>
        <Pressable
          testID="regular-meds-undo"
          accessibilityRole="button"
          accessibilityLabel="Undo regular meds log"
          onPress={handleUndo}
          hitSlop={Spacing.two}>
          <ThemedText type="link">Undo</ThemedText>
        </Pressable>
      </View>
    );
  }

  if (doses.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <PrimaryButton
        label="Took my regular meds"
        accessibilityLabel={`Took my regular meds: ${summary.map((s) => s.name).join(', ')}`}
        testID="regular-meds-log"
        onPress={handleLog}
      />
      <ThemedText type="small" themeColor="textSecondary" style={styles.summary}>
        {summary.map((s) => s.text).join(' · ')}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.one,
  },
  summary: {
    textAlign: 'center',
  },
  loggedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  loggedText: {
    flex: 1,
  },
});
