// Run-once driver for the historical tag re-derive backfill (HANDOFF.md
// Phase 2.3). Wires the pure plan (src/lib/tagBackfill.ts) to the real DB and
// the run-once gate in prefs, and is fired fire-and-forget from
// src/components/app-providers.tsx after migrations succeed.
import { listAllMealComponents, listLogEntries, applyTagBackfill } from '@/db/repository';
import type { MealComponent } from '@/db/schema';
import { loadPrefs, savePrefs } from '@/lib/prefs';
import { planTagBackfill } from '@/lib/tagBackfill';

/**
 * Runs the additive-only tag backfill at most once per install. Returns early
 * if `tagBackfillV1Done` is already set. The flag is set ONLY after a
 * successful apply — on throw, the error is swallowed with `console.warn` and
 * the flag is left unset so the next launch retries (safe: the plan is
 * idempotent, so a retry over already-backfilled rows produces no updates).
 */
export async function runTagBackfillOnce(): Promise<void> {
  const prefs = await loadPrefs();
  if (prefs.tagBackfillV1Done) return;

  try {
    const [entries, components] = await Promise.all([listLogEntries(), listAllMealComponents()]);

    const componentsByEntryId = new Map<string, MealComponent[]>();
    for (const component of components) {
      const list = componentsByEntryId.get(component.entryId);
      if (list) {
        list.push(component);
      } else {
        componentsByEntryId.set(component.entryId, [component]);
      }
    }

    const plan = planTagBackfill(entries, componentsByEntryId);
    await applyTagBackfill(plan.entryUpdates, plan.componentUpdates);

    await savePrefs({ ...prefs, tagBackfillV1Done: true });
  } catch (error) {
    console.warn('Tag backfill failed; will retry on next launch.', error);
  }
}
