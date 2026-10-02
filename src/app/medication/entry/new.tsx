import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { FormScrollView } from '@/components/keyboard-aware-screen';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { createMedicationEvent } from '@/db/repository';
import { MedicationEntryForm, type MedicationEntrySavePayload } from '@/features/medications/MedicationEntryForm';
import {
  useMedicationDoses,
  useMedicationEvents,
  useMedications,
} from '@/features/medications/useMedicationData';
import { defaultEntryState } from '@/lib/medicationEntry';
import { reasonSuggestionsByMedication } from '@/lib/medications';

/**
 * Log a new medication entry (HANDOFF.md #7, #9). Only active medications get
 * a line (#6's Create Entry button on the Meds tab is disabled when there are
 * none) — this screen's own empty state below is the fallback for reaching it
 * any other way (e.g. a stale deep link after the last active medication was
 * marked inactive mid-session).
 */
export default function NewMedicationEntryScreen() {
  const router = useRouter();
  const { medicationIds } = useLocalSearchParams<{ medicationIds?: string }>();
  const medications = useMedications();
  const allEvents = useMedicationEvents();
  const allDoses = useMedicationDoses();
  const reasonSuggestions = useMemo(
    () => reasonSuggestionsByMedication(medications, allEvents, allDoses),
    [medications, allEvents, allDoses],
  );
  const [submitting, setSubmitting] = useState(false);
  // Captured once at mount — MedicationEntryForm only ever reads its `initial`
  // prop on its own first render, and re-deriving Date.now() on every render
  // would be an impure render (react-hooks/purity).
  const [now] = useState(() => Date.now());

  const activeMeds = medications.filter((med) => med.isActive);

  // From a medication reminder's tap (GitHub #29): those medications start
  // ticked. Unknown or inactive ids are ignored (they never get a line);
  // without the param the form is exactly as before. Selecting a line only
  // pre-ticks it — nothing is saved until the user presses Save.
  const preselected = new Set((medicationIds ?? '').split(',').filter((id) => id.length > 0));
  const initialState = defaultEntryState(activeMeds, now);
  if (preselected.size > 0) {
    initialState.lines = initialState.lines.map((line) =>
      preselected.has(line.medicationId) ? { ...line, selected: true } : line,
    );
  }

  async function handleSubmit({ event, doses }: MedicationEntrySavePayload) {
    setSubmitting(true);
    try {
      await createMedicationEvent(event, doses);
      router.back();
    } finally {
      setSubmitting(false);
    }
  }

  if (activeMeds.length === 0) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="smallBold">Add a medication first</ThemedText>
        <PrimaryButton
          label="Add medication"
          accessibilityLabel="Add medication"
          onPress={() => router.push('/medication/new')}
        />
      </ThemedView>
    );
  }

  return (
    <FormScrollView>
      <MedicationEntryForm
        medications={medications}
        reasonSuggestions={reasonSuggestions}
        initial={initialState}
        onSubmit={handleSubmit}
        submitLabel="Save"
        submitting={submitting}
      />
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
});
