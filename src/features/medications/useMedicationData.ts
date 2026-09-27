// Live-query hooks over the medication tables (HANDOFF.md §4), mirroring
// src/features/logging/useEntries.ts's useAllEntries — the Meds tab, history
// and Journal all refresh automatically after a save/delete via Drizzle's
// expo-sqlite change listener, with no manual refetch plumbing.
import { desc } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { medication, medicationDose, medicationEvent, type Medication, type MedicationDose, type MedicationEvent } from '@/db/schema';

/** Every medication, active first then alphabetical (mirrors listMedications' order). */
export function useMedications(): Medication[] {
  const { data } = useLiveQuery(db.select().from(medication).orderBy(desc(medication.isActive), medication.name));
  return data ?? [];
}

/** Every medication_event row, newest first. */
export function useMedicationEvents(): MedicationEvent[] {
  const { data } = useLiveQuery(db.select().from(medicationEvent).orderBy(desc(medicationEvent.takenAt)));
  return data ?? [];
}

/** Every medication_dose row (unordered — callers join it to events/medications as needed). */
export function useMedicationDoses(): MedicationDose[] {
  const { data } = useLiveQuery(db.select().from(medicationDose));
  return data ?? [];
}
