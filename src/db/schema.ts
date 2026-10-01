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

/**
 * Daily confounders (GitHub #23): sleep, stress, alcohol, caffeine, period.
 * Invariants:
 * - One row per local calendar day (`date`, 'YYYY-MM-DD', unique); every
 *   factor column is nullable. Null means "not logged" — never a low value.
 *   Nothing is inferred: only an explicit tap writes a value, and clearing a
 *   chip writes null back.
 * - A separate table from `day_check_in` because that table requires a
 *   fine/rough answer and can't be relaxed additively.
 * - Never an outcome and never a log entry — `isOutcome` does not read it.
 *   A row only marks the day *covered* and feeds the daily-factor analysis
 *   (`src/features/analysis/factors.ts`).
 * - `stress` is an integer 1-5 (validated in the repository, not the DB).
 * - `period` rows are kept when period tracking is turned off in Settings;
 *   they are simply hidden and ignored until it is turned back on.
 */
export const SLEEP_LEVELS = ['poor', 'ok', 'good'] as const;
export type SleepLevel = (typeof SLEEP_LEVELS)[number];
export const ALCOHOL_LEVELS = ['none', 'some', 'a_lot'] as const;
export type AlcoholLevel = (typeof ALCOHOL_LEVELS)[number];
export const CAFFEINE_LEVELS = ['none', 'usual', 'more'] as const;
export type CaffeineLevel = (typeof CAFFEINE_LEVELS)[number];

export const dayFactor = sqliteTable('day_factor', {
  id: text('id').primaryKey(),
  // Local calendar day 'YYYY-MM-DD' (formatDateInput) — one row per day.
  date: text('date').notNull().unique(),
  sleep: text('sleep', { enum: SLEEP_LEVELS }),
  stress: integer('stress'),
  alcohol: text('alcohol', { enum: ALCOHOL_LEVELS }),
  caffeine: text('caffeine', { enum: CAFFEINE_LEVELS }),
  period: integer('period', { mode: 'boolean' }),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
export type DayFactor = typeof dayFactor.$inferSelect;
export type NewDayFactor = typeof dayFactor.$inferInsert;

/**
 * An elimination experiment (GitHub #19, Cycle A). Invariants (see
 * `src/features/experiments/engine.ts` for the schedule/verdict math this
 * table drives):
 * - `term` is a normalized watch term (`normalizeWatchTerm`) — starting an
 *   experiment adds it to the watchlist if it isn't already watched.
 * - `startDate` ('YYYY-MM-DD') is the first elimination day; the 14-day
 *   baseline is read from existing logs BEFORE it, never a waiting period.
 * - At most one `active` row at a time — enforced in the repository
 *   (`startExperiment`), not just here.
 * - `verdictJson` is null until `finishExperiment` freezes the evaluation's
 *   verdict at that moment — later edits to old log entries must never
 *   silently change a completed experiment's verdict.
 * - `endedAt` is set by `finishExperiment` (completed) or `abandonExperiment`
 *   (abandoned); null while `active`.
 */
export const EXPERIMENT_STATUSES = ['active', 'completed', 'abandoned'] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export const experiment = sqliteTable('experiment', {
  id: text('id').primaryKey(),
  // Normalized (normalizeWatchTerm) suspect ingredient term.
  term: text('term').notNull(),
  // 'YYYY-MM-DD', local calendar day — first elimination day.
  startDate: text('start_date').notNull(),
  // Always 14 (DEFAULT_PROTOCOL) — stored per-row so a future protocol change
  // never rewrites an in-progress experiment's own schedule.
  baselineDays: integer('baseline_days').notNull(),
  // User's choice: 7 | 14 | 21 | 28 (ELIMINATION_CHOICES).
  eliminationDays: integer('elimination_days').notNull(),
  // Always 3 (DEFAULT_PROTOCOL) — see baselineDays comment.
  challengeDays: integer('challenge_days').notNull(),
  // Always 3 (DEFAULT_PROTOCOL) — see baselineDays comment.
  observationDays: integer('observation_days').notNull(),
  status: text('status', { enum: EXPERIMENT_STATUSES }).notNull(),
  // Frozen ExperimentVerdict (JSON) set once, at finish; null otherwise.
  verdictJson: text('verdict_json'),
  // Epoch ms — set by finishExperiment/abandonExperiment; null while active.
  endedAt: integer('ended_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type Experiment = typeof experiment.$inferSelect;
export type NewExperiment = typeof experiment.$inferInsert;
