// Pure serialization/parse helpers for the JSON backup format.
// No filesystem or sharing imports here — kept pure so the logic can be unit-tested.

import { LOG_ENTRY_TYPES, FOOD_TYPES, MEAL_SLOTS, type LogEntry } from '@/db/schema';

export interface BackupFile {
  version: number;
  entries: LogEntry[];
}

export function entriesToJson(entries: LogEntry[]): string {
  const payload: BackupFile = { version: 1, entries };
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
  | { ok: true; entries: LogEntry[] }
  | { ok: false; error: string };

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

  return { ok: true, entries };
}

// Re-export so callers only need one import.
export { FOOD_TYPES };
