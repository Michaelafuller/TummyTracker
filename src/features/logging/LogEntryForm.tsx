import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateTimeField } from '@/components/date-time-field';
import { FormField, ThemedTextInput } from '@/components/form-fields';
import { formatDateInput, formatTimeInput } from '@/lib/datetime';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { FOOD_TYPES, MEAL_SLOTS, type MealSlot } from '@/db/schema';
import { useTheme } from '@/hooks/use-theme';
import { NUTRITION_LABELS, scaleNutrition } from '@/lib/nutrition';
import { MAX_NOTES_LENGTH, NUTRITION_FIELDS, type NutritionField } from '@/lib/validation';
import { SentimentSelector } from '@/features/sentiment/SentimentSelector';
import {
  buildLogEntry,
  type BuiltLogEntry,
  emptyNutritionInputs,
  type FormErrors,
  type LogEntryFormState,
} from './formModel';

const TYPE_OPTIONS = FOOD_TYPES.map((value) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
}));

const MEAL_SLOT_OPTIONS = MEAL_SLOTS.map((value) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
}));

function defaultState(initial?: Partial<LogEntryFormState>): LogEntryFormState {
  const now = Date.now();
  return {
    type: 'meal',
    name: '',
    mealSlot: null,
    dateInput: formatDateInput(now),
    timeInput: formatTimeInput(now),
    sentiment: null,
    notes: '',
    nutrition: emptyNutritionInputs(),
    barcode: null,
    ingredientsText: '',
    tagsJson: '',
    servingG: '',
    nutritionBase: null,
    ...initial,
  };
}

export interface LogEntryFormProps {
  initial?: Partial<LogEntryFormState>;
  onSubmit: (entry: BuiltLogEntry) => void | Promise<void>;
  submitLabel?: string;
  submitting?: boolean;
}

export function LogEntryForm({
  initial,
  onSubmit,
  submitLabel = 'Save',
  submitting = false,
}: LogEntryFormProps) {
  const theme = useTheme();
  const [state, setState] = useState<LogEntryFormState>(() => defaultState(initial));
  const [errors, setErrors] = useState<FormErrors>({ nutrition: {} });

  const noteCount = state.notes.length;

  const set = useMemo(
    () =>
      <K extends keyof LogEntryFormState>(key: K, value: LogEntryFormState[K]) =>
        setState((prev) => ({ ...prev, [key]: value })),
    [],
  );

  function setNutrition(field: NutritionField, value: string) {
    setState((prev) => ({ ...prev, nutrition: { ...prev.nutrition, [field]: value } }));
  }

  function handleServingChange(value: string) {
    setState((prev) => {
      const parsed = Number(value);
      if (prev.nutritionBase != null && value.trim() !== '' && parsed > 0 && Number.isFinite(parsed)) {
        const scaled = scaleNutrition(prev.nutritionBase, parsed);
        const nutrition = NUTRITION_FIELDS.reduce(
          (acc, field) => {
            const v = scaled[field];
            acc[field] = v == null ? '' : String(v);
            return acc;
          },
          {} as typeof prev.nutrition,
        );
        return { ...prev, servingG: value, nutrition };
      }
      return { ...prev, servingG: value };
    });
  }

  async function handleSubmit() {
    const result = buildLogEntry(state);
    setErrors(result.errors);
    if (result.valid && result.entry) {
      await onSubmit(result.entry);
    }
  }

  return (
    <View style={styles.form}>
      <FormField label="Type">
        <SegmentedControl
          options={TYPE_OPTIONS}
          value={state.type}
          onChange={(value) => value && set('type', value)}
        />
      </FormField>

      <FormField label="Name" error={errors.name}>
        <ThemedTextInput
          value={state.name}
          onChangeText={(value) => set('name', value)}
          placeholder="e.g. Chicken salad"
          accessibilityLabel="Entry name"
          returnKeyType="next"
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

      <FormField
        label="Notes"
        error={errors.notes}
        hint={`${noteCount}/${MAX_NOTES_LENGTH}`}>
        <ThemedTextInput
          value={state.notes}
          onChangeText={(value) => set('notes', value)}
          placeholder="Anything worth remembering"
          accessibilityLabel="Notes"
          multiline
          maxLength={MAX_NOTES_LENGTH}
        />
      </FormField>

      <FormField label="Ingredients (optional)">
        <ThemedTextInput
          value={state.ingredientsText}
          onChangeText={(value) => set('ingredientsText', value)}
          placeholder="e.g. wheat, milk, sunflower oil"
          accessibilityLabel="Ingredients"
          multiline
        />
      </FormField>

      <ThemedText type="smallBold" style={styles.sectionHeading}>
        Nutrition (optional)
      </ThemedText>
      <FormField label="Serving size (g)" hint={state.nutritionBase ? 'Editing rescales all values' : undefined}>
        <ThemedTextInput
          value={state.servingG}
          onChangeText={handleServingChange}
          placeholder="e.g. 150"
          accessibilityLabel="Serving size in grams"
          keyboardType="numeric"
          inputMode="decimal"
        />
      </FormField>
      <View style={styles.nutritionGrid}>
        {NUTRITION_FIELDS.map((field) => (
          <View key={field} style={styles.nutritionCell}>
            <FormField label={NUTRITION_LABELS[field]} error={errors.nutrition[field]}>
              <ThemedTextInput
                value={state.nutrition[field]}
                onChangeText={(value) => setNutrition(field, value)}
                placeholder="0"
                accessibilityLabel={NUTRITION_LABELS[field]}
                keyboardType="numeric"
                inputMode="decimal"
              />
            </FormField>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={submitLabel}
        accessibilityState={{ disabled: submitting }}
        disabled={submitting}
        onPress={handleSubmit}
        style={[styles.submit, { backgroundColor: theme.text, opacity: submitting ? 0.5 : 1 }]}>
        <ThemedText style={[styles.submitLabel, { color: theme.background }]}>
          {submitting ? 'Saving…' : submitLabel}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.four,
  },
  sectionHeading: {
    marginBottom: -Spacing.two,
  },
  nutritionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  nutritionCell: {
    flexGrow: 1,
    flexBasis: '45%',
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
