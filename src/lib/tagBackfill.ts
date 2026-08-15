// Pure historical tag re-derive backfill (HANDOFF.md Phase 2). Entries saved
// before the 2026-08-15 ingredient-capture hardening lack parenthetical
// sub-ingredient tags (the old extractTags deleted "(...)" content). This
// re-derives tags for stored rows as an additive-only union: existing tags are
// never removed or reordered, new ones are appended — the same policy as the
// Phase-3 merge in formModel.ts's buildLogEntry (see its comment). No React,
// no I/O — src/db/tagBackfillRunner.ts drives this against the real DB.

import { FOOD_TYPES, type LogEntry, type MealComponent } from '@/db/schema';
import { extractTags, mergeTags, parseTagsJson, serializeTags } from '@/lib/ingredients';

/**
 * Re-derives one row's tags from its own ingredient text. Returns the new
 * serialized tags when the additive union grew (new tags recovered), or null
 * when there's nothing to update — since mergeTags is order-preserving and
 * additive, "grew" is simply the merged length exceeding the existing length.
 */
export function rederiveRowTags(tagsJson: string | null, ingredientsText: string | null): string | null {
  const existing = parseTagsJson(tagsJson);
  const extracted = extractTags({ ingredientsText, allergensTags: null, additivesTags: null });
  const merged = mergeTags(existing, extracted);
  return merged.length > existing.length ? serializeTags(merged) : null;
}

export type TagBackfillRowUpdate = { id: string; tagsJson: string };

export type TagBackfillPlan = {
  entryUpdates: TagBackfillRowUpdate[];
  componentUpdates: TagBackfillRowUpdate[];
};

/**
 * Plans an additive-only tag re-derive across food-type log entries and their
 * meal components. For each food-type entry (bm/symptom rows are skipped):
 *  1. Each of its component rows re-derives from its own ingredientsText.
 *  2. The entry re-derives from its own ingredientsText, then unions in every
 *     tag of its (post-re-derive) component rows — so a multi-component
 *     parent saved before hardening gains any newly recovered sub-ingredient
 *     tags, and stays a superset of its components' tags (the collation
 *     invariant enforced elsewhere for freshly-saved meals).
 *  3. Rows whose union didn't grow produce no update — running the plan again
 *     over the updated rows yields zero updates (idempotent).
 */
export function planTagBackfill(
  entries: readonly LogEntry[],
  componentsByEntryId: ReadonlyMap<string, readonly MealComponent[]>,
): TagBackfillPlan {
  const entryUpdates: TagBackfillRowUpdate[] = [];
  const componentUpdates: TagBackfillRowUpdate[] = [];

  const foodEntries = entries.filter((e) => (FOOD_TYPES as readonly string[]).includes(e.type));

  for (const entry of foodEntries) {
    const existingEntryTags = parseTagsJson(entry.tagsJson);
    const ownExtracted = extractTags({
      ingredientsText: entry.ingredientsText,
      allergensTags: null,
      additivesTags: null,
    });
    const afterOwn = mergeTags(existingEntryTags, ownExtracted);

    const components = componentsByEntryId.get(entry.id) ?? [];
    const componentTagSets: string[][] = [];
    for (const component of components) {
      const componentExisting = parseTagsJson(component.tagsJson);
      const componentExtracted = extractTags({
        ingredientsText: component.ingredientsText,
        allergensTags: null,
        additivesTags: null,
      });
      const componentMerged = mergeTags(componentExisting, componentExtracted);
      if (componentMerged.length > componentExisting.length) {
        componentUpdates.push({ id: component.id, tagsJson: serializeTags(componentMerged) });
      }
      componentTagSets.push(componentMerged);
    }

    const finalEntryTags = mergeTags(afterOwn, ...componentTagSets);
    if (finalEntryTags.length > existingEntryTags.length) {
      entryUpdates.push({ id: entry.id, tagsJson: serializeTags(finalEntryTags) });
    }
  }

  return { entryUpdates, componentUpdates };
}
