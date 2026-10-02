import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { FormScrollView } from '@/components/keyboard-aware-screen';
import { ThemedText } from '@/components/themed-text';
import { ComponentForm, COMPONENT_FORM_BOTTOM_OFFSET } from '@/features/logging/ComponentForm';
import { mealComponentToFormState } from '@/features/logging/componentFormModel';
import { useComponentPrefillStore } from '@/features/logging/componentPrefillStore';
import { useMealBuilderStore } from '@/features/logging/mealBuilderStore';
import type { MealComponentDraft } from '@/lib/mealAggregate';

/**
 * Component confirm step of the multi-scan meal builder (HANDOFF Phase 2.3).
 * Lands here after every scan (or the manual-entry escape hatch). Two save
 * actions push the draft into the builder store; "Add & scan next" loops back
 * to the camera, "Finish meal" moves on to the aggregate review screen. A
 * one-component meal that only ever hits "Finish meal" degenerates to the old
 * single-item flow.
 *
 * With an `edit` param (the item's index in the builder) the same form edits that
 * item in place instead (GitHub #25, per-item edit from the review screen):
 * prefilled from the draft, a single "Save item" action that replaces it and
 * returns to the review screen.
 */
export default function MealComponentScreen() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const [prefill] = useState(() => useComponentPrefillStore.getState().prefill);
  const clearPrefill = useComponentPrefillStore((state) => state.clearPrefill);
  const addComponent = useMealBuilderStore((state) => state.addComponent);
  const updateComponent = useMealBuilderStore((state) => state.updateComponent);
  const componentCount = useMealBuilderStore((state) => state.components.length);
  // The item being edited, frozen at mount (like `prefill`) so the form's
  // initial state never shifts under the user. Anything that isn't a valid
  // index falls back to the normal add flow.
  const [editing] = useState(() => {
    const index = edit === undefined ? NaN : Number(edit);
    const components = useMealBuilderStore.getState().components;
    return Number.isInteger(index) && index >= 0 && index < components.length
      ? { index, draft: components[index] }
      : null;
  });

  // Consume the prefill once so a later scan in this session starts blank.
  useEffect(() => () => clearPrefill(), [clearPrefill]);

  function handleAddAndScanNext(draft: MealComponentDraft) {
    addComponent(draft);
    router.replace('/scan');
  }

  function handleFinishMeal(draft: MealComponentDraft) {
    addComponent(draft);
    // If a review screen is already in the stack (the Add-item path, HANDOFF
    // §1.5) this pops back to that mounted instance so in-progress name/slot/
    // notes edits survive; otherwise (normal Home → Scan path) it behaves like
    // `replace` — no review screen to pop to.
    router.dismissTo('/meal/review');
  }

  function handleSaveItem(draft: MealComponentDraft) {
    if (!editing) return;
    updateComponent(editing.index, { ...draft, sortOrder: editing.draft.sortOrder });
    router.back();
  }

  if (editing) {
    return (
      <FormScrollView bottomOffset={COMPONENT_FORM_BOTTOM_OFFSET}>
        <ThemedText type="small" themeColor="textSecondary">
          Edit this item, then save it back to the meal.
        </ThemedText>

        <ComponentForm
          initial={mealComponentToFormState(editing.draft)}
          sortOrder={editing.draft.sortOrder ?? editing.index}
          submitLabel="Save item"
          onSubmit={handleSaveItem}
        />
      </FormScrollView>
    );
  }

  return (
    <FormScrollView bottomOffset={COMPONENT_FORM_BOTTOM_OFFSET}>
      <ThemedText type="small" themeColor="textSecondary">
        {componentCount > 0
          ? `${componentCount} item${componentCount === 1 ? '' : 's'} added so far`
          : 'Confirm this item, then add more or finish the meal.'}
      </ThemedText>

      <ComponentForm
        initial={prefill ?? undefined}
        sortOrder={componentCount}
        submitLabel="Add & scan next"
        onSubmit={handleAddAndScanNext}
        secondaryLabel="Finish meal"
        onSecondarySubmit={handleFinishMeal}
      />
    </FormScrollView>
  );
}
