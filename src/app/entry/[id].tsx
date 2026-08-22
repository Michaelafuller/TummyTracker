import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { LogEntry, MealComponent } from '@/db/schema';
import {
  deleteLogEntry,
  deleteMealComponentAndReaggregate,
  getLogEntry,
  getMealComponents,
  updateLogEntry,
} from '@/db/repository';
import { BmForm } from '@/features/bm/BmForm';
import { bmEntryToFormState, type BuiltBmEntry } from '@/features/bm/formModel';
import type { BuiltLogEntry } from '@/features/logging/formModel';
import { logEntryToFormState } from '@/features/logging/formModel';
import { LogEntryForm } from '@/features/logging/LogEntryForm';
import { SymptomForm } from '@/features/symptoms/SymptomForm';
import { symptomEntryToFormState, type BuiltSymptomEntry } from '@/features/symptoms/formModel';
import { useWatchlistStore } from '@/features/watchlist/watchlistStore';
import { useTheme } from '@/hooks/use-theme';
import { describeWatchedMatches, findWatchedTags } from '@/lib/watchlist';

// undefined = still loading, null = not found.
type LoadState = LogEntry | null | undefined;

export default function EditEntryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<LoadState>(undefined);
  const [components, setComponents] = useState<MealComponent[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const watchlistItems = useWatchlistStore((state) => state.items);
  const watchedMatches = entry ? findWatchedTags(entry.tagsJson, watchlistItems) : [];

  // Shared by the focus effect below and the post-delete refresh
  // (handleDeleteComponent) — a new `entry` object reference re-triggers the
  // components effect below and remounts the form via its `key={entry.updatedAt}`
  // (HANDOFF meal-component drill-down / meal-component delete).
  const loadEntry = useCallback(async () => {
    const found = await getLogEntry(id);
    setEntry(found ?? null);
  }, [id]);

  // Re-fetch on every focus (not just mount) so returning from the component
  // edit screen shows fresh data.
  useFocusEffect(
    useCallback(() => {
      loadEntry();
    }, [loadEntry]),
  );

  // A grouped meal (componentCount > 1) has child rows worth showing —
  // tapping one opens its edit screen (HANDOFF meal-component drill-down).
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

  function handleDeleteComponent(component: MealComponent) {
    Alert.alert(
      'Remove from this meal?',
      `${component.name} will be removed and the meal's totals recalculated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteMealComponentAndReaggregate(component.id);
            if (result === 'last') {
              Alert.alert(
                'Keep at least one item',
                'A meal needs one item — delete the whole entry instead.',
              );
              return;
            }
            await loadEntry();
          },
        },
      ],
    );
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
      {watchedMatches.length > 0 ? (
        <View
          accessibilityRole="alert"
          accessibilityLabel={`Contains a watched ingredient: ${describeWatchedMatches(watchedMatches)}`}
          style={[styles.watchBanner, { backgroundColor: theme.backgroundSelected, borderColor: theme.danger }]}>
          <ThemedText type="smallBold" themeColor="danger">
            Contains a watched ingredient
          </ThemedText>
          <ThemedText type="small">{describeWatchedMatches(watchedMatches)}</ThemedText>
        </View>
      ) : null}
      {entry.type === 'bowel_movement' ? (
        <BmForm
          key={String(entry.updatedAt)}
          initial={bmEntryToFormState(entry)}
          onSubmit={handleSubmit}
          submitLabel="Save changes"
          submitting={submitting}
        />
      ) : entry.type === 'symptom' ? (
        <SymptomForm
          key={String(entry.updatedAt)}
          initial={symptomEntryToFormState(entry)}
          onSubmit={handleSubmit}
          submitLabel="Save changes"
          submitting={submitting}
        />
      ) : (
        <LogEntryForm
          key={String(entry.updatedAt)}
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
              <ReanimatedSwipeable
                key={component.id}
                overshootRight={false}
                friction={2}
                renderRightActions={() => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${component.name}`}
                    testID={`component-delete-${component.id}`}
                    onPress={() => handleDeleteComponent(component)}
                    style={[styles.deleteAction, { backgroundColor: theme.danger }]}>
                    <ThemedText style={[styles.deleteActionLabel, { color: theme.backgroundElement }]}>
                      Delete
                    </ThemedText>
                  </Pressable>
                )}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${component.name}`}
                  testID={`component-row-${component.id}`}
                  onPress={() => router.push(`/entry/component/${component.id}`)}
                  style={[styles.componentRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <ThemedText type="small" numberOfLines={1} style={styles.componentRowText}>
                    {`${component.name} · ${component.servings}× serving${component.calories != null ? ` · ${Math.round(component.calories * component.servings)} kcal` : ''}`}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    ›
                  </ThemedText>
                </Pressable>
              </ReanimatedSwipeable>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  componentRowText: {
    flex: 1,
  },
  deleteAction: {
    width: 88,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Spacing.three,
  },
  deleteActionLabel: {
    fontWeight: '600',
  },
  watchBanner: {
    gap: Spacing.half,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
