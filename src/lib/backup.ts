// Pure serialization/parse helpers for the JSON backup format.
// No filesystem or sharing imports here — kept pure so the logic can be unit-tested.

import {
  DAY_STATUSES,
  LOG_ENTRY_TYPES,
  FOOD_TYPES,
  MEAL_SLOTS,
  type DayCheckIn,
  type LogEntry,
  type MealComponent,
  type Medication,
  type MedicationDose,
  type MedicationEvent,
} from '@/db/schema';

export interface BackupFile {
  version: number;
  entries: LogEntry[];
  /** Absent in v1 backups (pre meal-builder) and treated as [] on import. */
  mealComponents?: MealComponent[];
  /** Absent before v3 (pre medications, HANDOFF.md Cycle A) and treated as [] on import. */
  medications?: Medication[];
  medicationEvents?: MedicationEvent[];
  medicationDoses?: MedicationDose[];
  /** Absent before v4 (pre day-check-in, GitHub #13) and treated as [] on import. */
  dayCheckIns?: DayCheckIn[];
}

/**
 * Serializes entries + their mealComponent rows, the medication inventory and
 * history, and the day check-in answers (GitHub #13 backup v4). Version
 * bumps to 4 but `parseBackupJson` still reads v1/v2/v3 files (missing keys)
 * by defaulting every new array to empty — old backups remain importable.
 */
export function entriesToJson(
  entries: LogEntry[],
  mealComponents: MealComponent[] = [],
  medications: Medication[] = [],
  medicationEvents: MedicationEvent[] = [],
  medicationDoses: MedicationDose[] = [],
  dayCheckIns: DayCheckIn[] = [],
): string {
  const payload: BackupFile = {
    version: 4,
    entries,
    mealComponents,
    medications,
    medicationEvents,
    medicationDoses,
    dayCheckIns,
  };
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
  | {
      ok: true;
      entries: LogEntry[];
      mealComponents: MealComponent[];
      medications: Medication[];
      medicationEvents: MedicationEvent[];
      medicationDoses: MedicationDose[];
      dayCheckIns: DayCheckIn[];
    }
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

function isValidMedication(v: unknown): v is Medication {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  if (!isString(r.id) || r.id.length === 0) return false;
  if (!isString(r.name)) return false;
  if (typeof r.createdAt !== 'number') return false;
  if (typeof r.updatedAt !== 'number') return false;
  return true;
}

/** Normalises a medication from the backup so optional absent fields become null/defaults. */
function normaliseMedication(v: Record<string, unknown>): Medication {
  const nullable = <T>(key: string): T | null => (v[key] !== undefined ? v[key] : null) as T | null;
  return {
    id: v.id as string,
    name: v.name as string,
    defaultDose: nullable<number>('defaultDose'),
    doseUnit: nullable<string>('doseUnit'),
    frequency: nullable<string>('frequency'),
    startDate: nullable<number>('startDate'),
    endDate: nullable<number>('endDate'),
    isActive: typeof v.isActive === 'boolean' ? v.isActive : true,
    notes: nullable<string>('notes'),
    createdAt: v.createdAt as number,
    updatedAt: v.updatedAt as number,
  };
}

function isValidMedicationEvent(v: unknown): v is MedicationEvent {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  if (!isString(r.id) || r.id.length === 0) return false;
  if (typeof r.takenAt !== 'number') return false;
  if (typeof r.createdAt !== 'number') return false;
  if (typeof r.updatedAt !== 'number') return false;
  return true;
}

/** Normalises a medicationEvent from the backup so optional absent fields become null/defaults. */
function normaliseMedicationEvent(v: Record<string, unknown>): MedicationEvent {
  const nullable = <T>(key: string): T | null => (v[key] !== undefined ? v[key] : null) as T | null;
  return {
    id: v.id as string,
    takenAt: v.takenAt as number,
    timeKnown: typeof v.timeKnown === 'boolean' ? v.timeKnown : true,
    notes: nullable<string>('notes'),
    createdAt: v.createdAt as number,
    updatedAt: v.updatedAt as number,
  };
}

function isValidMedicationDose(v: unknown): v is MedicationDose {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  if (!isString(r.id) || r.id.length === 0) return false;
  if (!isString(r.eventId) || r.eventId.length === 0) return false;
  if (!isString(r.medicationId) || r.medicationId.length === 0) return false;
  if (typeof r.dose !== 'number') return false;
  if (!isString(r.doseUnit)) return false;
  if (typeof r.createdAt !== 'number') return false;
  if (typeof r.updatedAt !== 'number') return false;
  return true;
}

/** Normalises a medicationDose from the backup. Every field here is required (no nullable columns). */
function normaliseMedicationDose(v: Record<string, unknown>): MedicationDose {
  return {
    id: v.id as string,
    eventId: v.eventId as string,
    medicationId: v.medicationId as string,
    dose: v.dose as number,
    doseUnit: v.doseUnit as string,
    createdAt: v.createdAt as number,
    updatedAt: v.updatedAt as number,
  };
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDayCheckIn(v: unknown): v is DayCheckIn {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  if (!isString(r.id) || r.id.length === 0) return false;
  if (!isString(r.date) || !DATE_KEY_RE.test(r.date)) return false;
  if (!(DAY_STATUSES as readonly string[]).includes(r.status as string)) return false;
  if (typeof r.createdAt !== 'number') return false;
  if (typeof r.updatedAt !== 'number') return false;
  return true;
}

/** Normalises a dayCheckIn from the backup. Every field here is required (no nullable columns). */
function normaliseDayCheckIn(v: Record<string, unknown>): DayCheckIn {
  return {
    id: v.id as string,
    date: v.date as string,
    status: v.status as DayCheckIn['status'],
    createdAt: v.createdAt as number,
    updatedAt: v.updatedAt as number,
  };
}

/**
 * Parses a backup file, accepting both the legacy v1 shape (no mealComponents
 * key — imports with an empty component list) and the v2/v3/v4 shapes
 * produced by entriesToJson. Also accepts a bare entries array for maximum
 * backward compat.
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

  // Absent before v3 — default to [] so v1/v2 backups remain importable.
  const rawMedications: unknown[] = Array.isArray(root.medications) ? (root.medications as unknown[]) : [];
  const medications: Medication[] = [];
  for (let i = 0; i < rawMedications.length; i++) {
    if (!isValidMedication(rawMedications[i])) {
      return { ok: false, error: `Medication at index ${i} has an invalid shape.` };
    }
    medications.push(normaliseMedication(rawMedications[i] as Record<string, unknown>));
  }

  const rawMedicationEvents: unknown[] = Array.isArray(root.medicationEvents)
    ? (root.medicationEvents as unknown[])
    : [];
  const medicationEvents: MedicationEvent[] = [];
  for (let i = 0; i < rawMedicationEvents.length; i++) {
    if (!isValidMedicationEvent(rawMedicationEvents[i])) {
      return { ok: false, error: `Medication event at index ${i} has an invalid shape.` };
    }
    medicationEvents.push(normaliseMedicationEvent(rawMedicationEvents[i] as Record<string, unknown>));
  }

  const rawMedicationDoses: unknown[] = Array.isArray(root.medicationDoses)
    ? (root.medicationDoses as unknown[])
    : [];
  const medicationDoses: MedicationDose[] = [];
  for (let i = 0; i < rawMedicationDoses.length; i++) {
    if (!isValidMedicationDose(rawMedicationDoses[i])) {
      return { ok: false, error: `Medication dose at index ${i} has an invalid shape.` };
    }
    medicationDoses.push(normaliseMedicationDose(rawMedicationDoses[i] as Record<string, unknown>));
  }

  // Absent before v4 — default to [] so v1/v2/v3 backups remain importable.
  const rawDayCheckIns: unknown[] = Array.isArray(root.dayCheckIns) ? (root.dayCheckIns as unknown[]) : [];
  const dayCheckIns: DayCheckIn[] = [];
  for (let i = 0; i < rawDayCheckIns.length; i++) {
    if (!isValidDayCheckIn(rawDayCheckIns[i])) {
      return { ok: false, error: `Day check-in at index ${i} has an invalid shape.` };
    }
    dayCheckIns.push(normaliseDayCheckIn(rawDayCheckIns[i] as Record<string, unknown>));
  }

  return { ok: true, entries, mealComponents, medications, medicationEvents, medicationDoses, dayCheckIns };
}

// Re-export so callers only need one import.
export { FOOD_TYPES };

/**
 * Dose rows a restore may insert: only those whose event this same restore
 * inserted. An event that already exists on the device is the source of truth
 * for its own doses — editing an entry replaces its dose rows with fresh ids,
 * so an older backup's dose rows for that event would otherwise be merged in
 * as duplicates/stale doses. The event is the unit of restore.
 */
export function dosesForRestoredEvents<T extends { eventId: string }>(
  doses: readonly T[],
  insertedEventIds: readonly string[],
): T[] {
  const inserted = new Set(insertedEventIds);
  return doses.filter((dose) => inserted.has(dose.eventId));
}
