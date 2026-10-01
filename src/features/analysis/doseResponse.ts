// Dose-response for food / ingredient findings (GitHub #22): do larger amounts
// raise the outcome rate? Pure and fixture-testable — no React. The engine
// itself (insights.ts / temporal.ts) stays amount-blind; screens compose this
// module over the same instances a finding card already uses, so no existing
// number changes.
//
// "Amount" is ALWAYS the stored servings multiplier from `mealComponent` rows
// (missing / null -> 1). It is never inferred from grams, calories or a name.

import type { LogEntry, MealComponent } from '@/db/schema';
import { parseTagsJson } from '@/lib/ingredients';
import { formatDoseNumber } from '@/lib/medications';
import { MIN_GROUP_SIZE } from './insights';

export type DoseKind = 'food' | 'tag';

/** Larger-minus-smaller outcome rate needed before a card shows a dose line. */
export const DOSE_RATE_MARGIN = 0.2;
/** Meals needed on EACH side of the split — the same floor as the nutrient split. */
export const MIN_DOSE_GROUP = MIN_GROUP_SIZE;

// Rates are k/n fractions; the epsilon only absorbs float error so a gap of
// exactly the margin (e.g. 0.6 - 0.4) still counts.
const EPSILON = 1e-9;

function servingsOf(component: MealComponent): number {
  const { servings } = component;
  return typeof servings === 'number' && Number.isFinite(servings) ? servings : 1;
}

/**
 * How much of a food / ingredient one meal contained, in servings.
 * - food finding: total servings of the meal's components (no components -> 1).
 * - ingredient finding: sum of servings of the components whose OWN tags
 *   include `value` (exact tag, as tag findings match). No components, or
 *   components but none carrying the tag (legacy / edited rows) -> 1.
 */
export function mealAmount(
  _entry: LogEntry,
  components: readonly MealComponent[],
  kind: DoseKind,
  value: string,
): number {
  if (components.length === 0) return 1;
  if (kind === 'food') {
    return components.reduce((sum, component) => sum + servingsOf(component), 0);
  }
  const carrying = components.filter((component) => parseTagsJson(component.tagsJson).includes(value));
  if (carrying.length === 0) return 1;
  return carrying.reduce((sum, component) => sum + servingsOf(component), 0);
}

export interface DoseGroup {
  meals: number;
  hits: number;
  rate: number;
}

export interface DoseSplit {
  /** The median amount: smaller = amount <= threshold, larger = amount > threshold. */
  threshold: number;
  smaller: DoseGroup;
  larger: DoseGroup;
  /** larger.rate - smaller.rate >= DOSE_RATE_MARGIN. */
  clearIncrease: boolean;
}

function median(sorted: readonly number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function group(items: readonly { followedByOutcome: boolean }[]): DoseGroup {
  const hits = items.filter((item) => item.followedByOutcome).length;
  return { meals: items.length, hits, rate: items.length === 0 ? 0 : hits / items.length };
}

/**
 * Splits a finding's instances at the median amount and compares outcome
 * rates. Null when every meal has the same amount, or either side has fewer
 * than MIN_DOSE_GROUP meals. If the median equals the largest amount the
 * threshold steps down to the largest amount below it, so "larger" is never
 * empty.
 */
export function doseSplit(
  instances: readonly { entry: LogEntry; followedByOutcome: boolean }[],
  amountOf: (entry: LogEntry) => number,
): DoseSplit | null {
  if (instances.length < 2 * MIN_DOSE_GROUP) return null;
  const measured = instances.map((instance) => ({
    amount: amountOf(instance.entry),
    followedByOutcome: instance.followedByOutcome,
  }));
  const sorted = measured.map((m) => m.amount).sort((a, b) => a - b);
  const max = sorted[sorted.length - 1];

  let threshold = median(sorted);
  if (threshold >= max) {
    const below = sorted.filter((amount) => amount < max);
    if (below.length === 0) return null;
    threshold = below[below.length - 1];
  }

  const smaller = group(measured.filter((m) => m.amount <= threshold));
  const larger = group(measured.filter((m) => m.amount > threshold));
  if (smaller.meals < MIN_DOSE_GROUP || larger.meals < MIN_DOSE_GROUP) return null;

  return {
    threshold,
    smaller,
    larger,
    clearIncrease: larger.rate - smaller.rate >= DOSE_RATE_MARGIN - EPSILON,
  };
}

/** "1 serving", "1.5 servings", "0.5 servings". */
export function formatServings(amount: number): string {
  return `${formatDoseNumber(amount)} ${amount === 1 ? 'serving' : 'servings'}`;
}

function percent(rate: number): number {
  return Math.round(rate * 100);
}

/**
 * The Insights-card line for a clear increase, e.g.
 * "More than 1 serving: 4 of 5 (80%) · 1 or less: 1 of 6 (17%)". Ingredient
 * wording adds "of foods with it" — servings of different foods aren't one dose.
 */
export function doseLine(split: DoseSplit, kind: DoseKind): string {
  const more = `More than ${formatServings(split.threshold)}${kind === 'tag' ? ' of foods with it' : ''}`;
  const { larger, smaller } = split;
  return (
    `${more}: ${larger.hits} of ${larger.meals} (${percent(larger.rate)}%) · ` +
    `${formatDoseNumber(split.threshold)} or less: ${smaller.hits} of ${smaller.meals} (${percent(smaller.rate)}%)`
  );
}

/**
 * The two "By amount" rows on the finding detail screen — numbers only, no
 * verdict.
 */
export function doseRows(split: DoseSplit): { larger: string; smaller: string } {
  const row = (label: string, g: DoseGroup) =>
    `${label}: ${g.hits} of ${g.meals} ${g.meals === 1 ? 'meal' : 'meals'} followed by a rough outcome (${percent(g.rate)}%)`;
  return {
    larger: row(`More than ${formatServings(split.threshold)}`, split.larger),
    smaller: row(`${formatServings(split.threshold)} or less`, split.smaller),
  };
}

/** Groups component rows by their parent entry, once. */
export function groupComponentsByEntry(components: readonly MealComponent[]): Map<string, MealComponent[]> {
  const byEntry = new Map<string, MealComponent[]>();
  for (const component of components) {
    const list = byEntry.get(component.entryId);
    if (list) list.push(component);
    else byEntry.set(component.entryId, [component]);
  }
  return byEntry;
}
