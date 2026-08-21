// Thin repository over Drizzle for log entries. Keeps DB access in one place so
// screens/components stay free of query details. Pure validation/shaping lives in
// lib/ and features/logging/formModel; this module just persists.
import { asc, desc, eq, inArray } from 'drizzle-orm';

import { createId } from '@/lib/id';
import {
  aggregateComponents,
  mealIngredientsText,
  reaggregateEntryPatch,
  unionComponentTags,
  type MealComponentDraft,
} from '@/lib/mealAggregate';
import { serializeTags } from '@/lib/ingredients';
import type { TagBackfillRowUpdate } from '@/lib/tagBackfill';
import type { NutritionField } from '@/lib/validation';
import { db } from './client';
import {
  FOOD_TYPES,
  goal,
  logEntry,
  mealComponent,
  watchlistItem,
  type Goal,
  type GoalDirection,
  type LogEntry,
  type MealComponent,
  type NewLogEntry,
  type NewMealComponent,
  type WatchlistItem,
} from './schema';

/** Fields a caller supplies on create — id and timestamps are filled in here. */
export type CreateLogEntryInput = Omit<NewLogEntry, 'id' | 'createdAt' | 'updatedAt'>;

/** Fields a caller may patch. id/createdAt are immutable; updatedAt is managed here. */
export type UpdateLogEntryInput = Partial<Omit<NewLogEntry, 'id' | 'createdAt' | 'updatedAt'>>;

export async function createLogEntry(input: CreateLogEntryInput): Promise<LogEntry> {
  const now = Date.now();
  const row: NewLogEntry = {
    ...input,
    id: createId(),
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(logEntry).values(row);
  return row as LogEntry;
}

/**
 * Persists a multi-scan grouped meal (HANDOFF Phase 2.4): one logEntry row whose
 * nutrition columns hold the aggregate (sum of value × servings across
 * components) and whose tagsJson holds the union of component tags, plus one
 * mealComponent row per component (sortOrder = array index). Single transaction
 * so a partial write never leaves an entry without its components or vice versa.
 */
export async function createMealWithComponents(
  entry: CreateLogEntryInput,
  components: readonly MealComponentDraft[],
): Promise<LogEntry> {
  const now = Date.now();
  const aggregate = aggregateComponents(components);
  const tags = unionComponentTags(components);
  const ingredientsText = mealIngredientsText(components);

  const row: NewLogEntry = {
    ...entry,
    ...aggregate,
    id: createId(),
    componentCount: components.length,
    ingredientsText,
    tagsJson: tags.length > 0 ? serializeTags(tags) : null,
    createdAt: now,
    updatedAt: now,
  };

  const componentRows: NewMealComponent[] = components.map((component, index) => ({
    ...component,
    id: createId(),
    entryId: row.id,
    sortOrder: index,
    createdAt: now,
  }));

  await db.transaction(async (tx) => {
    await tx.insert(logEntry).values(row);
    if (componentRows.length > 0) {
      await tx.insert(mealComponent).values(componentRows);
    }
  });

  return row as LogEntry;
}

/** Components of a grouped meal, ordered as the user built them. */
export async function getMealComponents(entryId: string): Promise<MealComponent[]> {
  return db
    .select()
    .from(mealComponent)
    .where(eq(mealComponent.entryId, entryId))
    .orderBy(asc(mealComponent.sortOrder));
}

export async function getMealComponent(id: string): Promise<MealComponent | undefined> {
  const rows = await db.select().from(mealComponent).where(eq(mealComponent.id, id)).limit(1);
  return rows[0];
}

/**
 * Edit-after-save for a single meal component (HANDOFF.md meal-component
 * drill-down). One transaction: update the component row from the draft
 * (caller stamps the row's own `sortOrder` into the draft, so this never
 * reorders it; `id`/`entryId`/`createdAt` are untouched since the draft omits
 * them), re-read all of the entry's components post-update, then patch the
 * parent entry with a fresh nutrition aggregate + additive tag merge
 * (`reaggregateEntryPatch`) so totals/tags stay consistent with what's
 * actually saved. No-ops if the component or its parent entry can't be found.
 */
export async function updateMealComponentAndReaggregate(
  componentId: string,
  draft: MealComponentDraft,
): Promise<void> {
  await db.transaction(async (tx) => {
    const existingRows = await tx
      .select()
      .from(mealComponent)
      .where(eq(mealComponent.id, componentId))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) return;

    await tx.update(mealComponent).set(draft).where(eq(mealComponent.id, componentId));

    const siblings = await tx
      .select()
      .from(mealComponent)
      .where(eq(mealComponent.entryId, existing.entryId))
      .orderBy(asc(mealComponent.sortOrder));

    const entryRows = await tx.select().from(logEntry).where(eq(logEntry.id, existing.entryId)).limit(1);
    const entry = entryRows[0];
    if (!entry) return;

    const patch = reaggregateEntryPatch(siblings, entry.tagsJson);
    await tx
      .update(logEntry)
      .set({ ...patch.nutrition, tagsJson: patch.tagsJson, updatedAt: Date.now() })
      .where(eq(logEntry.id, existing.entryId));
  });
}

/** All mealComponent rows — used by the backup export (src/lib/backup.ts). */
export async function listAllMealComponents(): Promise<MealComponent[]> {
  return db.select().from(mealComponent).orderBy(asc(mealComponent.sortOrder));
}

/**
 * Inserts pre-built mealComponent rows verbatim (ids/entryId/createdAt already
 * set) — used by backup import, which only calls this for entries it actually
 * created (skipped/pre-existing entries keep whatever components they already
 * have, avoiding duplicate inserts on a repeated import).
 */
export async function insertMealComponents(rows: MealComponent[]): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(mealComponent).values(rows);
}

export async function getLogEntry(id: string): Promise<LogEntry | undefined> {
  const rows = await db.select().from(logEntry).where(eq(logEntry.id, id)).limit(1);
  return rows[0];
}

export async function listLogEntries(): Promise<LogEntry[]> {
  return db.select().from(logEntry).orderBy(desc(logEntry.loggedAt));
}

/**
 * Returns the most recent distinct-by-name food-type entries (newest first).
 * Used for the Home screen quick-add chips. Full rows are returned so the caller
 * can use `logEntryToFormState` to pre-fill a new entry with all prior nutrition.
 */
export async function listRecentFoodEntries(limit = 10): Promise<LogEntry[]> {
  const rows = await db
    .select()
    .from(logEntry)
    .where(inArray(logEntry.type, [...FOOD_TYPES]))
    .orderBy(desc(logEntry.loggedAt));

  const seen = new Set<string>();
  const result: LogEntry[] = [];
  for (const row of rows) {
    if (!seen.has(row.name) && result.length < limit) {
      seen.add(row.name);
      result.push(row);
    }
  }
  return result;
}

export async function updateLogEntry(id: string, patch: UpdateLogEntryInput): Promise<void> {
  await db
    .update(logEntry)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(logEntry.id, id));
}

/**
 * Applies a historical tag re-derive backfill plan (src/lib/tagBackfill.ts) —
 * one transaction, patching only `tagsJson` per row by id. Deliberately does
 * NOT bump `updatedAt`: this repairs derived data, not a user edit, and
 * bumping would falsify the edit history. That's why this doesn't reuse
 * `updateLogEntry`, which always stamps `updatedAt`.
 */
export async function applyTagBackfill(
  entryUpdates: readonly TagBackfillRowUpdate[],
  componentUpdates: readonly TagBackfillRowUpdate[],
): Promise<void> {
  if (entryUpdates.length === 0 && componentUpdates.length === 0) return;

  await db.transaction(async (tx) => {
    for (const update of entryUpdates) {
      await tx.update(logEntry).set({ tagsJson: update.tagsJson }).where(eq(logEntry.id, update.id));
    }
    for (const update of componentUpdates) {
      await tx.update(mealComponent).set({ tagsJson: update.tagsJson }).where(eq(mealComponent.id, update.id));
    }
  });
}

/**
 * Deletes an entry and, when it's a grouped meal, its mealComponent children.
 * There's no FK cascade (schema has no FK constraints today), so component
 * cleanup is manual — kept in the same transaction as the entry delete.
 */
export async function deleteLogEntry(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(mealComponent).where(eq(mealComponent.entryId, id));
    await tx.delete(logEntry).where(eq(logEntry.id, id));
  });
}

/** Watched trigger-ingredient terms, oldest-watched first. */
export async function listWatchlistItems(): Promise<WatchlistItem[]> {
  return db.select().from(watchlistItem).orderBy(asc(watchlistItem.createdAt));
}

/**
 * Adds a term to the watchlist; `createdAt` doubles as the elimination start
 * date. Caller passes an already-normalized term (src/lib/watchlist.ts
 * `normalizeWatchTerm`) — this only persists it.
 */
export async function addWatchlistItem(term: string): Promise<WatchlistItem> {
  const row: WatchlistItem = {
    id: createId(),
    term,
    createdAt: Date.now(),
  };
  await db.insert(watchlistItem).values(row);
  return row;
}

export async function removeWatchlistItem(id: string): Promise<void> {
  await db.delete(watchlistItem).where(eq(watchlistItem.id, id));
}

/** All nutrient threshold goals, alphabetical by nutrient. */
export async function listGoals(): Promise<Goal[]> {
  return db.select().from(goal).orderBy(asc(goal.nutrient));
}

/**
 * Insert-or-replace on the nutrient key (at most one goal per nutrient, design
 * contract). Keeps the original `createdAt` on replace — a select-first read is
 * already required to know whether this is an insert or a replace, so reusing
 * that row's `createdAt` is free; it also means "when this goal was first set"
 * survives a threshold/direction edit instead of resetting.
 */
export async function upsertGoal(
  nutrient: NutritionField,
  direction: GoalDirection,
  threshold: number,
): Promise<Goal> {
  const existing = await db.select().from(goal).where(eq(goal.nutrient, nutrient)).limit(1);
  const row: Goal = {
    id: existing[0]?.id ?? createId(),
    nutrient,
    direction,
    threshold,
    createdAt: existing[0]?.createdAt ?? Date.now(),
  };
  if (existing[0]) {
    await db
      .update(goal)
      .set({ direction, threshold })
      .where(eq(goal.nutrient, nutrient));
  } else {
    await db.insert(goal).values(row);
  }
  return row;
}

export async function removeGoal(nutrient: NutritionField): Promise<void> {
  await db.delete(goal).where(eq(goal.nutrient, nutrient));
}
