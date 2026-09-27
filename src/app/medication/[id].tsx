import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { FormScrollView } from '@/components/keyboard-aware-screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getMedication, setMedicationActive, updateMedication } from '@/db/repository';
import type { Medication } from '@/db/schema';
import { medicationToFormState, type BuiltMedication } from '@/features/medications/formModel';
import { MedicationForm } from '@/features/medications/MedicationForm';

// undefined = still loading, null = not found.
type LoadState = Medication | null | undefined;

export default function EditMedicationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [medication, setMedication] = useState<LoadState>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  const load = useCallback(async () => {
    const found = await getMedication(id);
    setMedication(found ?? null);
  }, [id]);

  // Re-fetch on every focus (not just mount) — mirrors src/app/entry/[id].tsx
  // so returning to this screen (e.g. after Mark inactive) shows fresh data.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleSubmit(built: BuiltMedication) {
    setSubmitting(true);
    try {
      await updateMedication(id, built);
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
      <MedicationForm
        key={String(medication.updatedAt)}
        initial={medicationToFormState(medication)}
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
