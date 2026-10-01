// Pure model for the Home "Add details" chips (GitHub #23): the options each
// factor offers, and the collapsed one-line summary. No React, no I/O.

import type { AlcoholLevel, CaffeineLevel, SleepLevel } from '@/db/schema';
import type { FactorRow } from '@/features/analysis/factors';

export interface ChipOption<T> {
  value: T;
  /** Visible chip text. */
  label: string;
}

export const SLEEP_OPTIONS: readonly ChipOption<SleepLevel>[] = [
  { value: 'poor', label: 'Poor' },
  { value: 'ok', label: 'OK' },
  { value: 'good', label: 'Good' },
];

export const STRESS_OPTIONS: readonly ChipOption<number>[] = [1, 2, 3, 4, 5].map((n) => ({
  value: n,
  label: String(n),
}));

export const ALCOHOL_OPTIONS: readonly ChipOption<AlcoholLevel>[] = [
  { value: 'none', label: 'None' },
  { value: 'some', label: 'Some' },
  { value: 'a_lot', label: 'A lot' },
];

export const CAFFEINE_OPTIONS: readonly ChipOption<CaffeineLevel>[] = [
  { value: 'none', label: 'None' },
  { value: 'usual', label: 'Usual' },
  { value: 'more', label: 'More' },
];

export const PERIOD_OPTIONS: readonly ChipOption<boolean>[] = [
  { value: true, label: 'Yes' },
  { value: false, label: 'No' },
];

const SLEEP_SUMMARY: Record<SleepLevel, string> = { poor: 'Poor sleep', ok: 'OK sleep', good: 'Good sleep' };
const ALCOHOL_SUMMARY: Record<AlcoholLevel, string> = {
  none: 'No alcohol',
  some: 'Some alcohol',
  a_lot: 'A lot of alcohol',
};
const CAFFEINE_SUMMARY: Record<CaffeineLevel, string> = {
  none: 'No caffeine',
  usual: 'Usual caffeine',
  more: 'More caffeine',
};

/**
 * "Stress 4 · Poor sleep" — the details logged for the day, in a fixed order
 * (stress, sleep, alcohol, caffeine, period), or null when nothing is set.
 * Period is mentioned only while period tracking is on.
 */
export function factorSummary(row: FactorRow | undefined, opts: { trackPeriod: boolean }): string | null {
  if (!row) return null;
  const parts: string[] = [];
  if (row.stress != null) parts.push(`Stress ${row.stress}`);
  if (row.sleep != null) parts.push(SLEEP_SUMMARY[row.sleep]);
  if (row.alcohol != null) parts.push(ALCOHOL_SUMMARY[row.alcohol]);
  if (row.caffeine != null) parts.push(CAFFEINE_SUMMARY[row.caffeine]);
  if (opts.trackPeriod && row.period != null) parts.push(row.period ? 'Period' : 'No period');
  return parts.length > 0 ? parts.join(' · ') : null;
}
