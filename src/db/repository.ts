// Thin repository over Drizzle for log entries. Keeps DB access in one place so
// screens/components stay free of query details. Pure validation/shaping lives in
// lib/ and features/logging/formModel; this module just persists.
import { asc, desc, eq, inArray } from 'drizzle-orm';

import { chunk } from '@/lib/array';
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
  dayCheckIn,
  FOOD_TYPES,
  goal,
  logEntry,
  mealComponent,
  medication,
  medicationDose,
  medicationEvent,
  watchlistItem,
  type DayCheckIn,
  type DayStatus,
  type Goal,
  type GoalDirection,
  type LogEntry,
  type MealComponent,
  type Medication,
  type MedicationDose,
  type MedicationEvent,
  type NewLogEntry,
  type NewMealComponent,
  type NewMedication,
  type NewMedicationDose,
  type NewMedicationEvent,
  type WatchlistItem,
} from './schema';

/** 'YYYY-MM-DD' shape check shared by every day-check-in write path (§4 of HANDOFF.md). */
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

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
 * Persists multiple logEntry rows in one transaction (HANDOFF multi-symptom
 * logging) — e.g. one new-symptom save fanning out to one row per selected
 * symptom type, all sharing loggedAt/severity/notes. Each input is stamped
 * with its own id + createdAt/updatedAt exactly as `createLogEntry` does.
 * Single transaction so a partial write never leaves some symptoms saved and
 * others missing.
 */
export async function createLogEntries(inputs: CreateLogEntryInput[]): Promise<LogEntry[]> {
  const now = Date.now();
  const rows: NewLogEntry[] = inputs.map((input) => ({
    ...input,
    id: createId(),
    createdAt: now,
    updatedAt: now,
  }));

  await db.transaction(async (tx) => {
    if (rows.length > 0) {
      await tx.insert(logEntry).values(rows);
    }
  });

  return rows as LogEntry[];
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

/**
 * Removes one saved meal component and re-aggregates its parent entry
 * (HANDOFF.md meal-component delete). One transaction: read the component
 * (`'missing'` if it can't be found — already deleted, nothing to do); read
 * its siblings and refuse to delete the entry's last remaining component
 * (`'last'`, no writes — a meal must keep at least one item; the user deletes
 * the whole entry instead). Otherwise delete the row, re-read the remaining
 * siblings, and patch the parent entry the same way
 * `updateMealComponentAndReaggregate` does: nutrition recomputed FRESH from
 * what's left (never additive), `componentCount` set to the new count,
 * `updatedAt` bumped. Tags are merged additively per the project's
 * additive-only tag policy (2026-08-15 ingredient-hardening) — a deleted
 * component's tags remain on the entry; there is no tag-subtraction path.
 * Entry `name`/`ingredientsText` are user-owned and untouched here. Note:
 * when the remaining count drops to 1, the entry screen's `componentCount >
 * 1` gate hides the "In this meal" list — the entry then behaves as a
 * single-item entry editable at entry level (deliberate; the single-component
 * wrinkle is a known follow-up, not fixed by this change).
 */
export async function deleteMealComponentAndReaggregate(
  componentId: string,
): Promise<'deleted' | 'last' | 'missing'> {
  let result: 'deleted' | 'last' | 'missing' = 'missing';

  await db.transaction(async (tx) => {
    const existingRows = await tx
      .select()
      .from(mealComponent)
      .where(eq(mealComponent.id, componentId))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) return;

    const siblings = await tx
      .select()
      .from(mealComponent)
      .where(eq(mealComponent.entryId, existing.entryId))
      .orderBy(asc(mealComponent.sortOrder));

    if (siblings.length <= 1) {
      result = 'last';
      return;
    }

    await tx.delete(mealComponent).where(eq(mealComponent.id, componentId));

    const remaining = siblings.filter((row) => row.id !== componentId);

    const entryRows = await tx.select().from(logEntry).where(eq(logEntry.id, existing.entryId)).limit(1);
    const entry = entryRows[0];
    if (!entry) {
      result = 'deleted';
      return;
    }

    const patch = reaggregateEntryPatch(remaining, entry.tagsJson);
    await tx
      .update(logEntry)
      .set({
        ...patch.nutrition,
        tagsJson: patch.tagsJson,
        componentCount: remaining.length,
        updatedAt: Date.now(),
      })
      .where(eq(logEntry.id, existing.entryId));

    result = 'deleted';
  });

  return result;
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
 * True once the journal has at least one log entry — gates the automatic
 * folder backup (never write an empty backup, HANDOFF.md §3, GitHub #14) and
 * the Home "back up now" nudge (never nudge before there's anything to back
 * up). `limit(1)` so this never scans the whole table.
 */
export async function hasAnyLogEntry(): Promise<boolean> {
  const rows = await db.select({ id: logEntry.id }).from(logEntry).limit(1);
  return rows.length > 0;
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

/**
 * Renames a watched term in place. `createdAt` is untouched — that IS the
 * point: it's the "watched since" anchor driving `timesSinceWatch`/`cleanDays`
 * (src/lib/watchlist.ts `computeWatchStats`), so a typo fix must not reset
 * watch history the way remove-then-re-add would. Caller passes an
 * already-normalized term (src/lib/watchlist.ts `normalizeWatchTerm`) — this
 * only persists it. The UNIQUE index on `term` makes a duplicate rename throw;
 * that propagates to the caller (the store layer decides how to handle it).
 */
export async function renameWatchlistItem(id: string, term: string): Promise<void> {
  await db.update(watchlistItem).set({ term }).where(eq(watchlistItem.id, id));
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

/** Fields a caller supplies on create — id and timestamps are filled in here. */
export type CreateMedicationInput = Omit<NewMedication, 'id' | 'createdAt' | 'updatedAt'>;

/** Fields a caller may patch. id/createdAt are immutable; updatedAt is managed here. */
export type UpdateMedicationInput = Partial<Omit<NewMedication, 'id' | 'createdAt' | 'updatedAt'>>;

/** Every medication, active first, then alphabetical by name (HANDOFF.md #5 list order). */
export async function listMedications(): Promise<Medication[]> {
  return db.select().from(medication).orderBy(desc(medication.isActive), asc(medication.name));
}

export async function getMedication(id: string): Promise<Medication | undefined> {
  const rows = await db.select().from(medication).where(eq(medication.id, id)).limit(1);
  return rows[0];
}

export async function createMedication(input: CreateMedicationInput): Promise<Medication> {
  const now = Date.now();
  const row: NewMedication = {
    ...input,
    id: createId(),
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(medication).values(row);
  return row as Medication;
}

/**
 * Patches a medication's own fields. Never touches `medication_dose` rows
 * (invariant, HANDOFF.md §0) — a dose snapshots its own dose/unit at log time,
 * so editing the medication here can never rewrite history.
 */
export async function updateMedication(id: string, patch: UpdateMedicationInput): Promise<void> {
  await db
    .update(medication)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(medication.id, id));
}

/**
 * Deactivate/reactivate only — there is no `deleteMedication` (invariant,
 * HANDOFF.md §0: a medication is never deleted).
 */
export async function setMedicationActive(id: string, isActive: boolean): Promise<void> {
  await db.update(medication).set({ isActive, updatedAt: Date.now() }).where(eq(medication.id, id));
}

/** All medication rows — used by the backup export (src/lib/backup.ts). */
export async function listAllMedications(): Promise<Medication[]> {
  return db.select().from(medication).orderBy(asc(medication.createdAt));
}

/** All medication_event rows — used by the backup export (Cycle B writes these). */
export async function listAllMedicationEvents(): Promise<MedicationEvent[]> {
  return db.select().from(medicationEvent).orderBy(asc(medicationEvent.createdAt));
}

/** All medication_dose rows — used by the backup export (Cycle B writes these). */
export async function listAllMedicationDoses(): Promise<MedicationDose[]> {
  return db.select().from(medicationDose).orderBy(asc(medicationDose.createdAt));
}

/**
 * Bound-variable-safe batch size for the id-preserving restore helpers below
 * (HANDOFF.md §2). SQLite caps bound variables at 32,766 — `medication_dose`
 * (7 cols) hits it at ~4,700 rows on a single INSERT, and the existence
 * `inArray(...)` lookup faces the same cap on very large restores. 500 keeps
 * every statement well under that ceiling regardless of column count.
 */
const RESTORE_CHUNK_SIZE = 500;

/**
 * Inserts medication rows PRESERVING their ids (unlike log entries, which are
 * re-minted on import) — #11's dose records reference a stable medicationId,
 * so a restore must keep it. Rows whose id already exists are skipped rather
 * than overwritten, matching the existing log-entry import's "already
 * existed" semantics. Both the existence lookup and the insert are chunked
 * (HANDOFF.md §2 restore hardening) so a very large restore never builds one
 * oversized statement.
 */
export async function insertMedicationsPreservingIds(
  rows: Medication[],
): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };
  const existingIds = new Set<string>();
  for (const idBatch of chunk(rows.map((row) => row.id), RESTORE_CHUNK_SIZE)) {
    const existing = await db.select({ id: medication.id }).from(medication).where(inArray(medication.id, idBatch));
    for (const row of existing) existingIds.add(row.id);
  }
  const toInsert = rows.filter((row) => !existingIds.has(row.id));
  for (const insertBatch of chunk(toInsert, RESTORE_CHUNK_SIZE)) {
    await db.insert(medication).values(insertBatch);
  }
  return { inserted: toInsert.length, skipped: rows.length - toInsert.length };
}

/** Same chunked, id-preserving skip-if-exists behavior as {@link insertMedicationsPreservingIds}, for medication_event rows. */
export async function insertMedicationEventsPreservingIds(
  rows: MedicationEvent[],
): Promise<{ inserted: number; skipped: number; insertedIds: string[] }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0, insertedIds: [] };
  const existingIds = new Set<string>();
  for (const idBatch of chunk(rows.map((row) => row.id), RESTORE_CHUNK_SIZE)) {
    const existing = await db
      .select({ id: medicationEvent.id })
      .from(medicationEvent)
      .where(inArray(medicationEvent.id, idBatch));
    for (const row of existing) existingIds.add(row.id);
  }
  const toInsert = rows.filter((row) => !existingIds.has(row.id));
  for (const insertBatch of chunk(toInsert, RESTORE_CHUNK_SIZE)) {
    await db.insert(medicationEvent).values(insertBatch);
  }
  return {
    inserted: toInsert.length,
    skipped: rows.length - toInsert.length,
    // Restore gates dose rows on these (dosesForRestoredEvents): an event that
    // already exists keeps ITS current doses — an edit re-mints dose ids, so a
    // backup's older dose rows for that event would otherwise be re-added.
    insertedIds: toInsert.map((row) => row.id),
  };
}

/** Same chunked, id-preserving skip-if-exists behavior as {@link insertMedicationsPreservingIds}, for medication_dose rows. */
export async function insertMedicationDosesPreservingIds(
  rows: MedicationDose[],
): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };
  const existingIds = new Set<string>();
  for (const idBatch of chunk(rows.map((row) => row.id), RESTORE_CHUNK_SIZE)) {
    const existing = await db
      .select({ id: medicationDose.id })
      .from(medicationDose)
      .where(inArray(medicationDose.id, idBatch));
    for (const row of existing) existingIds.add(row.id);
  }
  const toInsert = rows.filter((row) => !existingIds.has(row.id));
  for (const insertBatch of chunk(toInsert, RESTORE_CHUNK_SIZE)) {
    await db.insert(medicationDose).values(insertBatch);
  }
  return { inserted: toInsert.length, skipped: rows.length - toInsert.length };
}

/** Fields a caller supplies on create — id and timestamps are filled in here. */
export type CreateMedicationEventInput = Omit<NewMedicationEvent, 'id' | 'createdAt' | 'updatedAt'>;

/** One dose line within an event (#9) — id/eventId/timestamps are filled in here. */
export interface MedicationDoseInput {
  medicationId: string;
  dose: number;
  doseUnit: string;
}

/**
 * Creates a "took these" event and its dose rows in one transaction (#7, #9).
 * The only write path (besides backup restore) that ever creates
 * `medication_event`/`medication_dose` rows (invariant, HANDOFF.md §0) — every
 * dose here snapshots its own `dose`/`doseUnit` at log time.
 */
export async function createMedicationEvent(
  event: CreateMedicationEventInput,
  doses: readonly MedicationDoseInput[],
): Promise<{ event: MedicationEvent; doses: MedicationDose[] }> {
  const now = Date.now();
  const eventRow: NewMedicationEvent = {
    ...event,
    id: createId(),
    createdAt: now,
    updatedAt: now,
  };
  const doseRows: NewMedicationDose[] = doses.map((dose) => ({
    ...dose,
    id: createId(),
    eventId: eventRow.id,
    createdAt: now,
    updatedAt: now,
  }));

  await db.transaction(async (tx) => {
    await tx.insert(medicationEvent).values(eventRow);
    if (doseRows.length > 0) {
      await tx.insert(medicationDose).values(doseRows);
    }
  });

  return { event: eventRow as MedicationEvent, doses: doseRows as MedicationDose[] };
}

/**
 * Updates an event and replaces its dose rows in one transaction: the event
 * row is patched, its existing doses are deleted, and the new ones inserted
 * (fresh ids/timestamps) — never a per-row diff, since a dose has no identity
 * worth preserving across an edit (only the event/medication ids matter).
 */
export async function updateMedicationEvent(
  id: string,
  event: CreateMedicationEventInput,
  doses: readonly MedicationDoseInput[],
): Promise<void> {
  const now = Date.now();
  const doseRows: NewMedicationDose[] = doses.map((dose) => ({
    ...dose,
    id: createId(),
    eventId: id,
    createdAt: now,
    updatedAt: now,
  }));

  await db.transaction(async (tx) => {
    await tx
      .update(medicationEvent)
      .set({ ...event, updatedAt: now })
      .where(eq(medicationEvent.id, id));
    await tx.delete(medicationDose).where(eq(medicationDose.eventId, id));
    if (doseRows.length > 0) {
      await tx.insert(medicationDose).values(doseRows);
    }
  });
}

/**
 * Deletes an event and its dose rows together (the user correcting their own
 * log, HANDOFF.md §0) — one transaction so a delete never leaves orphaned
 * dose rows.
 */
export async function deleteMedicationEvent(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(medicationDose).where(eq(medicationDose.eventId, id));
    await tx.delete(medicationEvent).where(eq(medicationEvent.id, id));
  });
}

/** An event with its dose rows, or undefined when the id doesn't resolve. */
export async function getMedicationEvent(
  id: string,
): Promise<{ event: MedicationEvent; doses: MedicationDose[] } | undefined> {
  const eventRows = await db.select().from(medicationEvent).where(eq(medicationEvent.id, id)).limit(1);
  const event = eventRows[0];
  if (!event) return undefined;
  const doses = await db.select().from(medicationDose).where(eq(medicationDose.eventId, id));
  return { event, doses };
}

/** This day's answer, or undefined when nothing has been recorded for it yet. */
export async function getDayCheckIn(date: string): Promise<DayCheckIn | undefined> {
  const rows = await db.select().from(dayCheckIn).where(eq(dayCheckIn.date, date)).limit(1);
  return rows[0];
}

/**
 * Records (or updates) the day's answer (GitHub #13). One row per `date`
 * (unique) — answering again the same day updates `status`/`updatedAt`
 * in place rather than inserting a second row. Callers only ever pass a
 * generated 'YYYY-MM-DD' key (src/lib/datetime.ts `formatDateInput`), so a
 * malformed `date` throws rather than silently persisting garbage.
 */
export async function upsertDayCheckIn(date: string, status: DayStatus): Promise<void> {
  if (!DATE_KEY_RE.test(date)) {
    throw new Error(`upsertDayCheckIn: invalid date "${date}" — expected YYYY-MM-DD.`);
  }
  const now = Date.now();
  const row: DayCheckIn = { id: createId(), date, status, createdAt: now, updatedAt: now };
  await db
    .insert(dayCheckIn)
    .values(row)
    .onConflictDoUpdate({ target: dayCheckIn.date, set: { status, updatedAt: now } });
}

/** All day_check_in rows, newest date first — used by the backup export (src/lib/backup.ts). */
export async function listAllDayCheckIns(): Promise<DayCheckIn[]> {
  return db.select().from(dayCheckIn).orderBy(desc(dayCheckIn.date));
}

/**
 * Inserts pre-built day_check_in rows PRESERVING their ids — mirrors
 * {@link insertMedicationsPreservingIds}, but skips a row if its `date`
 * already exists on the device *or* its `id` does (the device's own answer
 * for a day wins over a backup's). Also de-duplicates by `date` within
 * `rows` before inserting (first wins) — a malformed/duplicated backup file
 * must never violate the `date` unique index mid-restore.
 */
export async function insertDayCheckInsPreservingIds(
  rows: DayCheckIn[],
): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  const seenDates = new Set<string>();
  const deduped: DayCheckIn[] = [];
  for (const row of rows) {
    if (seenDates.has(row.date)) continue;
    seenDates.add(row.date);
    deduped.push(row);
  }

  const existingIds = new Set<string>();
  const existingDates = new Set<string>();
  for (const idBatch of chunk(deduped.map((row) => row.id), RESTORE_CHUNK_SIZE)) {
    const existing = await db.select({ id: dayCheckIn.id }).from(dayCheckIn).where(inArray(dayCheckIn.id, idBatch));
    for (const row of existing) existingIds.add(row.id);
  }
  for (const dateBatch of chunk(deduped.map((row) => row.date), RESTORE_CHUNK_SIZE)) {
    const existing = await db
      .select({ date: dayCheckIn.date })
      .from(dayCheckIn)
      .where(inArray(dayCheckIn.date, dateBatch));
    for (const row of existing) existingDates.add(row.date);
  }

  const toInsert = deduped.filter((row) => !existingIds.has(row.id) && !existingDates.has(row.date));
  for (const insertBatch of chunk(toInsert, RESTORE_CHUNK_SIZE)) {
    await db.insert(dayCheckIn).values(insertBatch);
  }
  return { inserted: toInsert.length, skipped: rows.length - toInsert.length };
}
