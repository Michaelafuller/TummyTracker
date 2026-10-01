// Pure helpers for saved meals / "My meals" (GitHub #25). No React, no I/O.
// A saved meal is a template: it never is, or links to, a log entry.

import { FOOD_TYPES, type LogEntry, type SavedMealComponent } from '@/db/schema';
import { parseTagsJson } from '@/lib/ingredients';
import type { MealComponentDraft } from '@/lib/mealAggregate';

/** Case/whitespace-insensitive identity of a saved meal's name (unique per template). */
export function savedMealNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * A saved meal's items as builder drafts — sorted by `sortOrder`, with the
 * row bookkeeping (`id`, `savedMealId`, `createdAt`) dropped and `sortOrder`
 * renumbered to the array index. A copy, never a link: the builder owns its
 * drafts from here.
 */
export function savedMealToDrafts(components: readonly SavedMealComponent[]): MealComponentDraft[] {
  return [...components]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(
      (component, index): MealComponentDraft => ({
        name: component.name,
        barcode: component.barcode,
        servings: component.servings,
        servingG: component.servingG,
        calories: component.calories,
        fatG: component.fatG,
        saturatedFatG: component.saturatedFatG,
        carbsG: component.carbsG,
        proteinG: component.proteinG,
        fiberG: component.fiberG,
        sugarG: component.sugarG,
        sodiumMg: component.sodiumMg,
        ingredientsText: component.ingredientsText,
        tagsJson: component.tagsJson,
        sortOrder: index,
      }),
    );
}

/**
 * The past entries the opt-in "add ingredients to past meals" backfill may
 * touch: food entries (meal/snack — never a bowel movement or symptom) whose
 * trimmed, lowercased name equals `nameKey` AND that carry no tags at all.
 * An entry with any tag is never a target — the backfill is additive for
 * entries that have nothing, never a merge into existing tags.
 */
export function backfillTargets(entries: readonly LogEntry[], nameKey: string): LogEntry[] {
  const food = FOOD_TYPES as readonly string[];
  return entries.filter(
    (entry) =>
      food.includes(entry.type) &&
      savedMealNameKey(entry.name) === nameKey &&
      parseTagsJson(entry.tagsJson).length === 0,
  );
}

/** Error string for an unusable saved-meal name, or null when it's fine. */
export function validateSavedMealName(name: string): string | null {
  return name.trim().length === 0 ? 'Name is required.' : null;
}
