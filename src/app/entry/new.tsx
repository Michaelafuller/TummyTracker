import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { createLogEntry } from '@/db/repository';
import type { BuiltLogEntry } from '@/features/logging/formModel';
import { LogEntryForm } from '@/features/logging/LogEntryForm';
import { usePrefillStore } from '@/features/logging/prefillStore';

export default function NewEntryScreen() {
  const router = useRouter();
  // The barcode scanner (Phase 1c) drops prefill here before navigating in.
  const [prefill] = useState(() => usePrefillStore.getState().prefill);
  const clearPrefill = usePrefillStore((state) => state.clearPrefill);
  const [submitting, setSubmitting] = useState(false);

  // Consume the prefill once so a later manual "Add entry" starts blank.
  useEffect(() => () => clearPrefill(), [clearPrefill]);

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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <LogEntryForm
          initial={prefill ?? undefined}
          onSubmit={handleSubmit}
          submitLabel="Save entry"
          submitting={submitting}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
});
