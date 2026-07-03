// Pure chart-data helpers for Insights v2 (HANDOFF.md Phase 3.2/3.3). No React,
// no Date.now() inside — callers pass `now` in so this stays fixture-testable.

import type { LogEntry } from '@/db/schema';
import { FOOD_TYPES } from '@/db/schema';
import { isSentimentValue } from '@/features/sentiment/scale';
import { mean } from '@/lib/stats';

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

export interface WeekBucket {
  /** e.g. "Jun 22" — the local calendar date the 7-day bucket starts on. */
  label: string;
  /** Mean sentiment of rated food entries in this bucket, or null if none. */
  avg: number | null;
  /** Number of rated food entries in this bucket. */
  count: number;
}

/**
 * Rolling 7-day sentiment buckets, anchored on `now`'s local calendar day: the
 * most recent bucket spans [today - 6 days, today] inclusive, and each earlier
 * bucket is the preceding 7-day window, tiling backward with no gaps. Returns
 * `weeks` buckets ordered oldest-first (left-to-right chart order). Buckets
 * with no rated food entries get `avg: null` (rendered as an empty slot, not
 * zero — no data is not the same as a rating of zero).
 */
export function weeklySentiment(
  entries: readonly LogEntry[],
  now: number,
  weeks = 8,
): WeekBucket[] {
  const todayStart = startOfDay(now);
  const ratedFood = entries.filter((e) => isFood(e) && isSentimentValue(e.sentiment));

  const buckets: WeekBucket[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    // Exclusive end: the instant after the bucket's last day.
    const end = todayStart + DAY_MS - w * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;

    const sentiments = ratedFood
      .filter((e) => e.loggedAt >= start && e.loggedAt < end)
      .map((e) => e.sentiment as number);

    const d = new Date(start);
    buckets.push({
      label: `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`,
      avg: sentiments.length > 0 ? round1(mean(sentiments)) : null,
      count: sentiments.length,
    });
  }

  return buckets;
}
