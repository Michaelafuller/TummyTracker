// Pure matching + per-term stats for the trigger watchlist / elimination mode
// (HANDOFF.md). No React, no I/O — this is where the test leverage lives.

import { FOOD_TYPES, type LogEntry, type WatchlistItem } from '@/db/schema';
import { isSentimentValue } from '@/features/sentiment/scale';
import { normalizeToken, parseTagsJson } from '@/lib/ingredients';
import { mean } from '@/lib/stats';

const MIN_TERM_LENGTH = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Normalizes a user-typed watch term with the same token normalization tag
 * extraction uses (lowercase, strip chars outside `[a-z0-9 -]`, collapse/trim
 * whitespace — see `src/lib/ingredients.ts` `normalizeToken`). Returns null
 * when the normalized result is shorter than two characters (nothing
 * meaningful to match on).
 */
export function normalizeWatchTerm(input: string): string | null {
  const normalized = normalizeToken(input);
  return normalized.length >= MIN_TERM_LENGTH ? normalized : null;
}

/** Escapes regex metacharacters so a raw term can be embedded in a RegExp literal. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Prefix-at-word-boundary matching (the design contract — do not switch this
 * to a plain substring test). A term matches a tag when the tag equals the
 * term outright, OR the term appears in the tag starting at a word boundary:
 * the very start of the tag, or immediately after a space or hyphen.
 *
 * This means `soy` matches `soybeans`, `soy lecithin`, and `hydrolyzed soy
 * protein` — but `milk` does NOT match `buttermilk`, because "milk" there
 * isn't preceded by a boundary, it's mid-word inside "buttermilk". A warning
 * that cries wolf (a false-positive substring hit) erodes trust faster than a
 * missed match disappoints, so word-boundary precision beats substring recall
 * here — the inverse trade-off from the additive-tags extraction policy.
 *
 * Multi-word terms work the same way: `soy protein` matches `isolated soy
 * protein` because "soy protein" begins right after the space following
 * "isolated".
 */
export function matchesWatchTerm(tag: string, term: string): boolean {
  if (term.length === 0 || tag.length === 0) return false;
  if (tag === term) return true;
  const pattern = new RegExp(`(?:^|[ -])${escapeRegExp(term)}`);
  return pattern.test(tag);
}

export interface WatchedTagMatch {
  item: WatchlistItem;
  matchedTags: string[];
}

/**
 * Which watched terms an entry trips, with the specific tags that matched
 * (for banner/notice copy, e.g. "soy — matched: soybeans"). Empty array when
 * `tagsJson` is null/empty or no watched term matches any tag.
 */
export function findWatchedTags(
  tagsJson: string | null,
  items: readonly WatchlistItem[],
): WatchedTagMatch[] {
  const tags = parseTagsJson(tagsJson);
  if (tags.length === 0 || items.length === 0) return [];

  const results: WatchedTagMatch[] = [];
  for (const item of items) {
    const matchedTags = tags.filter((tag) => matchesWatchTerm(tag, item.term));
    if (matchedTags.length > 0) results.push({ item, matchedTags });
  }
  return results;
}

function isFoodEntry(entry: LogEntry): boolean {
  return (FOOD_TYPES as readonly string[]).includes(entry.type);
}

function entryMatchesTerm(entry: LogEntry, term: string): boolean {
  return parseTagsJson(entry.tagsJson).some((tag) => matchesWatchTerm(tag, term));
}

export interface WatchStats {
  /** Matching food entries logged since watching started (loggedAt >= item.createdAt). */
  timesSinceWatch: number;
  /** Most recent loggedAt among ALL matching food entries (all-time), or null if never eaten. */
  lastEatenAt: number | null;
  /** Full days from max(lastEatenAt, item.createdAt) to `now`; never negative. */
  cleanDays: number;
  /** Average sentiment over matching RATED food entries, all-time; null if none rated. */
  avgSentiment: number | null;
  ratedCount: number;
}

/**
 * Per-term stats computed over food-type parent rows only (never component
 * rows — mirrors how `src/features/analysis/insights.ts` reads tags).
 * `now` is a parameter, not `Date.now()`, so this stays pure and testable.
 */
export function computeWatchStats(
  item: WatchlistItem,
  entries: readonly LogEntry[],
  now: number,
): WatchStats {
  const matchingFood = entries.filter((entry) => isFoodEntry(entry) && entryMatchesTerm(entry, item.term));

  const timesSinceWatch = matchingFood.filter((entry) => entry.loggedAt >= item.createdAt).length;

  const lastEatenAt = matchingFood.reduce<number | null>(
    (max, entry) => (max == null || entry.loggedAt > max ? entry.loggedAt : max),
    null,
  );

  const cleanSinceMs = Math.max(lastEatenAt ?? item.createdAt, item.createdAt);
  const cleanDays = Math.max(0, Math.floor((now - cleanSinceMs) / DAY_MS));

  const ratedSentiments = matchingFood
    .map((entry) => entry.sentiment)
    .filter((sentiment): sentiment is number => isSentimentValue(sentiment));

  return {
    timesSinceWatch,
    lastEatenAt,
    cleanDays,
    avgSentiment: ratedSentiments.length > 0 ? mean(ratedSentiments) : null,
    ratedCount: ratedSentiments.length,
  };
}
