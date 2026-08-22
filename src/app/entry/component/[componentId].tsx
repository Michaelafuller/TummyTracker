import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { MealComponent } from '@/db/schema';
import {
  deleteMealComponentAndReaggregate,
  getMealComponent,
  updateMealComponentAndReaggregate,
} from '@/db/repository';
import { ComponentForm } from '@/features/logging/ComponentForm';
import { mealComponentToFormState } from '@/features/logging/componentFormModel';
import type { MealComponentDraft } from '@/lib/mealAggregate';

// undefined = still loading, null = not found.
type LoadState = MealComponent | null | undefined;

/**
 * Edit screen for one saved meal component (HANDOFF.md meal-component
 * drill-down). Reached by tapping a component row on the entry edit screen.
 * Full nutrition grid doubles as "see the nutritional information" for that
 * component. Save re-aggregates the parent entry (updateMealComponentAndReaggregate)
 * so totals/tags stay consistent, then returns to the entry screen — which
 * refreshes on focus to show the new totals. Delete does the same
 * re-aggregation via deleteMealComponentAndReaggregate after a confirm
 * Alert; a 'last' result (this is the entry's only component) shows a
 * keep-one-item alert instead of deleting (HANDOFF.md meal-component delete).
 */
export default function EditComponentScreen() {
  const router = useRouter();
  const { componentId } = useLocalSearchParams<{ componentId: string }>();
  const [component, setComponent] = useState<LoadState>(undefined);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    getMealComponent(componentId).then((found) => {
      if (active) setComponent(found ?? null);
    });
    return () => {
      active = false;
    };
  }, [componentId]);

  async function handleSubmit(draft: MealComponentDraft) {
    if (submitting || !component) return;
    setSubmitting(true);
    try {
      await updateMealComponentAndReaggregate(component.id, draft);
      router.back();
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete() {
    if (submitting || !component) return;
    const target = component;
    Alert.alert(
      'Remove from this meal?',
      `${target.name} will be removed and the meal's totals recalculated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              const result = await deleteMealComponentAndReaggregate(target.id);
              if (result === 'last') {
                Alert.alert(
                  'Keep at least one item',
                  'A meal needs one item — delete the whole entry instead.',
                );
                return;
              }
              router.back();
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  }

  if (component === undefined) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (component === null) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="smallBold">Component not found</ThemedText>
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
        <ComponentForm
          initial={mealComponentToFormState(component)}
          sortOrder={component.sortOrder}
          submitLabel="Save changes"
          onSubmit={handleSubmit}
          onDelete={handleDelete}
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
});
