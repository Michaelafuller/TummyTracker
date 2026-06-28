import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SymptomForm onSubmit={handleSubmit} submitLabel="Save" submitting={submitting} />
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
