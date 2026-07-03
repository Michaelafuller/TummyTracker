import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DateTimeField } from '@/components/date-time-field';
import { FormField, ThemedTextInput } from '@/components/form-fields';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { FOOD_TYPES, MEAL_SLOTS, type MealSlot } from '@/db/schema';
import { createMealWithComponents } from '@/db/repository';
import { useMealBuilderStore } from '@/features/logging/mealBuilderStore';
import {
  buildMealEntry,
  defaultMealReviewState,
  type MealReviewErrors,
  type MealReviewFormState,
} from '@/features/logging/mealReviewFormModel';
import { SentimentSelector } from '@/features/sentiment/SentimentSelector';
import { useTheme } from '@/hooks/use-theme';
import { aggregateComponents } from '@/lib/mealAggregate';
import { MAX_NOTES_LENGTH } from '@/lib/validation';

const TYPE_OPTIONS = FOOD_TYPES.map((value) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
}));

const MEAL_SLOT_OPTIONS = MEAL_SLOTS.map((value) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
}));

/**
 * Meal review screen — the last step of the multi-scan meal builder (HANDOFF
 * Phase 2.3). Lists the components collected so far with a live aggregate
 * preview, then collects the meal-level fields once and saves everything as a
 * single logEntry + N mealComponent rows via createMealWithComponents.
 */
export default function MealReviewScreen() {
  const theme = useTheme();
  const router = useRouter();
  const components = useMealBuilderStore((state) => state.components);
  const removeComponent = useMealBuilderStore((state) => state.removeComponent);
  const clearBuilder = useMealBuilderStore((state) => state.clear);

  const [state, setState] = useState<MealReviewFormState>(() => defaultMealReviewState(components));
  const [errors, setErrors] = useState<MealReviewErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const aggregate = useMemo(() => aggregateComponents(components), [components]);
  const noteCount = state.notes.length;

  const set = useMemo(
    () =>
      <K extends keyof MealReviewFormState>(key: K, value: MealReviewFormState[K]) =>
        setState((prev) => ({ ...prev, [key]: value })),
    [],
  );

  async function handleSave() {
    const result = buildMealEntry(state, components);
    setErrors(result.errors);
    if (!result.valid || !result.entry) return;

    setSubmitting(true);
    try {
      await createMealWithComponents(result.entry, components);
      clearBuilder();
      router.dismissAll();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="smallBold">In this meal</ThemedText>
        <View style={styles.componentList}>
          {components.map((component, index) => (
            <View
              key={`${component.name}-${index}`}
              testID={`component-${index}`}
              style={[styles.componentRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={styles.componentBody}>
                <ThemedText type="small" numberOfLines={1}>
                  {`${component.name} · ${component.servings ?? 1}× serving${component.calories != null ? ` · ${Math.round(component.calories * (component.servings ?? 1))} kcal` : ''}`}
                </ThemedText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${component.name} from meal`}
                onPress={() => removeComponent(index)}>
                <ThemedText type="link" themeColor="danger">
                  Remove
                </ThemedText>
              </Pressable>
            </View>
          ))}
        </View>

        <ThemedText type="small" themeColor="textSecondary">
          {`Aggregate: ${aggregate.calories != null ? `${aggregate.calories} kcal` : 'no calorie data'}`}
        </ThemedText>

        <FormField label="Name" error={errors.name}>
          <ThemedTextInput
            value={state.name}
            onChangeText={(value) => set('name', value)}
            placeholder="e.g. Chicken salad"
            accessibilityLabel="Meal name"
            returnKeyType="next"
          />
        </FormField>

        <FormField label="Type">
          <SegmentedControl
            options={TYPE_OPTIONS}
            value={state.type}
            onChange={(value) => value && set('type', value)}
          />
        </FormField>

        <FormField label="Meal slot">
          <SegmentedControl
            options={MEAL_SLOT_OPTIONS}
            value={state.mealSlot}
            onChange={(value) => set('mealSlot', value as MealSlot | null)}
            allowClear
          />
        </FormField>

        <DateTimeField
          dateInput={state.dateInput}
          timeInput={state.timeInput}
          onDateChange={(v) => set('dateInput', v)}
          onTimeChange={(v) => set('timeInput', v)}
          error={errors.loggedAt}
        />

        <FormField label="How did it sit with you?">
          <SentimentSelector
            value={state.sentiment}
            onChange={(value) => set('sentiment', value)}
            onClear={() => set('sentiment', null)}
          />
        </FormField>

        <FormField label="Notes" error={errors.notes} hint={`${noteCount}/${MAX_NOTES_LENGTH}`}>
          <ThemedTextInput
            value={state.notes}
            onChangeText={(value) => set('notes', value)}
            placeholder="Anything worth remembering"
            accessibilityLabel="Notes"
            multiline
            maxLength={MAX_NOTES_LENGTH}
          />
        </FormField>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save meal"
          accessibilityState={{ disabled: submitting || components.length === 0 }}
          disabled={submitting || components.length === 0}
          onPress={handleSave}
          style={[
            styles.submit,
            { backgroundColor: theme.text, opacity: submitting || components.length === 0 ? 0.5 : 1 },
          ]}>
          <ThemedText style={[styles.submitLabel, { color: theme.background }]}>
            {submitting ? 'Saving…' : 'Save meal'}
          </ThemedText>
        </Pressable>
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
  componentBody: {
    flex: 1,
  },
  submit: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  submitLabel: {
    fontSize: 16,
    fontWeight: 600,
  },
});
