import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FormField, ThemedTextInput } from '@/components/form-fields';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { MealComponentDraft } from '@/lib/mealAggregate';
import { NUTRITION_LABELS, scaleNutrition } from '@/lib/nutrition';
import { NUTRITION_FIELDS, type NutritionField } from '@/lib/validation';
import {
  buildComponentDraft,
  defaultComponentFormState,
  type ComponentFormErrors,
  type ComponentFormState,
} from './componentFormModel';

export interface ComponentFormProps {
  initial?: Partial<ComponentFormState>;
  /** Index this component will occupy — stamped as sortOrder on the built draft. */
  sortOrder: number;
  onSubmit: (draft: MealComponentDraft) => void | Promise<void>;
  submitLabel: string;
  /** Optional second action (e.g. "Finish meal") validated identically to the primary one. */
  secondaryLabel?: string;
  onSecondarySubmit?: (draft: MealComponentDraft) => void | Promise<void>;
}

/**
 * The component-editable subset of the full log entry form: name, servings
 * multiplier, serving size, nutrition grid, ingredients. No date/sentiment/type —
 * those are meal-level fields collected once on the review screen (HANDOFF 2.3).
 * Supports a primary + optional secondary save action ("Add & scan next" /
 * "Finish meal") that both validate and build the draft the same way.
 */
export function ComponentForm({
  initial,
  sortOrder,
  onSubmit,
  submitLabel,
  secondaryLabel,
  onSecondarySubmit,
}: ComponentFormProps) {
  const theme = useTheme();
  const [state, setState] = useState<ComponentFormState>(() => defaultComponentFormState(initial));
  const [errors, setErrors] = useState<ComponentFormErrors>({ nutrition: {} });

  const set = useMemo(
    () =>
      <K extends keyof ComponentFormState>(key: K, value: ComponentFormState[K]) =>
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

  async function handleSubmit(action: (draft: MealComponentDraft) => void | Promise<void>) {
    const result = buildComponentDraft(state, sortOrder);
    setErrors(result.errors);
    if (result.valid && result.draft) {
      await action(result.draft);
    }
  }

  return (
    <View style={styles.form}>
      <FormField label="Name" error={errors.name}>
        <ThemedTextInput
          value={state.name}
          onChangeText={(value) => set('name', value)}
          placeholder="e.g. Canned peas"
          accessibilityLabel="Component name"
          returnKeyType="next"
        />
      </FormField>

      <FormField label="Servings" error={errors.servings} hint="How much of this did you actually eat?">
        <ThemedTextInput
          value={state.servings}
          onChangeText={(value) => set('servings', value)}
          placeholder="1"
          accessibilityLabel="Servings"
          keyboardType="numeric"
          inputMode="decimal"
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
        Nutrition (optional, per serving)
      </ThemedText>
      <FormField
        label="Serving size (g)"
        hint={state.nutritionBase ? 'Editing rescales all values' : undefined}>
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

      <View style={styles.actions}>
        {secondaryLabel && onSecondarySubmit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={secondaryLabel}
            onPress={() => handleSubmit(onSecondarySubmit)}
            style={[styles.button, styles.secondaryButton, { borderColor: theme.text }]}>
            <ThemedText style={styles.secondaryLabel}>{secondaryLabel}</ThemedText>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
          onPress={() => handleSubmit(onSubmit)}
          style={[styles.button, { backgroundColor: theme.text }]}>
          <ThemedText style={[styles.submitLabel, { color: theme.background }]}>{submitLabel}</ThemedText>
        </Pressable>
      </View>
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
  actions: {
    gap: Spacing.two,
  },
  button: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
  },
  submitLabel: {
    fontSize: 16,
    fontWeight: 600,
  },
  secondaryLabel: {
    fontSize: 16,
    fontWeight: 600,
  },
});
