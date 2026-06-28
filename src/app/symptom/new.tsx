import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { createLogEntry } from '@/db/repository';
import { SymptomForm } from '@/features/symptoms/SymptomForm';
import type { BuiltSymptomEntry } from '@/features/symptoms/formModel';

export default function NewSymptomScreen() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(entry: BuiltSymptomEntry) {
    setSubmitting(true);
    try {
      await createLogEntry(entry);
      router.back();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SymptomForm onSubmit={handleSubmit} submitLabel="Save" submitting={submitting} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
});
