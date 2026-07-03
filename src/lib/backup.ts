// Pure serialization/parse helpers for the JSON backup format.
// No filesystem or sharing imports here — kept pure so the logic can be unit-tested.

import { LOG_ENTRY_TYPES, FOOD_TYPES, MEAL_SLOTS, type LogEntry, type MealComponent } from '@/db/schema';

export interface BackupFile {
  version: number;
  entries: LogEntry[];
  /** Absent in v1 backups (pre meal-builder) and treated as [] on import. */
  mealComponents?: MealComponent[];
}

/**
 * Serializes entries + their mealComponent rows (HANDOFF 2.4 backup v2). Version
 * bumps to 2 but `parseBackupJson` still reads v1 files (no mealComponents key)
 * by defaulting the array to empty — old backups remain importable.
 */
export function entriesToJson(entries: LogEntry[], mealComponents: MealComponent[] = []): string {
  const payload: BackupFile = { version: 2, entries, mealComponents };
  return JSON.stringify(payload, null, 2);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isValidEntry(v: unknown): v is LogEntry {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  if (!isString(r.id) || r.id.length === 0) return false;
  if (!(LOG_ENTRY_TYPES as readonly string[]).includes(r.type as string)) return false;
  if (!isString(r.name)) return false;
  if (typeof r.loggedAt !== 'number') return false;
  if (typeof r.createdAt !== 'number') return false;
  if (typeof r.updatedAt !== 'number') return false;
  // Optional fields: coerce absent → null so the shape matches LogEntry.
  // (We don't mutate the original — we only validate shape.)
  if (r.mealSlot !== null && r.mealSlot !== undefined) {
    if (!(MEAL_SLOTS as readonly string[]).includes(r.mealSlot as string)) return false;
  }
  return true;
}

/** Normalises an entry from the backup so optional absent fields become null. */
function normaliseEntry(v: Record<string, unknown>): LogEntry {
  const nullable = <T>(key: string): T | null =>
    (v[key] !== undefined ? v[key] : null) as T | null;
  return {
    id: v.id as string,
    type: v.type as LogEntry['type'],
    mealSlot: nullable<LogEntry['mealSlot']>('mealSlot') ?? null,
    name: v.name as string,
    barcode: nullable<string>('barcode'),
    loggedAt: v.loggedAt as number,
    sentiment: nullable<number>('sentiment'),
    bristolScale: nullable<number>('bristolScale'),
    symptomType: nullable<string>('symptomType'),
    severity: nullable<number>('severity'),
    notes: nullable<string>('notes'),
    ingredientsText: nullable<string>('ingredientsText'),
    tagsJson: nullable<string>('tagsJson'),
    calories: nullable<number>('calories'),
    fatG: nullable<number>('fatG'),
    saturatedFatG: nullable<number>('saturatedFatG'),
    carbsG: nullable<number>('carbsG'),
    proteinG: nullable<number>('proteinG'),
    fiberG: nullable<number>('fiberG'),
    sugarG: nullable<number>('sugarG'),
    sodiumMg: nullable<number>('sodiumMg'),
    servingG: nullable<number>('servingG'),
    componentCount: nullable<number>('componentCount'),
    createdAt: v.createdAt as number,
    updatedAt: v.updatedAt as number,
  };
}

export type ParseResult =
  | { ok: true; entries: LogEntry[]; mealComponents: MealComponent[] }
  | { ok: false; error: string };

function isValidMealComponent(v: unknown): v is MealComponent {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  if (!isString(r.id) || r.id.length === 0) return false;
  if (!isString(r.entryId) || r.entryId.length === 0) return false;
  if (!isString(r.name)) return false;
  if (typeof r.createdAt !== 'number') return false;
  return true;
}

/** Normalises a mealComponent from the backup so optional absent fields become null/defaults. */
function normaliseMealComponent(v: Record<string, unknown>): MealComponent {
  const nullable = <T>(key: string): T | null => (v[key] !== undefined ? v[key] : null) as T | null;
  return {
    id: v.id as string,
    entryId: v.entryId as string,
    name: v.name as string,
    barcode: nullable<string>('barcode'),
    servings: typeof v.servings === 'number' ? v.servings : 1,
    servingG: nullable<number>('servingG'),
    calories: nullable<number>('calories'),
    fatG: nullable<number>('fatG'),
    saturatedFatG: nullable<number>('saturatedFatG'),
    carbsG: nullable<number>('carbsG'),
    proteinG: nullable<number>('proteinG'),
    fiberG: nullable<number>('fiberG'),
    sugarG: nullable<number>('sugarG'),
    sodiumMg: nullable<number>('sodiumMg'),
    ingredientsText: nullable<string>('ingredientsText'),
    tagsJson: nullable<string>('tagsJson'),
    sortOrder: typeof v.sortOrder === 'number' ? v.sortOrder : 0,
    createdAt: v.createdAt as number,
  };
}

/**
 * Parses a backup file, accepting both the legacy v1 shape (no mealComponents
 * key — imports with an empty component list) and the v2 shape produced by
 * entriesToJson. Also accepts a bare entries array for maximum backward compat.
 */
export function parseBackupJson(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'File is not valid JSON.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Backup file has an unexpected format.' };
  }

  const root = parsed as Record<string, unknown>;

  // Accept both the versioned format { version, entries } and a bare array.
  const rawEntries: unknown[] = Array.isArray(root.entries)
    ? (root.entries as unknown[])
    : Array.isArray(parsed)
      ? (parsed as unknown[])
      : [];

  if (rawEntries.length === 0 && !Array.isArray(root.entries) && !Array.isArray(parsed)) {
    return { ok: false, error: 'No entries found in backup file.' };
  }

  const entries: LogEntry[] = [];
  for (let i = 0; i < rawEntries.length; i++) {
    if (!isValidEntry(rawEntries[i])) {
      return { ok: false, error: `Entry at index ${i} has an invalid shape.` };
    }
    entries.push(normaliseEntry(rawEntries[i] as Record<string, unknown>));
  }

  // Absent in v1 backups — default to [] so old backups remain importable.
  const rawComponents: unknown[] = Array.isArray(root.mealComponents) ? (root.mealComponents as unknown[]) : [];
  const mealComponents: MealComponent[] = [];
  for (let i = 0; i < rawComponents.length; i++) {
    if (!isValidMealComponent(rawComponents[i])) {
      return { ok: false, error: `Meal component at index ${i} has an invalid shape.` };
    }
    mealComponents.push(normaliseMealComponent(rawComponents[i] as Record<string, unknown>));
  }

  return { ok: true, entries, mealComponents };
}

// Re-export so callers only need one import.
export { FOOD_TYPES };
