import type { LogEntry, WatchlistItem } from '@/db/schema';
import {
  computeWatchStats,
  describeWatchedMatches,
  findWatchedTags,
  findWatchedTagsInTags,
  matchesWatchTerm,
  normalizeWatchTerm,
} from '../watchlist';

function watchItem(term: string, createdAt = 0): WatchlistItem {
  return { id: `w-${term}`, term, createdAt };
}

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'e1',
    type: 'meal',
    mealSlot: null,
    name: 'Meal',
    barcode: null,
    loggedAt: 0,
    sentiment: null,
    bristolScale: null,
    symptomType: null,
    severity: null,
    notes: null,
    ingredientsText: null,
    tagsJson: null,
    servingG: null,
    calories: null,
    fatG: null,
    saturatedFatG: null,
    carbsG: null,
    proteinG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    componentCount: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('normalizeWatchTerm', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeWatchTerm('  SOY! ')).toBe('soy');
    expect(normalizeWatchTerm('E-322')).toBe('e-322');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeWatchTerm('soy   protein')).toBe('soy protein');
  });

  it('returns null for input shorter than 2 chars after normalizing', () => {
    expect(normalizeWatchTerm('a')).toBeNull();
    expect(normalizeWatchTerm('')).toBeNull();
    expect(normalizeWatchTerm('!')).toBeNull();
  });

  it('keeps a valid 2-char term', () => {
    expect(normalizeWatchTerm('soy')).toBe('soy');
  });
});

describe('matchesWatchTerm', () => {
  it('matches an exact tag', () => {
    expect(matchesWatchTerm('soy', 'soy')).toBe(true);
  });

  it('matches a tag that starts with the term (word start)', () => {
    expect(matchesWatchTerm('soybeans', 'soy')).toBe(true);
  });

  it('matches the term at a mid-tag word boundary after a space', () => {
    expect(matchesWatchTerm('hydrolyzed soy protein', 'soy')).toBe(true);
  });

  it('matches the term at a mid-tag word boundary after a hyphen', () => {
    expect(matchesWatchTerm('non-dairy creamer', 'dairy')).toBe(true);
  });

  it('does NOT match milk against buttermilk (mid-word, no boundary)', () => {
    expect(matchesWatchTerm('buttermilk', 'milk')).toBe(false);
  });

  it('matches a multi-word term against a longer tag starting at a boundary', () => {
    expect(matchesWatchTerm('isolated soy protein', 'soy protein')).toBe(true);
  });

  it('does not match a multi-word term when word order differs', () => {
    expect(matchesWatchTerm('protein soy isolate', 'soy protein')).toBe(false);
  });

  it('treats regex-special characters in the term as literal', () => {
    expect(matchesWatchTerm('contains e322 (sodium) blend', 'e322 (sodium)')).toBe(true);
    // A literal '.' must not act as a regex wildcard matching any character.
    expect(matchesWatchTerm('snack with axb filler', 'a.b')).toBe(false);
    expect(matchesWatchTerm('snack with a.b filler', 'a.b')).toBe(true);
  });

  it('is case/whitespace sensitive to its inputs (callers normalize first)', () => {
    expect(matchesWatchTerm('Soybeans', 'soy')).toBe(false);
  });

  it('returns false for an empty tag or term', () => {
    expect(matchesWatchTerm('', 'soy')).toBe(false);
    expect(matchesWatchTerm('soybeans', '')).toBe(false);
  });
});

describe('findWatchedTags', () => {
  const items = [watchItem('soy'), watchItem('dairy')];

  it('returns matched terms with their matching tags', () => {
    const result = findWatchedTags(JSON.stringify(['soybeans', 'onion']), items);
    expect(result).toEqual([{ item: items[0], matchedTags: ['soybeans'] }]);
  });

  it('returns multiple entries when several terms match', () => {
    const result = findWatchedTags(JSON.stringify(['soy lecithin', 'non-dairy']), items);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.item.term).sort()).toEqual(['dairy', 'soy']);
  });

  it('returns empty array for null tagsJson', () => {
    expect(findWatchedTags(null, items)).toEqual([]);
  });

  it('returns empty array when no watchlist items', () => {
    expect(findWatchedTags(JSON.stringify(['soybeans']), [])).toEqual([]);
  });

  it('returns empty array when no tag matches', () => {
    expect(findWatchedTags(JSON.stringify(['buttermilk', 'onion']), [watchItem('milk')])).toEqual([]);
  });
});

describe('computeWatchStats', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('timesSinceWatch only counts matching entries at/after createdAt', () => {
    const item = watchItem('soy', 100);
    const entries = [
      entry({ tagsJson: '["soybeans"]', loggedAt: 50 }), // before watch started
      entry({ tagsJson: '["soybeans"]', loggedAt: 100 }), // exactly at watch start
      entry({ tagsJson: '["soybeans"]', loggedAt: 200 }), // after
    ];
    const stats = computeWatchStats(item, entries, 1000);
    expect(stats.timesSinceWatch).toBe(2);
  });

  it('cleanDays counts from the last-eaten date when eaten after watching began', () => {
    const item = watchItem('soy', 0);
    const entries = [entry({ tagsJson: '["soybeans"]', loggedAt: 2 * DAY })];
    const now = 5 * DAY;
    const stats = computeWatchStats(item, entries, now);
    expect(stats.lastEatenAt).toBe(2 * DAY);
    expect(stats.cleanDays).toBe(3);
  });

  it('cleanDays counts from watch start ("clean since watching") when never eaten', () => {
    const item = watchItem('soy', 1 * DAY);
    const entries: LogEntry[] = [];
    const now = 4 * DAY;
    const stats = computeWatchStats(item, entries, now);
    expect(stats.lastEatenAt).toBeNull();
    expect(stats.cleanDays).toBe(3);
  });

  it('cleanDays counts from watch start when only eaten before watching began', () => {
    const item = watchItem('soy', 3 * DAY);
    const entries = [entry({ tagsJson: '["soybeans"]', loggedAt: 1 * DAY })];
    const now = 6 * DAY;
    const stats = computeWatchStats(item, entries, now);
    expect(stats.lastEatenAt).toBe(1 * DAY);
    expect(stats.cleanDays).toBe(3);
  });

  it('cleanDays is never negative', () => {
    const item = watchItem('soy', 5 * DAY);
    const entries = [entry({ tagsJson: '["soybeans"]', loggedAt: 5 * DAY })];
    const now = 5 * DAY + 1;
    const stats = computeWatchStats(item, entries, now);
    expect(stats.cleanDays).toBe(0);
  });

  it('avgSentiment/ratedCount exclude unrated matching entries', () => {
    const item = watchItem('soy', 0);
    const entries = [
      entry({ tagsJson: '["soybeans"]', loggedAt: 1, sentiment: 2 }),
      entry({ tagsJson: '["soybeans"]', loggedAt: 2, sentiment: null }),
      entry({ tagsJson: '["soybeans"]', loggedAt: 3, sentiment: 4 }),
    ];
    const stats = computeWatchStats(item, entries, 100);
    expect(stats.ratedCount).toBe(2);
    expect(stats.avgSentiment).toBe(3);
  });

  it('avgSentiment is null when no matching entries are rated', () => {
    const item = watchItem('soy', 0);
    const entries = [entry({ tagsJson: '["soybeans"]', loggedAt: 1, sentiment: null })];
    const stats = computeWatchStats(item, entries, 100);
    expect(stats.avgSentiment).toBeNull();
    expect(stats.ratedCount).toBe(0);
  });

  it('ignores non-food (bowel_movement/symptom) rows even if tags match', () => {
    const item = watchItem('soy', 0);
    const entries = [
      entry({ type: 'bowel_movement', tagsJson: '["soybeans"]', loggedAt: 1, sentiment: 5 }),
      entry({ type: 'symptom', tagsJson: '["soybeans"]', loggedAt: 2, sentiment: 5 }),
    ];
    const stats = computeWatchStats(item, entries, 100);
    expect(stats.timesSinceWatch).toBe(0);
    expect(stats.lastEatenAt).toBeNull();
    expect(stats.ratedCount).toBe(0);
  });

  it('avgSentiment is all-time, not limited to entries since watching began', () => {
    const item = watchItem('soy', 5);
    const entries = [entry({ tagsJson: '["soybeans"]', loggedAt: 1, sentiment: 1 })]; // before watch start
    const stats = computeWatchStats(item, entries, 100);
    expect(stats.timesSinceWatch).toBe(0);
    expect(stats.ratedCount).toBe(1);
    expect(stats.avgSentiment).toBe(1);
  });
});

describe('findWatchedTagsInTags', () => {
  const items = [watchItem('soy'), watchItem('dairy')];

  it('matches against a plain tag array (pre-save union of component tags)', () => {
    const result = findWatchedTagsInTags(['soy lecithin', 'onion'], items);
    expect(result).toEqual([{ item: items[0], matchedTags: ['soy lecithin'] }]);
  });

  it('returns empty array for an empty tag array', () => {
    expect(findWatchedTagsInTags([], items)).toEqual([]);
  });

  it('returns empty array when no watchlist items', () => {
    expect(findWatchedTagsInTags(['soybeans'], [])).toEqual([]);
  });

  it('agrees with findWatchedTags for the same tags via tagsJson', () => {
    const tags = ['soybeans', 'non-dairy'];
    expect(findWatchedTagsInTags(tags, items)).toEqual(findWatchedTags(JSON.stringify(tags), items));
  });
});

describe('describeWatchedMatches', () => {
  it('shows a bare term when its only match is itself', () => {
    const matches = [{ item: watchItem('soy'), matchedTags: ['soy'] }];
    expect(describeWatchedMatches(matches)).toBe('soy');
  });

  it('shows "term — matched: tags" when the matched tags differ from the term', () => {
    const matches = [{ item: watchItem('soy'), matchedTags: ['soybeans', 'soy lecithin'] }];
    expect(describeWatchedMatches(matches)).toBe('soy — matched: soybeans, soy lecithin');
  });

  it('joins multiple matches with a comma', () => {
    const matches = [
      { item: watchItem('soy'), matchedTags: ['soybeans'] },
      { item: watchItem('dairy'), matchedTags: ['dairy'] },
    ];
    expect(describeWatchedMatches(matches)).toBe('soy — matched: soybeans, dairy');
  });

  it('returns an empty string for no matches', () => {
    expect(describeWatchedMatches([])).toBe('');
  });
});
