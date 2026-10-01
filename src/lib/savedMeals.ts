// Pure helpers for saved meals / "My meals" (GitHub #25). No React, no I/O.
// A saved meal is a template: it never is, or links to, a log entry.

import { FOOD_TYPES, type LogEntry, type SavedMeal, type SavedMealComponent } from '@/db/schema';
import { mergeTags, normalizeTag, parseTagsJson } from '@/lib/ingredients';
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
 * trimmed, lowercased name equals `nameKey` AND that carry no ingredient
 * information — every tag they have is just a name: the entry's own or one
 * of its items' (`componentNamesByEntry`, keyed by entry id). That is what a
 * name-only meal looks like, because `createMealWithComponents` always adds
 * each item's name to the tag union (review 2026-09-30: requiring "no tags at
 * all" matched only pre-builder rows). An entry with any other tag is never a
 * target.
 */
export function backfillTargets(
  entries: readonly LogEntry[],
  nameKey: string,
  componentNamesByEntry: ReadonlyMap<string, readonly string[]> = new Map(),
): LogEntry[] {
  const food = FOOD_TYPES as readonly string[];
  return entries.filter((entry) => {
    if (!food.includes(entry.type) || savedMealNameKey(entry.name) !== nameKey) return false;
    const nameTags = new Set([entry.name, ...(componentNamesByEntry.get(entry.id) ?? [])].map(normalizeTag));
    return parseTagsJson(entry.tagsJson).every((tag) => nameTags.has(tag));
  });
}

/**
 * The tags a template's items carry from their ingredients (barcode data or
 * typed ingredient text) — NOT their names. Empty means the template has no
 * ingredient information, so the backfill has nothing to offer.
 */
export function ingredientTagsOf(components: readonly Pick<MealComponentDraft, 'tagsJson'>[]): string[] {
  return mergeTags(...components.map((component) => parseTagsJson(component.tagsJson)));
}

/** A stable, test-friendly id fragment for a saved meal's row ("Chicken Rice" -> "chicken-rice"). */
export function savedMealSlug(name: string): string {
  return (name.trim() || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/** Error string for an unusable saved-meal name, or null when it's fine. */
export function validateSavedMealName(name: string): string | null {
  return name.trim().length === 0 ? 'Name is required.' : null;
}

/** A saved meal with its items. */
export interface SavedMealWithComponents {
  meal: SavedMeal;
  components: SavedMealComponent[];
}

/** Pairs saved meals with their components and sorts A-Z (by nameKey, then name). Shared with the live hook. */
export function groupSavedMeals(
  meals: readonly SavedMeal[],
  components: readonly SavedMealComponent[],
): SavedMealWithComponents[] {
  const byMeal = new Map<string, SavedMealComponent[]>();
  for (const component of components) {
    const list = byMeal.get(component.savedMealId);
    if (list) list.push(component);
    else byMeal.set(component.savedMealId, [component]);
  }
  return [...meals]
    .sort((a, b) => a.nameKey.localeCompare(b.nameKey) || a.name.localeCompare(b.name))
    .map((meal) => ({
      meal,
      components: [...(byMeal.get(meal.id) ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    }));
}
