// Thin repository over Drizzle for log entries. Keeps DB access in one place so
// screens/components stay free of query details. Pure validation/shaping lives in
// lib/ and features/logging/formModel; this module just persists.
import { asc, desc, eq, inArray } from 'drizzle-orm';

import { createId } from '@/lib/id';
import { aggregateComponents, unionComponentTags, type MealComponentDraft } from '@/lib/mealAggregate';
import { serializeTags } from '@/lib/ingredients';
import { db } from './client';
import {
  FOOD_TYPES,
  logEntry,
  mealComponent,
  type LogEntry,
  type MealComponent,
  type NewLogEntry,
  type NewMealComponent,
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
  const ingredientsText = components.map((c) => c.name).join(', ');

  const row: NewLogEntry = {
    ...entry,
    ...aggregate,
    id: createId(),
    componentCount: components.length,
    ingredientsText: ingredientsText.length > 0 ? ingredientsText : null,
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
