// Per-food/ingredient finding drill-down: every log instance behind an
// Insights finding, and whether a rough outcome followed it within the
// temporal window (HANDOFF.md finding drill-down). Pure, fixture-testable —
// no React, sits beside temporal.ts.

import type { LogEntry } from '@/db/schema';
import { FOOD_TYPES } from '@/db/schema';
import { isSentimentValue } from '@/features/sentiment/scale';
import { parseTagsJson } from '@/lib/ingredients';
import { DEFAULT_WINDOW_MS, isOutcome } from './temporal';

export type DrilldownKind = 'food' | 'tag';

export interface DrilldownInstance {
  entry: LogEntry;
  followedByOutcome: boolean;
}

const FOOD_TYPES_SET = new Set(FOOD_TYPES as readonly string[]);

/**
 * Does `entry` belong to the finding identified by `kind`/`value`? Mirrors
 * insights.ts's own grouping exactly: food findings group food entries
 * case-insensitively on the trimmed name; tag findings match the exact
 * normalized tag token (no prefix bleed).
 */
function matchesFinding(entry: LogEntry, kind: DrilldownKind, value: string): boolean {
  // Both kinds count food entries only — tag findings (insights.ts) and
  // temporal "meals" are computed over food entries, so the drill-down list
  // must agree with the finding's own occurrence count.
  if (!FOOD_TYPES_SET.has(entry.type)) return false;
  if (kind === 'food') {
    return entry.name.trim().toLowerCase() === value.trim().toLowerCase();
  }
  return parseTagsJson(entry.tagsJson).includes(value);
}

/**
 * Every log instance behind a food/tag finding, newest first. Each instance
 * is flagged with whether some OTHER entry counts as a rough outcome
 * (temporal's `isOutcome`) within `DEFAULT_WINDOW_MS` strictly after it — an
 * outcome at the exact same instant does not count, and an instance never
 * counts as its own outcome.
 */
export function findingInstances(
  entries: readonly LogEntry[],
  kind: DrilldownKind,
  value: string,
): DrilldownInstance[] {
  const matching = entries.filter((entry) => matchesFinding(entry, kind, value));
  const outcomes = entries.filter(isOutcome);

  const instances: DrilldownInstance[] = matching.map((entry) => ({
    entry,
    followedByOutcome: outcomes.some((outcome) => {
      if (outcome.id === entry.id) return false;
      const delta = outcome.loggedAt - entry.loggedAt;
      return delta > 0 && delta <= DEFAULT_WINDOW_MS;
    }),
  }));

  return instances.sort((a, b) => b.entry.loggedAt - a.entry.loggedAt);
}

export interface DrilldownSummary {
  count: number;
  rated: number;
  avgSentiment: number | null;
  outcomes: number;
}

/** Aggregate stats over a set of drill-down instances for the summary line. */
export function drilldownSummary(instances: readonly DrilldownInstance[]): DrilldownSummary {
  const ratedSentiments = instances
    .map((instance) => instance.entry.sentiment)
    .filter((sentiment): sentiment is number => isSentimentValue(sentiment));

  const avgSentiment =
    ratedSentiments.length > 0
      ? Math.round((ratedSentiments.reduce((sum, s) => sum + s, 0) / ratedSentiments.length) * 10) / 10
      : null;

  return {
    count: instances.length,
    rated: ratedSentiments.length,
    avgSentiment,
    outcomes: instances.filter((instance) => instance.followedByOutcome).length,
  };
}
