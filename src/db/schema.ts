// Drizzle schema — the single source of truth for the data model (CLAUDE.md §6).
// Timestamps are stored as Unix epoch milliseconds (integers).
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** What kind of thing was logged. */
export const LOG_ENTRY_TYPES = ['meal', 'snack', 'bowel_movement'] as const;
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
  // Free text, max 200 chars — enforced in lib/validateNotes, not just the UI.
  notes: text('notes'),
  // Nutrition — all optional reals.
  calories: real('calories'),
  fatG: real('fat_g'),
  saturatedFatG: real('saturated_fat_g'),
  carbsG: real('carbs_g'),
  proteinG: real('protein_g'),
  fiberG: real('fiber_g'),
  sugarG: real('sugar_g'),
  sodiumMg: real('sodium_mg'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type LogEntry = typeof logEntry.$inferSelect;
export type NewLogEntry = typeof logEntry.$inferInsert;
