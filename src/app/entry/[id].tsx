import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { LogEntry } from '@/db/schema';
import { deleteLogEntry, getLogEntry, updateLogEntry } from '@/db/repository';
import { BmForm } from '@/features/bm/BmForm';
import { bmEntryToFormState, type BuiltBmEntry } from '@/features/bm/formModel';
import type { BuiltLogEntry } from '@/features/logging/formModel';
import { logEntryToFormState } from '@/features/logging/formModel';
import { LogEntryForm } from '@/features/logging/LogEntryForm';
import { SymptomForm } from '@/features/symptoms/SymptomForm';
import { symptomEntryToFormState, type BuiltSymptomEntry } from '@/features/symptoms/formModel';

// undefined = still loading, null = not found.
type LoadState = LogEntry | null | undefined;

export default function EditEntryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<LoadState>(undefined);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    getLogEntry(id).then((found) => {
      if (active) setEntry(found ?? null);
    });
    return () => {
      active = false;
    };
  }, [id]);

  async function handleSubmit(updated: BuiltLogEntry | BuiltBmEntry | BuiltSymptomEntry) {
    setSubmitting(true);
    try {
      await updateLogEntry(id, updated);
      router.back();
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete() {
    Alert.alert('Delete entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteLogEntry(id);
          router.back();
        },
      },
    ]);
  }

  if (entry === undefined) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (entry === null) {
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
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {entry.type === 'bowel_movement' ? (
        <BmForm
          initial={bmEntryToFormState(entry)}
          onSubmit={handleSubmit}
          submitLabel="Save changes"
          submitting={submitting}
        />
      ) : entry.type === 'symptom' ? (
        <SymptomForm
          initial={symptomEntryToFormState(entry)}
          onSubmit={handleSubmit}
          submitLabel="Save changes"
          submitting={submitting}
        />
      ) : (
        <LogEntryForm
          initial={logEntryToFormState(entry)}
          onSubmit={handleSubmit}
          submitLabel="Save changes"
          submitting={submitting}
        />
      )}
      <View style={styles.deleteWrapper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete entry"
          onPress={handleDelete}>
          <ThemedText type="link" style={styles.deleteLabel}>
            Delete entry
          </ThemedText>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  deleteWrapper: {
    alignItems: 'center',
  },
  deleteLabel: {
    color: '#d9534f',
  },
});
