// Pure BM-trend helpers for the Insights "Digestion" section (HANDOFF.md BM
// insights/trends cycle). No React, no Date.now() inside — callers pass `now`
// in so this stays fixture-testable. Mirrors chartData.ts's bucketing.

import type { LogEntry } from '@/db/schema';
import { isBadBristol, isBristolValue } from '@/features/bm/bristol';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function isBm(entry: LogEntry): boolean {
  return entry.type === 'bowel_movement';
}

function startOfDay(epochMs: number): number {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface BmWeekBucket {
  /** e.g. "Jun 22" — the local calendar date the 7-day bucket starts on. */
  label: string;
  /** Number of BM entries logged in this bucket. */
  count: number;
  /** Of those, how many had a "bad" (hard or loose) Bristol reading. */
  badCount: number;
}

/**
 * Rolling 7-day BM-count buckets, anchored on `now`'s local calendar day —
 * same bucketing as `weeklyOutcomes`/`weeklyIntake` in chartData.ts, so week labels line up
 * across charts. Returns `weeks` buckets ordered oldest-first. Entries with a
 * null/invalid `bristolScale` count toward `count` but never `badCount`.
 */
export function weeklyBmCounts(entries: readonly LogEntry[], now: number, weeks = 8): BmWeekBucket[] {
  const todayStart = startOfDay(now);
  const bmEntries = entries.filter(isBm);

  const buckets: BmWeekBucket[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    // Exclusive end: the instant after the bucket's last day.
    const end = todayStart + DAY_MS - w * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;

    const inBucket = bmEntries.filter((e) => e.loggedAt >= start && e.loggedAt < end);
    const badCount = inBucket.filter((e) => isBadBristol(e.bristolScale)).length;

    const d = new Date(start);
    buckets.push({
      label: `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`,
      count: inBucket.length,
      badCount,
    });
  }

  return buckets;
}

/**
 * Counts of BM entries by Bristol value (1..7), over the `weeks * 7`-day
 * window ending today (inclusive). Entries with a null/invalid `bristolScale`
 * are excluded entirely (not just from a "bad" tally).
 */
export function bristolDistribution(entries: readonly LogEntry[], now: number, weeks = 8): number[] {
  const todayStart = startOfDay(now);
  const end = todayStart + DAY_MS;
  const start = end - weeks * 7 * DAY_MS;

  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const entry of entries) {
    if (!isBm(entry)) continue;
    if (entry.loggedAt < start || entry.loggedAt >= end) continue;
    if (!isBristolValue(entry.bristolScale)) continue;
    counts[entry.bristolScale - 1] += 1;
  }

  return counts;
}

export interface BmRegularity {
  total: number;
  perDay: number;
  hard: number;
  typical: number;
  loose: number;
}

/**
 * BM regularity over the last `days` calendar days (inclusive of today).
 * `hard` = Bristol 1-2, `loose` = Bristol 6-7, `typical` = Bristol 3-5
 * (unrated BMs count toward `total` only). Returns `null` when there were no
 * BM entries in the window — there is nothing to summarize yet.
 */
export function bmRegularity(entries: readonly LogEntry[], now: number, days = 28): BmRegularity | null {
  const todayStart = startOfDay(now);
  const end = todayStart + DAY_MS;
  const start = end - days * DAY_MS;

  const inWindow = entries.filter((e) => isBm(e) && e.loggedAt >= start && e.loggedAt < end);
  if (inWindow.length === 0) return null;

  let hard = 0;
  let typical = 0;
  let loose = 0;
  for (const entry of inWindow) {
    const bristol = entry.bristolScale;
    if (!isBristolValue(bristol)) continue;
    if (bristol <= 2) {
      hard += 1;
    } else if (bristol >= 6) {
      loose += 1;
    } else {
      typical += 1;
    }
  }

  return {
    total: inWindow.length,
    perDay: round1(inWindow.length / days),
    hard,
    typical,
    loose,
  };
}
