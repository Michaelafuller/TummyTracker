// Pure daily nutrition tally helpers (HANDOFF.md "Goals tab" Phase 1). No
// React, no I/O — used by the Goals screen to summarize today's food entries.
//
// Aggregation is over food-type PARENT rows only (FOOD_TYPES): a grouped meal
// already carries aggregate nutrition on its parent `logEntry` row, and its
// component rows live in a separate table, so summing parent rows never
// double-counts (design contract, HANDOFF.md).
//
// Missing-data honesty (owner requirement): a sum that silently treats null
// as zero would understate protein (false alarms later) and understate fat
// (false comfort). Each nutrient's `total` is null only when NO in-range
// entry had a value for it; a logged 0 counts as logged and contributes 0.

import { FOOD_TYPES, type LogEntry } from '@/db/schema';
import { NUTRITION_FIELDS, type NutritionField } from '@/lib/validation';

const FOOD_TYPES_SET = new Set(FOOD_TYPES as readonly string[]);

export interface NutrientTally {
  /** Sum over entries with a non-null value; null when NO entry had a value. */
  total: number | null;
  /** Entries in range that had a value for this nutrient. */
  loggedCount: number;
  /** Entries in range with null for this nutrient. */
  missingCount: number;
}

export interface DailyTally {
  /** Food entries in [start, end). */
  entryCount: number;
  nutrients: Record<NutritionField, NutrientTally>;
}

export interface NutrientContribution {
  id: string;
  name: string;
  loggedAt: number;
  /** Rounded with decimalsFor(field). */
  value: number;
}

export interface NutrientMissing {
  id: string;
  name: string;
  loggedAt: number;
}

export interface NutrientContributions {
  /** Value desc, ties broken by loggedAt asc. */
  contributors: NutrientContribution[];
  /** loggedAt asc. */
  missing: NutrientMissing[];
}

/** Matches the OFF mapper's display precision (src/lib/openFoodFacts.ts): calories
 *  and sodium to 0 decimals, gram fields to 1. */
function decimalsFor(field: NutritionField): number {
  return field === 'calories' || field === 'sodiumMg' ? 0 : 1;
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Food-type entries in [start, end) — the shared filter behind every tally view. */
function entriesInRange(entries: readonly LogEntry[], start: number, end: number): LogEntry[] {
  return entries.filter(
    (entry) => FOOD_TYPES_SET.has(entry.type) && entry.loggedAt >= start && entry.loggedAt < end,
  );
}

/**
 * Tally today's (or any [start, end) window's) nutrition over food-type
 * entries. `end` is exclusive, matching `dayBounds`. Non-food rows (bowel
 * movement, symptom) are excluded.
 */
export function tallyDailyNutrition(
  entries: readonly LogEntry[],
  start: number,
  end: number,
): DailyTally {
  const inRange = entriesInRange(entries, start, end);

  const nutrients = {} as Record<NutritionField, NutrientTally>;
  for (const field of NUTRITION_FIELDS) {
    let sum = 0;
    let loggedCount = 0;
    let missingCount = 0;
    for (const entry of inRange) {
      const value = entry[field];
      if (value == null) {
        missingCount += 1;
      } else {
        loggedCount += 1;
        sum += value;
      }
    }
    nutrients[field] = {
      total: loggedCount > 0 ? round(sum, decimalsFor(field)) : null,
      loggedCount,
      missingCount,
    };
  }

  return { entryCount: inRange.length, nutrients };
}

/**
 * The per-entry breakdown behind one nutrient's tally total — the drill-down
 * data for an expandable tally row (HANDOFF.md "Goals tab" cycle). Same
 * food-type + [start, end) filtering as `tallyDailyNutrition`; a logged `0`
 * is a contributor (value 0), not missing, matching the tally's own rule.
 */
export function nutrientContributions(
  entries: readonly LogEntry[],
  field: NutritionField,
  start: number,
  end: number,
): NutrientContributions {
  const inRange = entriesInRange(entries, start, end);
  const decimals = decimalsFor(field);

  const contributors: NutrientContribution[] = [];
  const missing: NutrientMissing[] = [];
  for (const entry of inRange) {
    const value = entry[field];
    if (value == null) {
      missing.push({ id: entry.id, name: entry.name, loggedAt: entry.loggedAt });
    } else {
      contributors.push({ id: entry.id, name: entry.name, loggedAt: entry.loggedAt, value: round(value, decimals) });
    }
  }

  contributors.sort((a, b) => b.value - a.value || a.loggedAt - b.loggedAt);
  missing.sort((a, b) => a.loggedAt - b.loggedAt);

  return { contributors, missing };
}
