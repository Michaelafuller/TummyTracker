// "What came before" — the reverse of the finding drill-down (drilldown.ts):
// given a rough outcome, list the meals and medications in the preceding
// window, each carrying whatever suspicion the engine's EXISTING findings
// already assign it. Pure, fixture-testable — no React. Read-only: this
// module computes nothing new about causation, it only reads
// computeInsights(entries)'s findings (HANDOFF.md #15 §0 invariant).

import type { LogEntry } from '@/db/schema';
import { FOOD_TYPES } from '@/db/schema';
import type { MedicationJournalItem } from '@/lib/journal';
import { parseTagsJson } from '@/lib/ingredients';
import type { ConfidenceTier } from '@/lib/stats';
import type { Insights } from './insights';

export const LOOKBACK_HOURS = [24, 48, 72] as const;
export type LookbackHours = (typeof LOOKBACK_HOURS)[number];

export interface SuspicionMatch {
  kind: 'food' | 'ingredient' | 'combination';
  label: string; // finding.label — "Wheat Bread", "gluten", "milk + wheat"
  confidence: ConfidenceTier;
}

export type LookbackItem =
  | {
      kind: 'food';
      entry: LogEntry;
      hoursBefore: number;
      /** Strongest match's tier, or null = "No pattern yet". */
      suspicion: ConfidenceTier | null;
      /** Every matching finding, strongest first (high > medium > low, then foods, ingredients, combinations). */
      matches: SuspicionMatch[];
    }
  | { kind: 'medication'; item: MedicationJournalItem; hoursBefore: number | null /* null when time not set */ };

const FOOD_TYPES_SET = new Set(FOOD_TYPES as readonly string[]);
const HOUR_MS = 60 * 60 * 1000;

const TIER_RANK: Record<ConfidenceTier, number> = { high: 3, medium: 2, low: 1 };
const KIND_RANK: Record<SuspicionMatch['kind'], number> = { food: 3, ingredient: 2, combination: 1 };

function sortMatches(matches: SuspicionMatch[]): SuspicionMatch[] {
  return [...matches].sort((a, b) => {
    const tierDiff = TIER_RANK[b.confidence] - TIER_RANK[a.confidence];
    if (tierDiff !== 0) return tierDiff;
    return KIND_RANK[b.kind] - KIND_RANK[a.kind];
  });
}

/**
 * Every existing finding that this food entry matches, mirroring
 * drilldown.ts's grouping exactly: a food finding when the finding's key is
 * the entry's trimmed, lowercased name; an ingredient finding when its key is
 * one of the entry's parsed tags; a combination finding when BOTH tags of its
 * `"a + b"` key (sorted by analyzePairOutcomes, so order-free here too) are
 * in the entry's tags.
 */
function matchesForEntry(
  entry: LogEntry,
  findings: Pick<Insights, 'foodFindings' | 'ingredientFindings' | 'pairFindings'>,
): SuspicionMatch[] {
  const name = entry.name.trim().toLowerCase();
  const tags = new Set(parseTagsJson(entry.tagsJson));
  const matches: SuspicionMatch[] = [];

  for (const finding of findings.foodFindings) {
    if (finding.key === name) {
      matches.push({ kind: 'food', label: finding.label, confidence: finding.confidence });
    }
  }
  for (const finding of findings.ingredientFindings) {
    if (tags.has(finding.key)) {
      matches.push({ kind: 'ingredient', label: finding.label, confidence: finding.confidence });
    }
  }
  for (const finding of findings.pairFindings) {
    const [a, b] = finding.key.split(' + ');
    if (tags.has(a) && tags.has(b)) {
      matches.push({ kind: 'combination', label: finding.label, confidence: finding.confidence });
    }
  }

  return sortMatches(matches);
}

/** Whole hours between `outcomeMs` and an earlier `itemMs`, floored. */
function hoursBetween(outcomeMs: number, itemMs: number): number {
  return Math.floor((outcomeMs - itemMs) / HOUR_MS);
}

function itemTime(item: LookbackItem): number {
  return item.kind === 'food' ? item.entry.loggedAt : item.item.loggedAt;
}

/**
 * The timeline of meals and medications preceding `outcome`, within `hours`
 * of it — closest to the outcome first. Window rule matches the engine's own
 * join (mealsFollowedByOutcome): an item counts when
 * `outcome.loggedAt - windowMs <= item time < outcome.loggedAt` — inclusive
 * at the far edge, strictly before the outcome. Other BMs/symptoms in the
 * window are deliberately excluded (only what was eaten and taken).
 */
export function lookback(
  outcome: LogEntry,
  entries: readonly LogEntry[],
  medicationItems: readonly MedicationJournalItem[],
  findings: Pick<Insights, 'foodFindings' | 'ingredientFindings' | 'pairFindings'>,
  hours: LookbackHours,
): LookbackItem[] {
  const windowMs = hours * HOUR_MS;
  const windowStart = outcome.loggedAt - windowMs;
  const inWindow = (t: number) => t >= windowStart && t < outcome.loggedAt;

  const foodItems: LookbackItem[] = entries
    .filter((entry) => entry.id !== outcome.id && FOOD_TYPES_SET.has(entry.type) && inWindow(entry.loggedAt))
    .map((entry) => {
      const matches = matchesForEntry(entry, findings);
      return {
        kind: 'food' as const,
        entry,
        hoursBefore: hoursBetween(outcome.loggedAt, entry.loggedAt),
        suspicion: matches.length > 0 ? matches[0].confidence : null,
        matches,
      };
    });

  const medItems: LookbackItem[] = medicationItems
    .filter((item) => inWindow(item.loggedAt))
    .map((item) => ({
      kind: 'medication' as const,
      item,
      hoursBefore: item.timeKnown ? hoursBetween(outcome.loggedAt, item.loggedAt) : null,
    }));

  return [...foodItems, ...medItems].sort((a, b) => itemTime(b) - itemTime(a));
}

/** "Just before" (< 1 h) | "3 h before" | "1 day 2 h before" (≥ 24 h). */
export function hoursBeforeLabel(hoursBefore: number): string {
  if (hoursBefore < 1) return 'Just before';
  if (hoursBefore < 24) return `${Math.floor(hoursBefore)} h before`;

  const days = Math.floor(hoursBefore / 24);
  const remHours = Math.floor(hoursBefore % 24);
  const dayLabel = `${days} day${days === 1 ? '' : 's'}`;
  return remHours > 0 ? `${dayLabel} ${remHours} h before` : `${dayLabel} before`;
}
