import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { DateTimeField } from '@/components/date-time-field';
import { FormField, ThemedTextInput } from '@/components/form-fields';
import { FormScrollView } from '@/components/keyboard-aware-screen';
import { PrimaryButton } from '@/components/primary-button';
import { SegmentedControl } from '@/components/segmented-control';
import { ServingsStepper } from '@/components/servings-stepper';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { FOOD_TYPES, MEAL_SLOTS, type MealSlot } from '@/db/schema';
import {
  backfillSavedMealTags,
  createMealWithComponents,
  deleteSavedMeal,
  findSavedMealByNameKey,
  saveSavedMeal,
} from '@/db/repository';
import { refreshCheckInIfEnabled } from '@/features/goals/checkInService';
import { useGoalsStore } from '@/features/goals/goalsStore';
import { useMealBuilderStore } from '@/features/logging/mealBuilderStore';
import {
  buildMealEntry,
  defaultMealReviewState,
  syncAutoMealName,
  type MealReviewErrors,
  type MealReviewFormState,
} from '@/features/logging/mealReviewFormModel';
import { useAllEntries } from '@/features/logging/useEntries';
import { useWatchlistStore } from '@/features/watchlist/watchlistStore';
import { useTheme } from '@/hooks/use-theme';
import { tallyDailyNutrition } from '@/lib/dailyTally';
import { dayBounds } from '@/lib/datetime';
import { evaluateGoals, exceededCaps, withPendingNutrition, type GoalEvaluation } from '@/lib/goals';
import { aggregateComponents, mealIngredientsText, unionComponentTags } from '@/lib/mealAggregate';
import { NUTRITION_NOUNS, nutritionUnit } from '@/lib/nutrition';
import { backfillTargets, savedMealNameKey, validateSavedMealName } from '@/lib/savedMeals';
import { MAX_NOTES_LENGTH } from '@/lib/validation';
import { describeWatchedMatches, findWatchedTagsInTags } from '@/lib/watchlist';

/** "Saving puts fat at 24g — over your 20g cap." */
function capNoticeLine(evaluation: GoalEvaluation): string {
  const unit = nutritionUnit(evaluation.goal.nutrient);
  const amount = (value: number) => (unit.length > 0 ? `${value}${unit}` : String(value));
  const noun = NUTRITION_NOUNS[evaluation.goal.nutrient];
  return `Saving puts ${noun} at ${amount(evaluation.total)} — over your ${amount(evaluation.goal.threshold)} cap`;
}

/** Alert as a promise: true when the confirm button is chosen, false for Cancel / dismiss. */
function confirmAsync(
  title: string,
  message: string,
  confirmLabel: string,
  options: { cancelLabel?: string; destructive?: boolean } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: options.cancelLabel ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: options.destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

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
 *
 * Two modes (GitHub #25), told apart by the builder store's `editingSavedMealId`:
 * - LOGGING (null, the default): the screen above, plus "Save as my meal" which
 *   stores the items/name/type/slot as a My meals template (never date/notes).
 * - TEMPLATE (a saved meal's id): edits that template. No date/time, notes or goal
 *   cap notice; "Save changes" / "Delete my meal" act on the template only.
 * Neither mode ever changes a past meal, except the opt-in backfill the user
 * confirms after saving a template.
 */
export default function MealReviewScreen() {
  const theme = useTheme();
  const router = useRouter();
  const components = useMealBuilderStore((state) => state.components);
  const updateComponent = useMealBuilderStore((state) => state.updateComponent);
  const removeComponent = useMealBuilderStore((state) => state.removeComponent);
  const clearBuilder = useMealBuilderStore((state) => state.clear);
  const editingSavedMealId = useMealBuilderStore((state) => state.editingSavedMealId);
  const isTemplateMode = editingSavedMealId !== null;

  const [state, setState] = useState<MealReviewFormState>(() => ({
    ...defaultMealReviewState(components),
    ...useMealBuilderStore.getState().reviewPrefill,
  }));
  const [errors, setErrors] = useState<MealReviewErrors>({});
  const [submitting, setSubmitting] = useState(false);
  // Logging mode: what was last stored via "Save as my meal", so the button can
  // read "Saved to My meals" until the name, type, slot or items change again.
  const [savedSignature, setSavedSignature] = useState<string | null>(null);

  // This screen stays mounted across "Add item" (meal/component.tsx returns via
  // router.dismissTo('/meal/review')), so keep the auto-generated name in sync
  // with the items as they change (HANDOFF.md #16 §2) — never overwriting a
  // name the user typed themselves.
  const previousComponentsRef = useRef(components);
  useEffect(() => {
    // Capture the previous value before the ref is overwritten below — the
    // setState updater runs later (React defers it), so mutating the ref
    // first would make `previous` and `next` the same array by the time the
    // updater actually reads it.
    const previousComponents = previousComponentsRef.current;
    setState((prev) => ({ ...prev, name: syncAutoMealName(prev.name, previousComponents, components) }));
    previousComponentsRef.current = components;
  }, [components]);

  const aggregate = useMemo(() => aggregateComponents(components), [components]);
  const noteCount = state.notes.length;

  // Same tag union createMealWithComponents will save to the entry's
  // tagsJson (HANDOFF Phase 4) — a non-blocking heads-up, never a save gate.
  const watchlistItems = useWatchlistStore((s) => s.items);
  const unionTags = useMemo(() => unionComponentTags(components), [components]);
  const watchedMatches = useMemo(
    () => findWatchedTagsInTags(unionTags, watchlistItems),
    [unionTags, watchlistItems],
  );

  // Save-time cap notice (design contract, HANDOFF.md): only a save can move
  // the total, so this previews what TODAY's tally would become if the
  // pending meal were saved right now — never blocks the save button.
  const [now] = useState(() => Date.now());
  const goals = useGoalsStore((s) => s.goals);
  const allEntries = useAllEntries();
  const exceededCapEvaluations = useMemo(() => {
    const { start, end } = dayBounds(now);
    const todayTally = tallyDailyNutrition(allEntries, start, end);
    return exceededCaps(evaluateGoals(goals, withPendingNutrition(todayTally, aggregate)));
  }, [allEntries, goals, aggregate, now]);

  const set = useMemo(
    () =>
      <K extends keyof MealReviewFormState>(key: K, value: MealReviewFormState[K]) =>
        setState((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const templateSignature = JSON.stringify([state.name.trim(), state.type, state.mealSlot, components]);
  const savedToMyMeals = savedSignature === templateSignature;

  /** The offer to add the template's ingredients to past, tag-less meals of the same name (explicit choice only). */
  async function offerBackfill(name: string, nameKey: string) {
    const tags = unionComponentTags(components);
    if (tags.length === 0) return;
    const count = backfillTargets(allEntries, nameKey).length;
    if (count === 0) return;
    const add = await confirmAsync(
      'Add ingredients to past meals?',
      `Add these ingredients to ${count} past '${name}' ${count === 1 ? 'meal' : 'meals'} that don't have any? This updates your Insights.`,
      'Add',
      { cancelLabel: 'Not now' },
    );
    if (!add) return;
    // The repository recomputes the targets itself; `updated` is the truth.
    const updated = await backfillSavedMealTags(nameKey, tags, mealIngredientsText(components));
    Alert.alert('Ingredients added', `Updated ${updated} past ${updated === 1 ? 'meal' : 'meals'}.`);
  }

  /**
   * Stores the builder as a My meals template (creating it, or editing the
   * open one in template mode). A name another template already holds asks to
   * Replace first. Returns true once saved.
   */
  async function persistTemplate(): Promise<boolean> {
    const nameError = validateSavedMealName(state.name);
    if (nameError) {
      setErrors({ name: nameError });
      return false;
    }
    setErrors({});
    const name = state.name.trim();
    const nameKey = savedMealNameKey(name);

    let replaceId: string | undefined;
    const clash = await findSavedMealByNameKey(nameKey);
    if (clash && clash.id !== editingSavedMealId) {
      const replace = await confirmAsync(
        `Replace '${name}' in My meals?`,
        'Its items will be replaced. Meals you already logged are not changed.',
        'Replace',
        { destructive: true },
      );
      if (!replace) return false;
      replaceId = clash.id;
    }

    await saveSavedMeal({
      id: editingSavedMealId ?? undefined,
      name,
      type: state.type === 'snack' ? 'snack' : 'meal',
      mealSlot: state.mealSlot,
      components,
      replaceId,
    });
    await offerBackfill(name, nameKey);
    return true;
  }

  async function handleSaveAsMyMeal() {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (await persistTemplate()) setSavedSignature(templateSignature);
    } catch {
      Alert.alert("Couldn't save to My meals", 'Something went wrong — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveChanges() {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (await persistTemplate()) {
        clearBuilder();
        router.back();
      }
    } catch {
      Alert.alert("Couldn't save your changes", 'Something went wrong — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteMyMeal() {
    if (submitting || editingSavedMealId === null) return;
    const id = editingSavedMealId;
    const confirmed = await confirmAsync(
      `Delete '${state.name.trim() || 'this meal'}'?`,
      'It will be removed from My meals. Meals you already logged are not changed.',
      'Delete',
      { destructive: true },
    );
    if (!confirmed) return;
    setSubmitting(true);
    try {
      await deleteSavedMeal(id);
      clearBuilder();
      router.back();
    } catch {
      Alert.alert("Couldn't delete this meal", 'Something went wrong — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSave() {
    const result = buildMealEntry(state, components);
    setErrors(result.errors);
    if (!result.valid || !result.entry) return;

    setSubmitting(true);
    try {
      await createMealWithComponents(result.entry, components);
      // Fire-and-forget: today's totals just changed, so re-arm the check-in
      // with fresh copy if it's enabled (design contract — never stale).
      void refreshCheckInIfEnabled();
      clearBuilder();
      router.dismissAll();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormScrollView>
      {isTemplateMode ? (
        <ThemedText type="subtitle" testID="review-template-heading">
          Edit my meal
        </ThemedText>
      ) : null}
      <ThemedText type="smallBold">In this meal</ThemedText>
      <View style={styles.componentList}>
        {components.map((component, index) => (
          <View
            key={`${component.name}-${index}`}
            testID={`component-${index}`}
            style={[styles.componentRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.componentBody}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${component.name}`}
                testID={`component-${index}-edit`}
                onPress={() => router.push({ pathname: '/meal/component', params: { edit: String(index) } })}>
                <ThemedText type="small" numberOfLines={1}>
                  {component.name}
                </ThemedText>
              </Pressable>
              {component.calories != null ? (
                <ThemedText type="small" themeColor="textSecondary" testID={`component-${index}-kcal`}>
                  {`${Math.round(component.calories * (component.servings ?? 1))} kcal`}
                </ThemedText>
              ) : null}
            </View>
            <ServingsStepper
              itemName={component.name}
              value={component.servings ?? 1}
              onChange={(servings) => updateComponent(index, { servings })}
              testID={`component-${index}-servings`}
            />
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

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add item to this meal"
        testID="review-add-item"
        onPress={() => router.push('/scan')}
        style={[styles.addItemButton, { borderColor: theme.border }]}>
        <ThemedText style={styles.addItemLabel}>Add item</ThemedText>
      </Pressable>

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

      {isTemplateMode ? null : (
        <>
          <DateTimeField
            dateInput={state.dateInput}
            timeInput={state.timeInput}
            onDateChange={(v) => set('dateInput', v)}
            onTimeChange={(v) => set('timeInput', v)}
            error={errors.loggedAt}
          />

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
        </>
      )}

      {watchedMatches.length > 0 ? (
        <View
          accessibilityRole="alert"
          accessibilityLabel={`This meal contains a watched ingredient: ${describeWatchedMatches(watchedMatches)}`}
          style={[styles.watchNotice, { backgroundColor: theme.backgroundSelected, borderColor: theme.danger }]}>
          <ThemedText type="smallBold" themeColor="danger">
            Contains a watched ingredient
          </ThemedText>
          <ThemedText type="small">{describeWatchedMatches(watchedMatches)}</ThemedText>
        </View>
      ) : null}

      {!isTemplateMode && exceededCapEvaluations.length > 0 ? (
        <View
          accessibilityRole="alert"
          accessibilityLabel={`Saving would exceed a goal cap: ${exceededCapEvaluations.map(capNoticeLine).join('; ')}`}
          style={[styles.watchNotice, { backgroundColor: theme.backgroundSelected, borderColor: theme.danger }]}>
          <ThemedText type="smallBold" themeColor="danger">
            This save goes over a goal
          </ThemedText>
          {exceededCapEvaluations.map((evaluation) => (
            <ThemedText key={evaluation.goal.id} type="small">
              {capNoticeLine(evaluation)}
            </ThemedText>
          ))}
        </View>
      ) : null}

      {isTemplateMode ? (
        <>
          <PrimaryButton
            label={submitting ? 'Saving…' : 'Save changes'}
            accessibilityLabel="Save changes"
            testID="review-save-changes"
            disabled={submitting || components.length === 0}
            onPress={handleSaveChanges}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete my meal"
            testID="review-delete-my-meal"
            disabled={submitting}
            onPress={handleDeleteMyMeal}
            style={styles.deleteButton}>
            <ThemedText type="link" themeColor="danger">
              Delete my meal
            </ThemedText>
          </Pressable>
        </>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save as my meal"
            testID="review-save-as-my-meal"
            accessibilityState={{ disabled: submitting || components.length === 0 || savedToMyMeals }}
            disabled={submitting || components.length === 0 || savedToMyMeals}
            onPress={handleSaveAsMyMeal}
            style={[
              styles.addItemButton,
              { borderColor: theme.border, opacity: components.length === 0 ? 0.5 : 1 },
            ]}>
            <ThemedText style={styles.addItemLabel}>{savedToMyMeals ? 'Saved to My meals' : 'Save as my meal'}</ThemedText>
          </Pressable>
          <PrimaryButton
            label={submitting ? 'Saving…' : 'Save meal'}
            accessibilityLabel="Save meal"
            disabled={submitting || components.length === 0}
            onPress={handleSave}
          />
        </>
      )}
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
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
  addItemButton: {
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two + Spacing.one,
    alignItems: 'center',
  },
  deleteButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  addItemLabel: {
    fontSize: 16,
    fontWeight: 600,
  },
  watchNotice: {
    gap: Spacing.half,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
