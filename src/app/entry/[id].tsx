import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { LogEntry, MealComponent } from '@/db/schema';
import { deleteLogEntry, getLogEntry, getMealComponents, updateLogEntry } from '@/db/repository';
import { BmForm } from '@/features/bm/BmForm';
import { bmEntryToFormState, type BuiltBmEntry } from '@/features/bm/formModel';
import type { BuiltLogEntry } from '@/features/logging/formModel';
import { logEntryToFormState } from '@/features/logging/formModel';
import { LogEntryForm } from '@/features/logging/LogEntryForm';
import { SymptomForm } from '@/features/symptoms/SymptomForm';
import { symptomEntryToFormState, type BuiltSymptomEntry } from '@/features/symptoms/formModel';
import { useTheme } from '@/hooks/use-theme';

// undefined = still loading, null = not found.
type LoadState = LogEntry | null | undefined;

export default function EditEntryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<LoadState>(undefined);
  const [components, setComponents] = useState<MealComponent[]>([]);
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

  // A grouped meal (componentCount > 1) has child rows worth showing read-only —
  // v1 does not support editing components after save (HANDOFF 2.5).
  useEffect(() => {
    if (!entry || entry.componentCount == null || entry.componentCount <= 1) return;
    let active = true;
    getMealComponents(entry.id).then((rows) => {
      if (active) setComponents(rows);
    });
    return () => {
      active = false;
    };
  }, [entry]);

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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
      {components.length > 0 ? (
        <View style={styles.componentSection}>
          <ThemedText type="smallBold">In this meal</ThemedText>
          <View style={styles.componentList}>
            {components.map((component) => (
              <View
                key={component.id}
                style={[styles.componentRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <ThemedText type="small" numberOfLines={1}>
                  {`${component.name} · ${component.servings}× serving${component.calories != null ? ` · ${Math.round(component.calories * component.servings)} kcal` : ''}`}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.deleteWrapper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete entry"
          onPress={handleDelete}>
          <ThemedText type="link" themeColor="danger">
            Delete entry
          </ThemedText>
        </Pressable>
      </View>
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  deleteWrapper: {
    alignItems: 'center',
  },
  componentSection: {
    gap: Spacing.two,
  },
  componentList: {
    gap: Spacing.two,
  },
  componentRow: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
