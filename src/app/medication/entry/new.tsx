import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { FormScrollView } from '@/components/keyboard-aware-screen';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { createMedicationEvent } from '@/db/repository';
import { MedicationEntryForm, type MedicationEntrySavePayload } from '@/features/medications/MedicationEntryForm';
import { useMedications } from '@/features/medications/useMedicationData';
import { defaultEntryState } from '@/lib/medicationEntry';

/**
 * Log a new medication entry (HANDOFF.md #7, #9). Only active medications get
 * a line (#6's Create Entry button on the Meds tab is disabled when there are
 * none) — this screen's own empty state below is the fallback for reaching it
 * any other way (e.g. a stale deep link after the last active medication was
 * marked inactive mid-session).
 */
export default function NewMedicationEntryScreen() {
  const router = useRouter();
  const medications = useMedications();
  const [submitting, setSubmitting] = useState(false);
  // Captured once at mount — MedicationEntryForm only ever reads its `initial`
  // prop on its own first render, and re-deriving Date.now() on every render
  // would be an impure render (react-hooks/purity).
  const [now] = useState(() => Date.now());

  const activeMeds = medications.filter((med) => med.isActive);

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
        initial={defaultEntryState(activeMeds, now)}
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
