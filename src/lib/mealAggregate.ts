// Pure aggregation logic for the meal builder (HANDOFF.md Phase 2.2). No React, no
// I/O — the multi-scan meal flow reduces N component drafts down to the single
// aggregate `logEntry` row (nutrition sums + tag union) that every other screen,
// backup, and analyzer already knows how to consume.

import type { MealComponent, NewMealComponent } from '@/db/schema';
import { normalizeTag, parseTagsJson } from '@/lib/ingredients';
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

/** Re-export so callers building the review screen don't need a second import for saved rows. */
export type { MealComponent };
