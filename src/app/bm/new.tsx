import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { createLogEntry } from '@/db/repository';
import { BmForm } from '@/features/bm/BmForm';
import type { BuiltBmEntry } from '@/features/bm/formModel';

export default function NewBowelMovementScreen() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(entry: BuiltBmEntry) {
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
        <BmForm onSubmit={handleSubmit} submitLabel="Save" submitting={submitting} />
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
