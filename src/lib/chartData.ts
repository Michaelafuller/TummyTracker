// Pure chart-data helpers for Insights v2 (HANDOFF.md Phase 3.2/3.3). No React,
// no Date.now() inside — callers pass `now` in so this stays fixture-testable.

import type { LogEntry } from '@/db/schema';
import { FOOD_TYPES } from '@/db/schema';
import { isOutcome } from '@/features/analysis/temporal';
import type { NutritionField } from '@/lib/validation';
import type { BmWeekBucket } from '@/lib/bmTrends';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function isFood(entry: LogEntry): boolean {
  return (FOOD_TYPES as readonly string[]).includes(entry.type);
}

function startOfDay(epochMs: number): number {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface IntakeWeekBucket {
  /** e.g. "Jun 22" — the local calendar date the 7-day bucket starts on. */
  label: string;
  /** Average daily value of `field` across the 7-day bucket, or null if none. */
  avg: number | null;
}

/**
 * Rolling 7-day intake buckets for a single nutrition field, using the same
 * bucketing as `weeklyOutcomes`/`weeklyBmCounts` (identical labels so the
 * weekly charts line up). Per bucket: sum `field` across food entries that
 * carry a non-null
 * finite value for it, divide by 7 to get an average-per-day figure
 * comparable to the Goals tab's daily framing. `avg: null` when the bucket
 * has no food entry with a value for `field` (no data is not the same as
 * zero intake); a bucket where logged values sum to 0 yields `avg: 0`.
 */
export function weeklyIntake(
  entries: readonly LogEntry[],
  now: number,
  field: NutritionField,
  weeks = 8,
): IntakeWeekBucket[] {
  const todayStart = startOfDay(now);
  const food = entries.filter(isFood);

  const buckets: IntakeWeekBucket[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    // Exclusive end: the instant after the bucket's last day.
    const end = todayStart + DAY_MS - w * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;

    const values = food
      .filter((e) => e.loggedAt >= start && e.loggedAt < end)
      .map((e) => e[field])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    const d = new Date(start);
    buckets.push({
      label: `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`,
      avg: values.length > 0 ? round1(values.reduce((sum, v) => sum + v, 0) / 7) : null,
    });
  }

  return buckets;
}

/**
 * Rolling 7-day rough-outcome (`isOutcome` — see `@/features/analysis/temporal`)
 * count buckets, using the identical bucketing/labels as `weeklyIntake`/
 * `weeklyBmCounts` (so week labels line up across all three charts). Returns
 * `BmWeekBucket`s — the shape `CountBars` already renders — with `badCount`
 * set equal to `count`: every rough outcome is itself the "bad" event this
 * chart exists to surface, so the whole bar renders in CountBars' danger
 * color rather than being split.
 */
export function weeklyOutcomes(entries: readonly LogEntry[], now: number, weeks = 8): BmWeekBucket[] {
  const todayStart = startOfDay(now);
  const outcomes = entries.filter(isOutcome);

  const buckets: BmWeekBucket[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    // Exclusive end: the instant after the bucket's last day.
    const end = todayStart + DAY_MS - w * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;

    const count = outcomes.filter((e) => e.loggedAt >= start && e.loggedAt < end).length;

    const d = new Date(start);
    buckets.push({
      label: `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`,
      count,
      badCount: count,
    });
  }

  return buckets;
}
