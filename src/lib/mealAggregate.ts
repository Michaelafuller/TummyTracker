// Pure aggregation logic for the meal builder (HANDOFF.md Phase 2.2). No React, no
// I/O — the multi-scan meal flow reduces N component drafts down to the single
// aggregate `logEntry` row (nutrition sums + tag union) that every other screen,
// backup, and analyzer already knows how to consume.

import type { MealComponent, NewMealComponent } from '@/db/schema';
import { mergeTags, normalizeTag, parseTagsJson, serializeTags } from '@/lib/ingredients';
import type { NutritionValues } from '@/lib/nutrition';
import { NUTRITION_FIELDS } from '@/lib/validation';

/** A component row before it has an id/entryId/createdAt (pre-save, builder-store shape). */
export type MealComponentDraft = Omit<NewMealComponent, 'id' | 'entryId' | 'createdAt'>;

/** Anything with per-serving nutrition + a servings multiplier — drafts and saved rows alike. */
type ComponentLike = Pick<MealComponentDraft, 'servings'> & Partial<NutritionValues>;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Sum `value × servings` across components for each nutrition field. A field is
 * `null` only when EVERY component is missing it — we never fabricate a zero for
 * data we don't have. Present values are summed as if absent ones contributed 0.
 * Rounded to 1 decimal place.
 */
export function aggregateComponents(components: readonly ComponentLike[]): NutritionValues {
  const result = {} as Record<(typeof NUTRITION_FIELDS)[number], number | null>;

  for (const field of NUTRITION_FIELDS) {
    let sum = 0;
    let hasAny = false;
    for (const component of components) {
      const value = component[field];
      if (value == null) continue;
      hasAny = true;
      sum += value * (component.servings ?? 1);
    }
    result[field] = hasAny ? round1(sum) : null;
  }

  return result as NutritionValues;
}

/**
 * Union of every component's parsed tags plus each component's own normalized
 * name — so an ingredient-less component (e.g. manual entry with no OFF data)
 * still contributes something correlatable. Deduped, first-seen order preserved.
 */
export function unionComponentTags(
  components: readonly Pick<MealComponentDraft, 'name' | 'tagsJson'>[],
): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  const add = (tag: string) => {
    if (tag.length > 0 && !seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  };

  for (const component of components) {
    for (const tag of parseTagsJson(component.tagsJson)) add(tag);
    add(normalizeTag(component.name));
  }

  return tags;
}

/** First component's name alone, or "<first> + N more" for multiple. User-editable on review. */
export function defaultMealName(components: readonly Pick<MealComponentDraft, 'name'>[]): string {
  if (components.length === 0) return '';
  const [first, ...rest] = components;
  return rest.length === 0 ? first.name : `${first.name} + ${rest.length} more`;
}

/**
 * Display ingredient text for the aggregate meal row. A single-component meal
 * keeps its component's full ingredient list (parity with the old single-item
 * flow); a multi-component meal condenses to the component names — the full
 * per-item lists live on the mealComponent rows, and analysis reads tagsJson,
 * never this field.
 */
export function mealIngredientsText(
  components: readonly Pick<MealComponentDraft, 'name' | 'ingredientsText'>[],
): string | null {
  if (components.length === 0) return null;
  if (components.length === 1) {
    const only = components[0];
    return only.ingredientsText?.trim() ? only.ingredientsText : only.name;
  }
  const joined = components.map((c) => c.name).join(', ');
  return joined.length > 0 ? joined : null;
}

/**
 * Patch for the parent entry after one of its saved components changed
 * (post-save editing, HANDOFF.md meal-component drill-down). Nutrition is
 * recomputed FRESH from the current component set (never additive — an edit
 * that lowers a component's fat must lower the entry's total, not just add
 * the delta), while tags are merged additively with whatever the entry
 * already had: a component rename/edit must never strip a previously
 * captured tag from the entry (2026-08-15 ingredient-hardening tag policy).
 * Entry-level fields the user owns directly (name, ingredientsText, servingG,
 * barcode, sentiment, loggedAt, componentCount) are untouched — callers must
 * not derive them from this patch.
 */
export function reaggregateEntryPatch(
  components: readonly MealComponent[],
  existingEntryTagsJson: string | null,
): { nutrition: NutritionValues; tagsJson: string | null } {
  const nutrition = aggregateComponents(components);
  const tags = mergeTags(parseTagsJson(existingEntryTagsJson), unionComponentTags(components));
  return { nutrition, tagsJson: tags.length > 0 ? serializeTags(tags) : null };
}

/** Re-export so callers building the review screen don't need a second import for saved rows. */
export type { MealComponent };
