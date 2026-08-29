import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { FormScrollView } from '@/components/keyboard-aware-screen';
import { ThemedText } from '@/components/themed-text';
import { ComponentForm, COMPONENT_FORM_BOTTOM_OFFSET } from '@/features/logging/ComponentForm';
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
 */
export default function MealComponentScreen() {
  const router = useRouter();
  const [prefill] = useState(() => useComponentPrefillStore.getState().prefill);
  const clearPrefill = useComponentPrefillStore((state) => state.clearPrefill);
  const addComponent = useMealBuilderStore((state) => state.addComponent);
  const componentCount = useMealBuilderStore((state) => state.components.length);

  // Consume the prefill once so a later scan in this session starts blank.
  useEffect(() => () => clearPrefill(), [clearPrefill]);

  function handleAddAndScanNext(draft: MealComponentDraft) {
    addComponent(draft);
    router.replace('/scan');
  }

  function handleFinishMeal(draft: MealComponentDraft) {
    addComponent(draft);
    router.replace('/meal/review');
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
