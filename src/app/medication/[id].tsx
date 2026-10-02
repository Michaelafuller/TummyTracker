import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Calendar } from 'react-native-calendars';

import { FormScrollView } from '@/components/keyboard-aware-screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getMedication, listMedicationReminders, setMedicationActive, updateMedication } from '@/db/repository';
import type { Medication, MedicationReminder } from '@/db/schema';
import { medicationToFormState, type BuiltMedication } from '@/features/medications/formModel';
import { MedicationForm } from '@/features/medications/MedicationForm';
import type { ReminderInput } from '@/features/medications/reminderModel';
import { useMedicationDoses, useMedicationEvents } from '@/features/medications/useMedicationData';
import { useTheme } from '@/hooks/use-theme';
import { formatDateInput } from '@/lib/datetime';
import { buildCalendarTheme } from '@/lib/journal';
import { adherenceLine, adherenceSummary, doseDayKeys } from '@/lib/medications';

// undefined = still loading, null = not found.
type LoadState = Medication | null | undefined;

export default function EditMedicationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [medication, setMedication] = useState<LoadState>(undefined);
  const [reminders, setReminders] = useState<MedicationReminder[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const theme = useTheme();
  const events = useMedicationEvents();
  const doses = useMedicationDoses();
  // Read again on every focus so "today" and the 30-day window follow the day.
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const [found, savedReminders] = await Promise.all([getMedication(id), listMedicationReminders(id)]);
    setReminders(savedReminders);
    setMedication(found ?? null);
    setNow(Date.now());
  }, [id]);

  // Adherence line + dose-day dots (GitHub #28). Only ever reads logged
  // doses — a day without one is simply unknown.
  const adherenceText = useMemo(
    () => (medication ? adherenceLine(medication, adherenceSummary(medication, events, doses, now)) : null),
    [medication, events, doses, now],
  );
  const markedDates = useMemo(() => {
    const marks: Record<string, { marked: boolean; dotColor: string }> = {};
    for (const key of doseDayKeys(id, events, doses)) {
      marks[key] = { marked: true, dotColor: theme.accent };
    }
    return marks;
  }, [id, events, doses, theme.accent]);
  const calendarTheme = useMemo(() => buildCalendarTheme(theme), [theme]);

  // Re-fetch on every focus (not just mount) — mirrors src/app/entry/[id].tsx
  // so returning to this screen (e.g. after Mark inactive) shows fresh data.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleSubmit(built: BuiltMedication, builtReminders: ReminderInput[]) {
    setSubmitting(true);
    try {
      await updateMedication(id, { ...built, reminders: builtReminders });
      router.back();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive() {
    if (!medication) return;
    setTogglingActive(true);
    try {
      await setMedicationActive(id, !medication.isActive);
      await load();
    } finally {
      setTogglingActive(false);
    }
  }

  if (medication === undefined) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (medication === null) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="smallBold">Medication not found</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          It may have been removed.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <FormScrollView>
      <ThemedText type="small" themeColor="textSecondary" testID="adherence-line">
        {adherenceText}
      </ThemedText>
      <Calendar
        key={`dose-cal-${theme.background}`}
        testID="dose-calendar"
        current={formatDateInput(now)}
        markedDates={markedDates}
        enableSwipeMonths
        theme={calendarTheme}
      />
      <MedicationForm
        key={String(medication.updatedAt)}
        initial={medicationToFormState(medication, reminders)}
        onSubmit={handleSubmit}
        submitLabel="Save changes"
        submitting={submitting}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={medication.isActive ? 'Mark inactive' : 'Mark active'}
        disabled={togglingActive}
        onPress={handleToggleActive}
        style={styles.toggleWrapper}>
        <ThemedText type="link" themeColor={medication.isActive ? 'danger' : 'link'}>
          {medication.isActive ? 'Mark inactive' : 'Mark active'}
        </ThemedText>
      </Pressable>
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  toggleWrapper: {
    alignItems: 'center',
  },
});
