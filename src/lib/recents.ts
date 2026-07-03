// Pure helper for the Home screen's searchable "Recent" quick-add list
// (CLAUDE.md §8 — pure logic lives in lib/, easiest to unit-test).
import type { LogEntry } from '@/db/schema';

/**
 * Filter/rank `entries` by a case-insensitive query against `name`, for the
 * searchable recents quick-add. An empty query returns the first `limit`
 * entries unchanged (already recency-ordered upstream). Otherwise, prefix
 * matches rank before substring matches; recency order (the incoming array
 * order) is preserved within each rank. Deduping by name is handled upstream
 * (listRecentFoodEntries).
 */
export function filterRecents(entries: LogEntry[], query: string, limit = 6): LogEntry[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) return entries.slice(0, limit);

  const prefixMatches: LogEntry[] = [];
  const substringMatches: LogEntry[] = [];
  for (const entry of entries) {
    const name = entry.name.toLowerCase();
    if (name.startsWith(trimmed)) {
      prefixMatches.push(entry);
    } else if (name.includes(trimmed)) {
      substringMatches.push(entry);
    }
  }

  return [...prefixMatches, ...substringMatches].slice(0, limit);
}
