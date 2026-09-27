// Drizzle schema — the single source of truth for the data model (CLAUDE.md §6).
// Timestamps are stored as Unix epoch milliseconds (integers).
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { NUTRITION_FIELDS } from '@/lib/validation';

/** What kind of thing was logged. */
export const LOG_ENTRY_TYPES = ['meal', 'snack', 'bowel_movement', 'symptom'] as const;
export type LogEntryType = (typeof LOG_ENTRY_TYPES)[number];

/** A logged type counts as "food" when it isn't a bowel movement. */
export const FOOD_TYPES = ['meal', 'snack'] as const;

/** Which part of the day a meal/snack belongs to (nullable). */
export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const logEntry = sqliteTable('log_entry', {
  id: text('id').primaryKey(),
  type: text('type', { enum: LOG_ENTRY_TYPES }).notNull(),
  mealSlot: text('meal_slot', { enum: MEAL_SLOTS }),
  name: text('name').notNull(),
  barcode: text('barcode'),
  // When the meal actually happened — user-editable (backfill/correct). Epoch ms.
  loggedAt: integer('logged_at').notNull(),
  // 1–5 sentiment; nullable until rated. Can be set later (CLAUDE.md §6/§7).
  sentiment: integer('sentiment'),
  // Bristol Stool Scale (1–7), only for bowel_movement entries; nullable otherwise.
  bristolScale: integer('bristol_scale'),
  // Symptom type string (e.g. 'bloating') — only for symptom entries; null otherwise.
  symptomType: text('symptom_type'),
  // Severity 1–5 for symptom entries (1 = mild, 5 = very severe); null otherwise.
  severity: integer('severity'),
  // Free text, max 500 chars — enforced in lib/validateNotes, not just the UI.
  notes: text('notes'),
  // Raw ingredient list from OFF or manual entry; tags derived from this + allergens/additives.
  ingredientsText: text('ingredients_text'),
  // JSON-encoded string[] of normalized tags (allergens + additives + tokenized words).
  tagsJson: text('tags_json'),
  // Serving size in grams/ml (from OFF serving_quantity or user entry); optional.
  servingG: real('serving_g'),
  // Nutrition — all optional reals.
  calories: real('calories'),
  fatG: real('fat_g'),
  saturatedFatG: real('saturated_fat_g'),
  carbsG: real('carbs_g'),
  proteinG: real('protein_g'),
  fiberG: real('fiber_g'),
  sugarG: real('sugar_g'),
  sodiumMg: real('sodium_mg'),
  // Denormalized count of mealComponent rows for this entry (Phase 2 meal builder).
  // Null/1 = a plain single-item entry; >1 = a grouped meal built from multiple scans.
  // Kept in sync by createMealWithComponents so EntryRow can label grouped meals
  // without an N+1 query.
  componentCount: integer('component_count'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type LogEntry = typeof logEntry.$inferSelect;
export type NewLogEntry = typeof logEntry.$inferInsert;

/**
 * A single scanned/entered item within a grouped meal (Phase 2 meal builder).
 * The parent `logEntry` row carries the AGGREGATE nutrition (sum of value × servings
 * across components) and the UNION of component tags in its own `tagsJson` — every
 * other screen/analyzer keeps working on `logEntry` unchanged. Nutrition fields here
 * are PER ONE SERVING; `servings` is the multiplier the user set for "how much of
 * this did you actually eat".
 */
export const mealComponent = sqliteTable(
  'meal_component',
  {
    id: text('id').primaryKey(),
    entryId: text('entry_id').notNull(),
    name: text('name').notNull(),
    barcode: text('barcode'),
    servings: real('servings').notNull().default(1),
    // Grams/ml for a single serving; optional (mirrors logEntry.servingG semantics).
    servingG: real('serving_g'),
    // Nutrition — per ONE serving; all optional reals.
    calories: real('calories'),
    fatG: real('fat_g'),
    saturatedFatG: real('saturated_fat_g'),
    carbsG: real('carbs_g'),
    proteinG: real('protein_g'),
    fiberG: real('fiber_g'),
    sugarG: real('sugar_g'),
    sodiumMg: real('sodium_mg'),
    ingredientsText: text('ingredients_text'),
    tagsJson: text('tags_json'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('meal_component_entry_id_idx').on(table.entryId)],
);

export type MealComponent = typeof mealComponent.$inferSelect;
export type NewMealComponent = typeof mealComponent.$inferInsert;

/**
 * A suspected trigger ingredient the user is watching (trigger watchlist /
 * elimination mode, HANDOFF.md). `term` is a normalized (lowercase,
 * `[a-z0-9 -]`) text term matched against entry tags via prefix-at-word-
 * boundary (src/lib/watchlist.ts). `createdAt` doubles as the elimination
 * start date — v1 has no pause/status; removing a row stops watching it.
 */
export const watchlistItem = sqliteTable('watchlist_item', {
  id: text('id').primaryKey(),
  term: text('term').notNull().unique(),
  createdAt: integer('created_at').notNull(),
});

export type WatchlistItem = typeof watchlistItem.$inferSelect;
export type NewWatchlistItem = typeof watchlistItem.$inferInsert;

/** A goal's direction: at-least ("floor") or at-most ("cap") its threshold. */
export const GOAL_DIRECTIONS = ['floor', 'cap'] as const;
export type GoalDirection = (typeof GOAL_DIRECTIONS)[number];

/**
 * A per-nutrient threshold goal (nutrient threshold goals, HANDOFF.md). At most
 * one goal per nutrient — `nutrient` is unique, so setting again overwrites via
 * `upsertGoal` (src/db/repository.ts). Floors alert through the daily check-in
 * notification; caps alert in-app at save time (design contract, HANDOFF.md).
 */
export const goal = sqliteTable('goal', {
  id: text('id').primaryKey(),
  nutrient: text('nutrient', { enum: NUTRITION_FIELDS }).notNull().unique(),
  direction: text('direction', { enum: GOAL_DIRECTIONS }).notNull(),
  threshold: real('threshold').notNull(),
  createdAt: integer('created_at').notNull(),
});

export type Goal = typeof goal.$inferSelect;
export type NewGoal = typeof goal.$inferInsert;

/** Fixed dose-unit choices offered as chips; the form's "Other" option stores its
 * own free-text unit in the same `doseUnit` column instead of one of these values. */
export const DOSE_UNITS = ['mg', 'mcg', 'g', 'mL', 'tablet', 'capsule', 'drop', 'puff', 'unit'] as const;
export type DoseUnit = (typeof DOSE_UNITS)[number];

/**
 * Medication inventory (Medications Cycle A, HANDOFF.md #5). Never deleted —
 * `isActive=false` (Mark inactive) hides it from pickers only; there is no
 * `deleteMedication` in the repository. `startDate`/`endDate` are optional
 * date-only fields stored as local-midnight epoch ms (CLAUDE.md §6 timestamp
 * convention, but date-only here rather than a full instant).
 */
export const medication = sqliteTable('medication', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  defaultDose: real('default_dose'),
  // A DOSE_UNITS value, or the user's own free text when "Other" was chosen.
  doseUnit: text('dose_unit'),
  frequency: text('frequency'),
  startDate: integer('start_date'),
  endDate: integer('end_date'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type Medication = typeof medication.$inferSelect;
export type NewMedication = typeof medication.$inferInsert;

/**
 * One "I took these" event (Cycle B, #7): several medications logged at one
 * moment share an event row. `timeKnown=false` means the user only knows the
 * day, not the time — `takenAt` is then local noon of that date (#10).
 * Nothing in this schema infers a dose from a medication's frequency/schedule
 * (invariant, HANDOFF.md §0) — event/dose rows are only ever written by an
 * explicit user entry.
 */
export const medicationEvent = sqliteTable('medication_event', {
  id: text('id').primaryKey(),
  takenAt: integer('taken_at').notNull(),
  timeKnown: integer('time_known', { mode: 'boolean' }).notNull().default(true),
  // Per-event notes (#8) — separate from a medication's own `notes` above.
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type MedicationEvent = typeof medicationEvent.$inferSelect;
export type NewMedicationEvent = typeof medicationEvent.$inferInsert;

/**
 * One medication within an event (#9, #11). Snapshots `dose`/`doseUnit` at log
 * time — editing the parent medication later never rewrites these rows, so a
 * dose stays historically accurate even after a dosage change. References
 * `medicationId`, never the medication's name, so renaming or deactivating a
 * medication leaves history valid (#11 invariant).
 */
export const medicationDose = sqliteTable(
  'medication_dose',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id').notNull(),
    medicationId: text('medication_id').notNull(),
    // > 0 — partial doses allowed (e.g. 0.5).
    dose: real('dose').notNull(),
    doseUnit: text('dose_unit').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('medication_dose_event_id_idx').on(table.eventId),
    index('medication_dose_medication_id_idx').on(table.medicationId),
  ],
);

export type MedicationDose = typeof medicationDose.$inferSelect;
export type NewMedicationDose = typeof medicationDose.$inferInsert;

/**
 * A day check-in answer (GitHub #13, "fine day / rough day"). Invariants:
 * - One row per local calendar day (`date`, 'YYYY-MM-DD', unique) — answering
 *   again the same day updates that row's `status`; it never inserts a
 *   second row, and there is no delete path this cycle.
 * - `date` is the day the *notification* asked about (its own
 *   `content.data.date`), never `Date.now()`'s day at write time — tapping
 *   yesterday's notification after midnight records yesterday.
 * - Never an outcome and never a log entry — the correlation engine
 *   (`src/features/analysis/*`, `isOutcome`) does not read this table.
 *   Rough marks the day covered; it only prompts "add a symptom?" in the UI.
 * - Nothing is inferred: only an explicit tap (Home card or notification
 *   action) or a backup restore ever writes a row.
 */
export const DAY_STATUSES = ['fine', 'rough'] as const;
export type DayStatus = (typeof DAY_STATUSES)[number];

export const dayCheckIn = sqliteTable('day_check_in', {
  id: text('id').primaryKey(),
  // Local calendar day 'YYYY-MM-DD' (formatDateInput) — one row per day.
  date: text('date').notNull().unique(),
  status: text('status', { enum: DAY_STATUSES }).notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
export type DayCheckIn = typeof dayCheckIn.$inferSelect;
export type NewDayCheckIn = typeof dayCheckIn.$inferInsert;
