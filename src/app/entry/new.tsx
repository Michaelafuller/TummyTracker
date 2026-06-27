import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { createLogEntry } from '@/db/repository';
import type { BuiltLogEntry } from '@/features/logging/formModel';
import { LogEntryForm } from '@/features/logging/LogEntryForm';

export default function NewEntryScreen() {
  const router = useRouter();
  // Phase 1c passes a scanned barcode through to pre-fill the entry.
  const { barcode } = useLocalSearchParams<{ barcode?: string }>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(entry: BuiltLogEntry) {
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
      <LogEntryForm
        initial={barcode ? { barcode } : undefined}
        onSubmit={handleSubmit}
        submitLabel="Save entry"
        submitting={submitting}
      />
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
