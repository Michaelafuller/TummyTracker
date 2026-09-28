// Live-query hooks over the `experiment` table (GitHub #19) — mirrors
// src/features/checkin/useDayCheckIns.ts. Kept separate from engine.ts (pure,
// no React) and repository.ts (no React) so each stays independently testable.
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { experiment, type Experiment } from '@/db/schema';

/** The current `active` experiment, live — undefined when none is running (at most one, invariant). */
export function useActiveExperiment(): Experiment | undefined {
  const { data } = useLiveQuery(db.select().from(experiment).where(eq(experiment.status, 'active')).limit(1));
  return data?.[0];
}

/** A single experiment by id, live — undefined until it loads or if the id doesn't resolve. */
export function useExperiment(id: string): Experiment | undefined {
  const { data } = useLiveQuery(db.select().from(experiment).where(eq(experiment.id, id)).limit(1));
  return data?.[0];
}
