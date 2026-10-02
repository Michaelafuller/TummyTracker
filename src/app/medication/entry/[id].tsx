import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';

import { FormScrollView } from '@/components/keyboard-aware-screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { deleteMedicationEvent, getMedicationEvent, updateMedicationEvent } from '@/db/repository';
import type { MedicationDose, MedicationEvent } from '@/db/schema';
import { MedicationEntryForm, type MedicationEntrySavePayload } from '@/features/medications/MedicationEntryForm';
import {
  useMedicationDoses,
  useMedicationEvents,
  useMedications,
} from '@/features/medications/useMedicationData';
import { entryStateFromEvent } from '@/lib/medicationEntry';
import { reasonSuggestionsByMedication } from '@/lib/medications';

// undefined = still loading, null = not found (already deleted).
type LoadState = { event: MedicationEvent; doses: MedicationDose[] } | null | undefined;

/**
 * Edit (or delete) a logged medication entry (HANDOFF.md #7, #8, #9, #10).
 * Reached from the Meds tab's Recent doses, the history screen, and the
 * Journal's medication rows.
 */
export default function EditMedicationEntryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  // All medications (active + inactive) — entryStateFromEvent needs every
  // medication the event logged a dose for, even one since marked inactive
  // (#11 invariant: never deleted, still shown).
  const medications = useMedications();
  const allEvents = useMedicationEvents();
  const allDoses = useMedicationDoses();
  const reasonSuggestions = useMemo(
    () => reasonSuggestionsByMedication(medications, allEvents, allDoses),
    [medications, allEvents, allDoses],
  );
  const [loaded, setLoaded] = useState<LoadState>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const found = await getMedicationEvent(id);
    setLoaded(found ?? null);
  }, [id]);

  // Re-fetch on every focus (not just mount) — mirrors src/app/entry/[id].tsx.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleSubmit({ event, doses }: MedicationEntrySavePayload) {
    setSubmitting(true);
    try {
      await updateMedicationEvent(id, event, doses);
      router.back();
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete() {
    Alert.alert('Delete this entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteMedicationEvent(id);
          router.back();
        },
      },
    ]);
  }

  if (loaded === undefined) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (loaded === null) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="smallBold">Entry not found</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          It may have been deleted.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <FormScrollView>
      <MedicationEntryForm
        key={String(loaded.event.updatedAt)}
        medications={medications}
        reasonSuggestions={reasonSuggestions}
        initial={entryStateFromEvent(loaded.event, loaded.doses, medications)}
        onSubmit={handleSubmit}
        submitLabel="Save changes"
        submitting={submitting}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete entry"
        onPress={handleDelete}
        style={styles.deleteWrapper}>
        <ThemedText type="link" themeColor="danger">
          Delete entry
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
  deleteWrapper: {
    alignItems: 'center',
  },
});
