import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { FormField, ThemedTextInput } from '@/components/form-fields';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useOffSearch } from '@/features/barcode/useOffSearch';
import { useTheme } from '@/hooks/use-theme';
import type { MealComponentDraft } from '@/lib/mealAggregate';
import { NUTRITION_LABELS, scaleNutrition } from '@/lib/nutrition';
import { offProductToComponentFormState, type OffProduct } from '@/lib/openFoodFacts';
import { NUTRITION_FIELDS, type NutritionField } from '@/lib/validation';
import {
  buildComponentDraft,
  defaultComponentFormState,
  type ComponentFormErrors,
  type ComponentFormState,
} from './componentFormModel';

const SEARCH_NOTICE_MS = 3000;

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

  // Search-by-name (HANDOFF Phase 2): fires on Name blur, never on keystroke.
  // committedQuery tracks the last text we actually searched for; showSearchUi
  // gates the whole UI on "the field still reads exactly what we searched" so
  // editing the name after seeing results hides the stale list automatically.
  const [committedQuery, setCommittedQuery] = useState<string | null>(null);
  const search = useOffSearch(committedQuery);
  const trimmedName = state.name.trim();
  const showSearchUi = committedQuery != null && trimmedName === committedQuery;

  function handleNameBlur() {
    if (state.barcode != null) return; // scanned item — never override barcode data
    if (trimmedName.length < 2 || trimmedName === committedQuery) return;
    setNoticeDismissed(false);
    setCommittedQuery(trimmedName);
  }

  function handleSelectSearchResult(product: OffProduct) {
    setState((prev) => ({ ...prev, ...offProductToComponentFormState(product) }));
    setCommittedQuery(null);
  }

  const searchMiss = showSearchUi && search.isSuccess && search.data.length === 0;
  const searchError = showSearchUi && search.isError;
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const noticeVisible = (searchMiss || searchError) && !noticeDismissed;

  // Auto-dismiss the notice after a few seconds; handleNameBlur resets
  // noticeDismissed to false whenever a new search starts.
  useEffect(() => {
    if (!searchMiss && !searchError) return;
    const timer = setTimeout(() => setNoticeDismissed(true), SEARCH_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [searchMiss, searchError, committedQuery]);

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
          onBlur={handleNameBlur}
          placeholder="e.g. Canned peas"
          accessibilityLabel="Component name"
          returnKeyType="next"
        />
      </FormField>

      {showSearchUi && search.isLoading ? (
        <View style={styles.searchStatusRow} accessibilityLabel="Looking up nutrition">
          <ActivityIndicator size="small" />
          <ThemedText type="small" themeColor="textSecondary">
            Looking up nutrition…
          </ThemedText>
        </View>
      ) : null}

      {showSearchUi && search.isSuccess && search.data.length > 0 ? (
        <View style={styles.searchResults}>
          {search.data.map((product, index) => {
            const secondary = [product.brand, product.nutrition.calories != null ? `${product.nutrition.calories} kcal` : null]
              .filter(Boolean)
              .join(' · ');
            return (
              <Pressable
                key={`${product.barcode ?? 'no-code'}-${index}`}
                testID={`off-search-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`Use ${product.name}${product.brand ? ` by ${product.brand}` : ''}`}
                onPress={() => handleSelectSearchResult(product)}
                style={[styles.searchRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <ThemedText type="small" numberOfLines={1}>
                  {product.name}
                </ThemedText>
                {secondary ? (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {secondary}
                  </ThemedText>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {noticeVisible ? (
        <ThemedText type="small" themeColor="textSecondary">
          {searchError
            ? "Couldn't reach Open Food Facts — you can still fill it in manually."
            : "Couldn't find nutrition for that — you can still fill it in manually."}
        </ThemedText>
      ) : null}

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
  searchStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: -Spacing.two,
  },
  searchResults: {
    gap: Spacing.two,
    marginTop: -Spacing.two,
  },
  searchRow: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
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
