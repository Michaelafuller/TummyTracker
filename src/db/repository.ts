// Thin repository over Drizzle for log entries. Keeps DB access in one place so
// screens/components stay free of query details. Pure validation/shaping lives in
// lib/ and features/logging/formModel; this module just persists.
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { validateReminder, type ReminderInput } from '@/features/medications/reminderModel';
import { DEFAULT_PROTOCOL, type EliminationChoice, type ExperimentVerdict } from '@/features/experiments/engine';
import { formatDateInput } from '@/lib/datetime';
import { chunk } from '@/lib/array';
import { createId } from '@/lib/id';
import {
  aggregateComponents,
  mealIngredientsText,
  reaggregateEntryPatch,
  unionComponentTags,
  type MealComponentDraft,
} from '@/lib/mealAggregate';
import { mergeTags, parseTagsJson, serializeTags } from '@/lib/ingredients';
import { backfillTargets, groupSavedMeals, savedMealNameKey, type SavedMealWithComponents } from '@/lib/savedMeals';
import type { TagBackfillRowUpdate } from '@/lib/tagBackfill';
import type { NutritionField } from '@/lib/validation';
import { normalizeWatchTerm } from '@/lib/watchlist';
import { db } from './client';
import {
  ALCOHOL_LEVELS,
  CAFFEINE_LEVELS,
  dayCheckIn,
  dayFactor,
  experiment,
  FOOD_TYPES,
  goal,
  logEntry,
  mealComponent,
  medication,
  medicationDose,
  medicationEvent,
  medicationReminder,
  savedMeal,
  savedMealComponent,
  SLEEP_LEVELS,
  watchlistItem,
  type DayCheckIn,
  type DayFactor,
  type DayStatus,
  type Experiment,
  type Goal,
  type GoalDirection,
  type LogEntry,
  type MealComponent,
  type Medication,
  type MedicationDose,
  type MedicationEvent,
  type MedicationReminder,
  type NewLogEntry,
  type NewMealComponent,
  type NewMedication,
  type NewMedicationDose,
  type NewMedicationReminder,
  type NewMedicationEvent,
  type NewSavedMealComponent,
  type SavedMeal,
  type SavedMealComponent,
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

  // Sync callback, no `await` on the call either — drizzle-orm/expo-sqlite's
  // `db.transaction()` (session.js) is itself plain synchronous: it issues
  // BEGIN, calls this callback, and issues COMMIT right after it *returns*,
  // never awaiting anything. An `async` callback here would return a pending
  // Promise at its first `await`, so COMMIT would fire before any of its
  // queries actually ran — every query inside must use the sync API
  // (`.run()`/`.all()`/`.get()`) and nothing may be awaited in here.
  db.transaction((tx) => {
    if (rows.length > 0) {
      tx.insert(logEntry).values(rows).run();
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

  // Sync callback — see createLogEntries' comment above for why.
  db.transaction((tx) => {
    tx.insert(logEntry).values(row).run();
    if (componentRows.length > 0) {
      tx.insert(mealComponent).values(componentRows).run();
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
  // Sync callback — see createLogEntries' comment above for why.
  db.transaction((tx) => {
    const existing = tx
      .select()
      .from(mealComponent)
      .where(eq(mealComponent.id, componentId))
      .limit(1)
      .get();
    if (!existing) return;

    tx.update(mealComponent).set(draft).where(eq(mealComponent.id, componentId)).run();

    const siblings = tx
      .select()
      .from(mealComponent)
      .where(eq(mealComponent.entryId, existing.entryId))
      .orderBy(asc(mealComponent.sortOrder))
      .all();

    const entry = tx.select().from(logEntry).where(eq(logEntry.id, existing.entryId)).limit(1).get();
    if (!entry) return;

    const patch = reaggregateEntryPatch(siblings, entry.tagsJson);
    tx.update(logEntry)
      .set({ ...patch.nutrition, tagsJson: patch.tagsJson, updatedAt: Date.now() })
      .where(eq(logEntry.id, existing.entryId))
      .run();
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

  // Sync callback — see createLogEntries' comment above for why.
  db.transaction((tx) => {
    const existing = tx
      .select()
      .from(mealComponent)
      .where(eq(mealComponent.id, componentId))
      .limit(1)
      .get();
    if (!existing) return;

    const siblings = tx
      .select()
      .from(mealComponent)
      .where(eq(mealComponent.entryId, existing.entryId))
      .orderBy(asc(mealComponent.sortOrder))
      .all();

    if (siblings.length <= 1) {
      result = 'last';
      return;
    }

    tx.delete(mealComponent).where(eq(mealComponent.id, componentId)).run();

    const remaining = siblings.filter((row) => row.id !== componentId);

    const entry = tx.select().from(logEntry).where(eq(logEntry.id, existing.entryId)).limit(1).get();
    if (!entry) {
      result = 'deleted';
      return;
    }

    const patch = reaggregateEntryPatch(remaining, entry.tagsJson);
    tx.update(logEntry)
      .set({
        ...patch.nutrition,
        tagsJson: patch.tagsJson,
        componentCount: remaining.length,
        updatedAt: Date.now(),
      })
      .where(eq(logEntry.id, existing.entryId))
      .run();

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

  // Sync callback — see createLogEntries' comment above for why.
  db.transaction((tx) => {
    for (const update of entryUpdates) {
      tx.update(logEntry).set({ tagsJson: update.tagsJson }).where(eq(logEntry.id, update.id)).run();
    }
    for (const update of componentUpdates) {
      tx.update(mealComponent).set({ tagsJson: update.tagsJson }).where(eq(mealComponent.id, update.id)).run();
    }
  });
}

/**
 * Deletes an entry and, when it's a grouped meal, its mealComponent children.
 * There's no FK cascade (schema has no FK constraints today), so component
 * cleanup is manual — kept in the same transaction as the entry delete.
 */
export async function deleteLogEntry(id: string): Promise<void> {
  // Sync callback — see createLogEntries' comment above for why.
  db.transaction((tx) => {
    tx.delete(mealComponent).where(eq(mealComponent.entryId, id)).run();
    tx.delete(logEntry).where(eq(logEntry.id, id)).run();
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

/**
 * Inserts watchlist rows from a backup PRESERVING their ids. A row is skipped
 * when its id OR its term already exists on the device (the device's own entry
 * wins; `term` is unique). Duplicate terms within `rows` keep the first.
 * Chunked like the other restore helpers.
 */
export async function insertWatchlistItemsPreservingIds(
  rows: WatchlistItem[],
): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  const seenTerms = new Set<string>();
  const deduped: WatchlistItem[] = [];
  for (const row of rows) {
    if (seenTerms.has(row.term)) continue;
    seenTerms.add(row.term);
    deduped.push(row);
  }

  const existingIds = new Set<string>();
  const existingTerms = new Set<string>();
  for (const idBatch of chunk(deduped.map((row) => row.id), RESTORE_CHUNK_SIZE)) {
    const existing = await db.select({ id: watchlistItem.id }).from(watchlistItem).where(inArray(watchlistItem.id, idBatch));
    for (const row of existing) existingIds.add(row.id);
  }
  for (const termBatch of chunk(deduped.map((row) => row.term), RESTORE_CHUNK_SIZE)) {
    const existing = await db
      .select({ term: watchlistItem.term })
      .from(watchlistItem)
      .where(inArray(watchlistItem.term, termBatch));
    for (const row of existing) existingTerms.add(row.term);
  }

  const toInsert = deduped.filter((row) => !existingIds.has(row.id) && !existingTerms.has(row.term));
  for (const insertBatch of chunk(toInsert, RESTORE_CHUNK_SIZE)) {
    await db.insert(watchlistItem).values(insertBatch);
  }
  return { inserted: toInsert.length, skipped: rows.length - toInsert.length };
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

/**
 * Fields a caller supplies on create — id and timestamps are filled in here.
 * `reminders` (GitHub #29) are written in the SAME transaction as the medication.
 */
export type CreateMedicationInput = Omit<NewMedication, 'id' | 'createdAt' | 'updatedAt'> & {
  reminders?: readonly ReminderInput[];
};

/**
 * Fields a caller may patch. id/createdAt are immutable; updatedAt is managed
 * here. `reminders`, when PRESENT (even empty), replaces this medication's
 * reminder rows wholesale in the same transaction; when absent they are left alone.
 */
export type UpdateMedicationInput = Partial<Omit<NewMedication, 'id' | 'createdAt' | 'updatedAt'>> & {
  reminders?: readonly ReminderInput[];
};

/** Every medication, active first, then alphabetical by name (HANDOFF.md #5 list order). */
export async function listMedications(): Promise<Medication[]> {
  return db.select().from(medication).orderBy(desc(medication.isActive), asc(medication.name));
}

export async function getMedication(id: string): Promise<Medication | undefined> {
  const rows = await db.select().from(medication).where(eq(medication.id, id)).limit(1);
  return rows[0];
}

/** Builds the reminder rows for one medication; throws on an unusable reminder BEFORE any write starts. */
function buildReminderRows(medicationId: string, reminders: readonly ReminderInput[], now: number): NewMedicationReminder[] {
  return reminders.map((reminder) => {
    const error = validateReminder(reminder);
    if (error) throw new Error(`Invalid medication reminder: ${error}`);
    return {
      id: createId(),
      medicationId,
      hour: reminder.hour,
      minute: reminder.minute,
      daysMask: reminder.daysMask,
      enabled: reminder.enabled,
      createdAt: now,
      updatedAt: now,
    };
  });
}

export async function createMedication(input: CreateMedicationInput): Promise<Medication> {
  const now = Date.now();
  const { reminders, ...fields } = input;
  const row: NewMedication = {
    ...fields,
    id: createId(),
    createdAt: now,
    updatedAt: now,
  };
  const reminderRows = buildReminderRows(row.id, reminders ?? [], now);

  // Sync callback — see createLogEntries' comment above for why.
  db.transaction((tx) => {
    tx.insert(medication).values(row).run();
    if (reminderRows.length > 0) {
      tx.insert(medicationReminder).values(reminderRows).run();
    }
  });
  return row as Medication;
}

/**
 * Patches a medication's own fields. Never touches `medication_dose` rows
 * (invariant, HANDOFF.md §0) — a dose snapshots its own dose/unit at log time,
 * so editing the medication here can never rewrite history. When `reminders`
 * is given, that medication's reminder rows are replaced in the same
 * transaction (GitHub #29).
 */
export async function updateMedication(id: string, patch: UpdateMedicationInput): Promise<void> {
  const now = Date.now();
  const { reminders, ...fields } = patch;
  const reminderRows = reminders ? buildReminderRows(id, reminders, now) : null;

  // Sync callback — see createLogEntries' comment above for why.
  db.transaction((tx) => {
    tx.update(medication)
      .set({ ...fields, updatedAt: now })
      .where(eq(medication.id, id))
      .run();
    if (reminderRows) {
      tx.delete(medicationReminder).where(eq(medicationReminder.medicationId, id)).run();
      if (reminderRows.length > 0) {
        tx.insert(medicationReminder).values(reminderRows).run();
      }
    }
  });
}

/**
 * Reminder rows (GitHub #29) — all of them, or one medication's — ordered by
 * time of day, then creation. Inactive medications' rows are included: they
 * are kept (just not scheduled).
 */
export async function listMedicationReminders(medicationId?: string): Promise<MedicationReminder[]> {
  const query = db.select().from(medicationReminder);
  const filtered = medicationId === undefined ? query : query.where(eq(medicationReminder.medicationId, medicationId));
  return filtered.orderBy(asc(medicationReminder.hour), asc(medicationReminder.minute), asc(medicationReminder.createdAt));
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
 * (8 cols) hits it at ~4,000 rows on a single INSERT, and the existence
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

/** All medication_reminder rows — used by the backup export (GitHub #29 backup v10). */
export async function listAllMedicationReminders(): Promise<MedicationReminder[]> {
  return db.select().from(medicationReminder).orderBy(asc(medicationReminder.createdAt));
}

/** Same chunked, id-preserving skip-if-exists behavior as {@link insertMedicationsPreservingIds}, for medication_reminder rows. */
export async function insertMedicationRemindersPreservingIds(
  rows: MedicationReminder[],
): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };
  const existingIds = new Set<string>();
  for (const idBatch of chunk(rows.map((row) => row.id), RESTORE_CHUNK_SIZE)) {
    const existing = await db
      .select({ id: medicationReminder.id })
      .from(medicationReminder)
      .where(inArray(medicationReminder.id, idBatch));
    for (const row of existing) existingIds.add(row.id);
  }
  const toInsert = rows.filter((row) => !existingIds.has(row.id));
  for (const insertBatch of chunk(toInsert, RESTORE_CHUNK_SIZE)) {
    await db.insert(medicationReminder).values(insertBatch);
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
  /** Why an as-needed dose was taken (GitHub #28) — already trimmed, null when none. */
  reason?: string | null;
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
    reason: dose.reason ?? null,
    id: createId(),
    eventId: eventRow.id,
    createdAt: now,
    updatedAt: now,
  }));

  // Sync callback — see createLogEntries' comment above for why.
  db.transaction((tx) => {
    tx.insert(medicationEvent).values(eventRow).run();
    if (doseRows.length > 0) {
      tx.insert(medicationDose).values(doseRows).run();
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
    reason: dose.reason ?? null,
    id: createId(),
    eventId: id,
    createdAt: now,
    updatedAt: now,
  }));

  // Sync callback — see createLogEntries' comment above for why.
  db.transaction((tx) => {
    tx.update(medicationEvent)
      .set({ ...event, updatedAt: now })
      .where(eq(medicationEvent.id, id))
      .run();
    tx.delete(medicationDose).where(eq(medicationDose.eventId, id)).run();
    if (doseRows.length > 0) {
      tx.insert(medicationDose).values(doseRows).run();
    }
  });
}

/**
 * Deletes an event and its dose rows together (the user correcting their own
 * log, HANDOFF.md §0) — one transaction so a delete never leaves orphaned
 * dose rows.
 */
export async function deleteMedicationEvent(id: string): Promise<void> {
  // Sync callback — see createLogEntries' comment above for why.
  db.transaction((tx) => {
    tx.delete(medicationDose).where(eq(medicationDose.eventId, id)).run();
    tx.delete(medicationEvent).where(eq(medicationEvent.id, id)).run();
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

/** The factor columns a caller may patch — id/date/timestamps are managed here. */
export type DayFactorPatch = Partial<
  Pick<DayFactor, 'sleep' | 'stress' | 'alcohol' | 'caffeine' | 'period'>
>;

const DAY_FACTOR_KEYS = ['sleep', 'stress', 'alcohol', 'caffeine', 'period'] as const;

/** Throws on any patched value outside its range (null is always allowed: it clears the field). */
function validateDayFactorPatch(patch: DayFactorPatch): void {
  const enumOk = (value: unknown, levels: readonly string[]) =>
    value === null || (typeof value === 'string' && levels.includes(value));
  if (patch.sleep !== undefined && !enumOk(patch.sleep, SLEEP_LEVELS)) {
    throw new Error(`setDayFactors: invalid sleep "${String(patch.sleep)}".`);
  }
  if (patch.alcohol !== undefined && !enumOk(patch.alcohol, ALCOHOL_LEVELS)) {
    throw new Error(`setDayFactors: invalid alcohol "${String(patch.alcohol)}".`);
  }
  if (patch.caffeine !== undefined && !enumOk(patch.caffeine, CAFFEINE_LEVELS)) {
    throw new Error(`setDayFactors: invalid caffeine "${String(patch.caffeine)}".`);
  }
  if (
    patch.stress !== undefined &&
    patch.stress !== null &&
    !(Number.isInteger(patch.stress) && patch.stress >= 1 && patch.stress <= 5)
  ) {
    throw new Error(`setDayFactors: invalid stress "${String(patch.stress)}" — expected an integer 1-5.`);
  }
  if (patch.period !== undefined && patch.period !== null && typeof patch.period !== 'boolean') {
    throw new Error(`setDayFactors: invalid period "${String(patch.period)}".`);
  }
}

/** This day's logged factors, or undefined when nothing has been logged for it yet. */
export async function getDayFactors(date: string): Promise<DayFactor | undefined> {
  const rows = await db.select().from(dayFactor).where(eq(dayFactor.date, date)).limit(1);
  return rows[0];
}

/**
 * Sets (or clears) daily factors for one local day (GitHub #23). Only the
 * fields present in `patch` are written — the others keep their values; a
 * `null` value clears that field back to "not logged". One row per `date`
 * (unique): the first write inserts, later writes update in place, all in a
 * single statement. Every value is validated BEFORE anything is written, so
 * an invalid patch writes nothing. An empty patch is a no-op (no row is
 * created).
 */
export async function setDayFactors(date: string, patch: DayFactorPatch): Promise<void> {
  if (!DATE_KEY_RE.test(date)) {
    throw new Error(`setDayFactors: invalid date "${date}" — expected YYYY-MM-DD.`);
  }
  validateDayFactorPatch(patch);
  const changes: DayFactorPatch = {};
  for (const key of DAY_FACTOR_KEYS) {
    if (patch[key] !== undefined) Object.assign(changes, { [key]: patch[key] });
  }
  if (Object.keys(changes).length === 0) return;

  const now = Date.now();
  await db
    .insert(dayFactor)
    .values({ id: createId(), date, createdAt: now, updatedAt: now, ...changes })
    .onConflictDoUpdate({ target: dayFactor.date, set: { ...changes, updatedAt: now } });
}

/** All day_factor rows, newest date first — used by the backup export and the analysis screens. */
export async function listAllDayFactors(): Promise<DayFactor[]> {
  return db.select().from(dayFactor).orderBy(desc(dayFactor.date));
}

/**
 * Inserts pre-built day_factor rows PRESERVING their ids — mirrors
 * {@link insertDayCheckInsPreservingIds}: a row is skipped if its `date`
 * already exists on the device *or* its `id` does (the device's own row for
 * a day wins, whole — rows are never field-merged), and duplicate dates
 * inside `rows` are de-duplicated first (first wins) so a malformed backup
 * can't violate the `date` unique index mid-restore.
 */
export async function insertDayFactorsPreservingIds(
  rows: DayFactor[],
): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  const seenDates = new Set<string>();
  const deduped: DayFactor[] = [];
  for (const row of rows) {
    if (seenDates.has(row.date)) continue;
    seenDates.add(row.date);
    deduped.push(row);
  }

  const existingIds = new Set<string>();
  const existingDates = new Set<string>();
  for (const idBatch of chunk(deduped.map((row) => row.id), RESTORE_CHUNK_SIZE)) {
    const existing = await db.select({ id: dayFactor.id }).from(dayFactor).where(inArray(dayFactor.id, idBatch));
    for (const row of existing) existingIds.add(row.id);
  }
  for (const dateBatch of chunk(deduped.map((row) => row.date), RESTORE_CHUNK_SIZE)) {
    const existing = await db
      .select({ date: dayFactor.date })
      .from(dayFactor)
      .where(inArray(dayFactor.date, dateBatch));
    for (const row of existing) existingDates.add(row.date);
  }

  const toInsert = deduped.filter((row) => !existingIds.has(row.id) && !existingDates.has(row.date));
  for (const insertBatch of chunk(toInsert, RESTORE_CHUNK_SIZE)) {
    await db.insert(dayFactor).values(insertBatch);
  }
  return { inserted: toInsert.length, skipped: rows.length - toInsert.length };
}

/** Thrown by {@link startExperiment} when an experiment is already active (invariant, HANDOFF.md §0). */
export class ExperimentAlreadyActiveError extends Error {
  constructor() {
    super('An experiment is already active — finish or abandon it first.');
    this.name = 'ExperimentAlreadyActiveError';
  }
}

export interface StartExperimentInput {
  /** Raw user text — normalized here via `normalizeWatchTerm`. */
  term: string;
  eliminationDays: EliminationChoice;
}

/**
 * Starts a new elimination experiment (GitHub #19). Normalizes the term the
 * same way the watchlist does; an invalid (too-short) term throws before any
 * write. One synchronous transaction: throws {@link ExperimentAlreadyActiveError}
 * (rolling back, writing nothing) if an experiment is already `active`;
 * otherwise inserts the new row (`startDate` = today, baseline/challenge/
 * observation from `DEFAULT_PROTOCOL`) and adds the term to the watchlist if
 * it isn't already watched — so save-time warnings work for free without a
 * second write path.
 */
export async function startExperiment(input: StartExperimentInput, now: number): Promise<Experiment> {
  const normalized = normalizeWatchTerm(input.term);
  if (!normalized) {
    throw new Error(`startExperiment: invalid term "${input.term}".`);
  }

  const row: Experiment = {
    id: createId(),
    term: normalized,
    startDate: formatDateInput(now),
    baselineDays: DEFAULT_PROTOCOL.baselineDays,
    eliminationDays: input.eliminationDays,
    challengeDays: DEFAULT_PROTOCOL.challengeDays,
    observationDays: DEFAULT_PROTOCOL.observationDays,
    status: 'active',
    verdictJson: null,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  // Sync callback — see createLogEntries' comment above for why.
  db.transaction((tx) => {
    const existingActive = tx.select().from(experiment).where(eq(experiment.status, 'active')).limit(1).get();
    if (existingActive) {
      throw new ExperimentAlreadyActiveError();
    }

    tx.insert(experiment).values(row).run();

    const existingWatch = tx.select().from(watchlistItem).where(eq(watchlistItem.term, normalized)).limit(1).get();
    if (!existingWatch) {
      tx.insert(watchlistItem).values({ id: createId(), term: normalized, createdAt: now }).run();
    }
  });

  return row;
}

/** The current `active` experiment, or undefined when none is running (at most one, invariant). */
export async function getActiveExperiment(): Promise<Experiment | undefined> {
  const rows = await db.select().from(experiment).where(eq(experiment.status, 'active')).limit(1);
  return rows[0];
}

export async function getExperiment(id: string): Promise<Experiment | undefined> {
  const rows = await db.select().from(experiment).where(eq(experiment.id, id)).limit(1);
  return rows[0];
}

/** Every experiment, newest first. */
export async function listExperiments(): Promise<Experiment[]> {
  return db.select().from(experiment).orderBy(desc(experiment.createdAt));
}

/** All experiment rows — used by the backup export (src/lib/backup.ts, version 5). */
export async function listAllExperiments(): Promise<Experiment[]> {
  return db.select().from(experiment).orderBy(asc(experiment.createdAt));
}

/**
 * Freezes the verdict and marks an experiment `completed` (GitHub #19
 * invariant: a later edit to old log entries must never silently change a
 * finished experiment's verdict). Only takes effect from `status: 'active'` —
 * a no-op otherwise (already finished/abandoned, or a stale id).
 */
export async function finishExperiment(id: string, verdict: ExperimentVerdict, now: number): Promise<void> {
  await db
    .update(experiment)
    .set({ status: 'completed', verdictJson: JSON.stringify(verdict), endedAt: now, updatedAt: now })
    .where(and(eq(experiment.id, id), eq(experiment.status, 'active')));
}

/** Ends an experiment early with no verdict. Only takes effect from `status: 'active'`. */
export async function abandonExperiment(id: string, now: number): Promise<void> {
  await db
    .update(experiment)
    .set({ status: 'abandoned', endedAt: now, updatedAt: now })
    .where(and(eq(experiment.id, id), eq(experiment.status, 'active')));
}

/**
 * Inserts pre-built experiment rows PRESERVING their ids (restore, mirrors
 * {@link insertMedicationsPreservingIds}) — skips rows whose id already
 * exists. The "at most one active" invariant still has to hold after a
 * restore: the FIRST `active` row this call would insert (in file order) is
 * kept active only if the device doesn't already have one; every other
 * `active` row in the same restore (and any after the device's own, if it
 * has one) is imported as `abandoned` with `endedAt` backfilled from its own
 * `updatedAt` rather than dropped, so the experiment's history isn't lost.
 */
export async function insertExperimentsPreservingIds(
  rows: Experiment[],
): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  const existingIds = new Set<string>();
  for (const idBatch of chunk(rows.map((row) => row.id), RESTORE_CHUNK_SIZE)) {
    const existing = await db.select({ id: experiment.id }).from(experiment).where(inArray(experiment.id, idBatch));
    for (const row of existing) existingIds.add(row.id);
  }

  const toInsert = rows.filter((row) => !existingIds.has(row.id));

  let activeClaimed = (await getActiveExperiment()) != null;
  const finalRows: Experiment[] = toInsert.map((row) => {
    if (row.status !== 'active') return row;
    if (activeClaimed) {
      return { ...row, status: 'abandoned', endedAt: row.updatedAt };
    }
    activeClaimed = true;
    return row;
  });

  for (const insertBatch of chunk(finalRows, RESTORE_CHUNK_SIZE)) {
    await db.insert(experiment).values(insertBatch);
  }
  return { inserted: toInsert.length, skipped: rows.length - toInsert.length };
}

// ---------------------------------------------------------------------------
// Saved meals / "My meals" (GitHub #25). A saved meal is a template: these
// functions never touch log entries, with ONE exception — `backfillSavedMealTags`,
// which the UI only calls after an explicit "Add" in its confirmation.
// ---------------------------------------------------------------------------

/** Thrown by {@link saveSavedMeal} when another template already holds the name and the caller didn't ask to replace it. */
export class SavedMealNameTakenError extends Error {
  constructor(name: string) {
    super(`A saved meal named "${name}" already exists.`);
    this.name = 'SavedMealNameTakenError';
  }
}

export type { SavedMealWithComponents };

/** Every saved meal with its items (in builder order), A-Z by name. */
export async function listSavedMeals(): Promise<SavedMealWithComponents[]> {
  const meals = await db.select().from(savedMeal);
  const components = await db.select().from(savedMealComponent).orderBy(asc(savedMealComponent.sortOrder));
  return groupSavedMeals(meals, components);
}

/** The saved meal holding this `nameKey` (see `savedMealNameKey`), if any. */
export async function findSavedMealByNameKey(nameKey: string): Promise<SavedMeal | undefined> {
  const rows = await db.select().from(savedMeal).where(eq(savedMeal.nameKey, nameKey)).limit(1);
  return rows[0];
}

export interface SaveSavedMealInput {
  /** Edit this template. Omit to create one. */
  id?: string;
  name: string;
  type: (typeof FOOD_TYPES)[number];
  mealSlot: SavedMeal['mealSlot'];
  components: readonly MealComponentDraft[];
  /**
   * The id of ANOTHER template that currently holds this name, which the
   * caller has confirmed to Replace. Without `id` that template is overwritten
   * in place (keeping its id); with `id` it is deleted and the edited
   * template (`id`) takes its name. Never two rows with one `nameKey`.
   */
  replaceId?: string;
}

/**
 * Creates or edits a saved meal (replacing ALL of its items) in ONE
 * transaction. The name is stored trimmed; `nameKey` is its lowercase. A name
 * held by a different template that wasn't named in `replaceId` throws
 * {@link SavedMealNameTakenError} and writes nothing.
 */
export async function saveSavedMeal(input: SaveSavedMealInput): Promise<SavedMeal> {
  const name = input.name.trim();
  const nameKey = savedMealNameKey(name);
  const now = Date.now();
  const componentIds = input.components.map(() => createId());
  const newId = createId();

  // Sync callback — see createLogEntries' comment above for why.
  return db.transaction((tx) => {
    const clash = tx.select().from(savedMeal).where(eq(savedMeal.nameKey, nameKey)).limit(1).get();
    const editing = input.id
      ? tx.select().from(savedMeal).where(eq(savedMeal.id, input.id)).limit(1).get()
      : undefined;
    if (input.id && !editing) throw new Error(`saveSavedMeal: no saved meal with id "${input.id}".`);

    let targetId: string;
    let createdAt = now;
    if (editing) {
      targetId = editing.id;
      createdAt = editing.createdAt;
      if (clash && clash.id !== editing.id) {
        if (clash.id !== input.replaceId) throw new SavedMealNameTakenError(name);
        // Free the name: the clashing template (and its items) goes away.
        tx.delete(savedMealComponent).where(eq(savedMealComponent.savedMealId, clash.id)).run();
        tx.delete(savedMeal).where(eq(savedMeal.id, clash.id)).run();
      }
    } else if (clash) {
      if (clash.id !== input.replaceId) throw new SavedMealNameTakenError(name);
      targetId = clash.id;
      createdAt = clash.createdAt;
    } else {
      targetId = newId;
    }

    const row: SavedMeal = {
      id: targetId,
      name,
      nameKey,
      type: input.type,
      mealSlot: input.mealSlot,
      createdAt,
      updatedAt: now,
    };
    const componentRows: NewSavedMealComponent[] = input.components.map((component, index) => ({
      ...component,
      id: componentIds[index],
      savedMealId: targetId,
      sortOrder: index,
      createdAt: now,
    }));

    if (editing || clash) {
      tx.update(savedMeal)
        .set({ name, nameKey, type: row.type, mealSlot: row.mealSlot, updatedAt: now })
        .where(eq(savedMeal.id, targetId))
        .run();
      tx.delete(savedMealComponent).where(eq(savedMealComponent.savedMealId, targetId)).run();
    } else {
      tx.insert(savedMeal).values(row).run();
    }
    if (componentRows.length > 0) {
      tx.insert(savedMealComponent).values(componentRows).run();
    }
    return row;
  });
}

/** Deletes a saved meal and its items in one transaction. Past meals are never touched. */
export async function deleteSavedMeal(id: string): Promise<void> {
  // Sync callback — see createLogEntries' comment above for why.
  db.transaction((tx) => {
    tx.delete(savedMealComponent).where(eq(savedMealComponent.savedMealId, id)).run();
    tx.delete(savedMeal).where(eq(savedMeal.id, id)).run();
  });
}

/** Anything with drizzle's sync `select` — the db itself or a transaction. */
type SelectSource = Pick<typeof db, 'select'>;

/** SQLite caps bound parameters; stay well under it for `inArray` lookups. */
const BACKFILL_ID_CHUNK = 500;

/**
 * The backfill targets for `nameKey` read from `source` (see `backfillTargets`
 * for the rule): same-name food entries whose only tags are their own name
 * and their items' names. Shared by the count the UI shows and the write.
 */
function savedMealBackfillTargetsIn(source: SelectSource, nameKey: string): LogEntry[] {
  const candidates = source
    .select()
    .from(logEntry)
    .where(inArray(logEntry.type, [...FOOD_TYPES]))
    .all()
    .filter((entry) => savedMealNameKey(entry.name) === nameKey);
  const ids = candidates.map((entry) => entry.id);
  const componentNames = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += BACKFILL_ID_CHUNK) {
    const rows = source
      .select({ entryId: mealComponent.entryId, name: mealComponent.name })
      .from(mealComponent)
      .where(inArray(mealComponent.entryId, ids.slice(i, i + BACKFILL_ID_CHUNK)))
      .all();
    for (const row of rows) {
      const names = componentNames.get(row.entryId) ?? [];
      names.push(row.name);
      componentNames.set(row.entryId, names);
    }
  }
  return backfillTargets(candidates, nameKey, componentNames);
}

/** How many past entries `backfillSavedMealTags` would update right now (for the offer's wording). */
export async function countSavedMealBackfillTargets(nameKey: string): Promise<number> {
  return savedMealBackfillTargetsIn(db, nameKey).length;
}

/**
 * The opt-in backfill (GitHub #25): gives past food entries named like a
 * saved meal (`nameKey`) the template's tags, but ONLY entries with no
 * ingredient information — every tag they have is just a name
 * (`backfillTargets`). `tags` are merged after the entry's existing name tags
 * (additive, order-preserving, like the tag backfill); `ingredientsText` is
 * set from the template only when the entry's is null/empty; `updatedAt` is
 * bumped. Components of those entries are never touched. Targets are
 * recomputed inside the transaction — never trust a count the UI computed
 * earlier. Returns how many entries were updated.
 */
export async function backfillSavedMealTags(
  nameKey: string,
  tags: readonly string[],
  ingredientsText: string | null,
): Promise<number> {
  if (tags.length === 0) return 0;
  const now = Date.now();
  const text = ingredientsText?.trim() ? ingredientsText : null;

  // Sync callback — see createLogEntries' comment above for why.
  return db.transaction((tx) => {
    const targets = savedMealBackfillTargetsIn(tx, nameKey);
    for (const target of targets) {
      const merged = mergeTags(parseTagsJson(target.tagsJson), [...tags]);
      const patch: Partial<NewLogEntry> = { tagsJson: serializeTags(merged), updatedAt: now };
      if (text && !target.ingredientsText?.trim()) patch.ingredientsText = text;
      tx.update(logEntry).set(patch).where(eq(logEntry.id, target.id)).run();
    }
    return targets.length;
  });
}

/** All saved_meal rows — used by the backup export (src/lib/backup.ts). */
export async function listAllSavedMeals(): Promise<SavedMeal[]> {
  return db.select().from(savedMeal).orderBy(asc(savedMeal.createdAt));
}

/** All saved_meal_component rows — used by the backup export. */
export async function listAllSavedMealComponents(): Promise<SavedMealComponent[]> {
  return db.select().from(savedMealComponent).orderBy(asc(savedMealComponent.sortOrder));
}

/**
 * Restores saved meals from a backup, PRESERVING ids. A meal is skipped when
 * its id OR its `nameKey` already exists on the device (the device wins,
 * whole — like check-ins), and duplicate ids/nameKeys inside `meals` keep the
 * first. Components are inserted only for the meals actually inserted, so a
 * skipped meal keeps exactly the items the device already has. Chunked like
 * the other restore helpers.
 */
export async function insertSavedMealsPreservingIds(
  meals: SavedMeal[],
  components: SavedMealComponent[],
): Promise<{ inserted: number; skipped: number }> {
  if (meals.length === 0) return { inserted: 0, skipped: 0 };

  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  const deduped: SavedMeal[] = [];
  for (const meal of meals) {
    if (seenKeys.has(meal.nameKey) || seenIds.has(meal.id)) continue;
    seenKeys.add(meal.nameKey);
    seenIds.add(meal.id);
    deduped.push(meal);
  }

  const existingIds = new Set<string>();
  const existingKeys = new Set<string>();
  for (const idBatch of chunk(deduped.map((meal) => meal.id), RESTORE_CHUNK_SIZE)) {
    const existing = await db.select({ id: savedMeal.id }).from(savedMeal).where(inArray(savedMeal.id, idBatch));
    for (const row of existing) existingIds.add(row.id);
  }
  for (const keyBatch of chunk(deduped.map((meal) => meal.nameKey), RESTORE_CHUNK_SIZE)) {
    const existing = await db
      .select({ nameKey: savedMeal.nameKey })
      .from(savedMeal)
      .where(inArray(savedMeal.nameKey, keyBatch));
    for (const row of existing) existingKeys.add(row.nameKey);
  }

  const toInsert = deduped.filter((meal) => !existingIds.has(meal.id) && !existingKeys.has(meal.nameKey));
  for (const insertBatch of chunk(toInsert, RESTORE_CHUNK_SIZE)) {
    await db.insert(savedMeal).values(insertBatch);
  }

  const insertedIds = new Set(toInsert.map((meal) => meal.id));
  const seenComponentIds = new Set<string>();
  const componentsToInsert = components.filter((component) => {
    if (!insertedIds.has(component.savedMealId) || seenComponentIds.has(component.id)) return false;
    seenComponentIds.add(component.id);
    return true;
  });
  for (const insertBatch of chunk(componentsToInsert, RESTORE_CHUNK_SIZE)) {
    await db.insert(savedMealComponent).values(insertBatch);
  }
  return { inserted: toInsert.length, skipped: meals.length - toInsert.length };
}
