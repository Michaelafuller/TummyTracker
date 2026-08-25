import type { LogEntry } from '@/db/schema';
import { bmRegularity, bristolDistribution, weeklyBmCounts } from '../bmTrends';

let seq = 0;
function makeEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: `e${seq++}`,
    type: 'bowel_movement',
    mealSlot: null,
    name: 'BM',
    barcode: null,
    loggedAt: 0,
    sentiment: null,
    bristolScale: null,
    symptomType: null,
    severity: null,
    notes: null,
    calories: null,
    fatG: null,
    saturatedFatG: null,
    carbsG: null,
    proteinG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    servingG: null,
    ingredientsText: null,
    tagsJson: null,
    componentCount: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

// "Now" = local Jul 2, 2026, 10:00. The current 7-day bucket therefore spans
// [Jun 26 00:00, Jul 3 00:00) and the prior bucket spans [Jun 19 00:00, Jun 26 00:00).
const NOW = new Date(2026, 6, 2, 10, 0, 0).getTime();

describe('weeklyBmCounts', () => {
  it('buckets BM entries into rolling 7-day windows anchored on now, oldest first, tiling with no gaps', () => {
    const entries = [
      // Current week (Jun 26 - Jul 2): two BMs, one bad (bristol 2).
      makeEntry({ loggedAt: new Date(2026, 5, 30, 12, 0, 0).getTime(), bristolScale: 2 }),
      makeEntry({ loggedAt: new Date(2026, 6, 1, 8, 0, 0).getTime(), bristolScale: 4 }),
      // Prior week (Jun 19 - Jun 25): one BM, bad (bristol 7).
      makeEntry({ loggedAt: new Date(2026, 5, 20, 9, 0, 0).getTime(), bristolScale: 7 }),
    ];

    const buckets = weeklyBmCounts(entries, NOW, 2);

    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toEqual({ label: 'Jun 19', count: 1, badCount: 1 });
    expect(buckets[1]).toEqual({ label: 'Jun 26', count: 2, badCount: 1 });
  });

  it('counts an entry logged today in the last (current) bucket', () => {
    const entries = [makeEntry({ loggedAt: new Date(2026, 6, 2, 7, 0, 0).getTime(), bristolScale: 4 })];
    const buckets = weeklyBmCounts(entries, NOW, 2);
    expect(buckets[1].count).toBe(1);
    expect(buckets[0].count).toBe(0);
  });

  it('tiles 8 weeks back with no gaps by default', () => {
    const buckets = weeklyBmCounts([], NOW);
    expect(buckets).toHaveLength(8);
    expect(buckets[7].label).toBe('Jun 26');
    expect(buckets[0].label).toBe('May 8');
  });

  it('counts null/invalid bristolScale toward count but never badCount', () => {
    const entries = [
      makeEntry({ loggedAt: new Date(2026, 6, 1, 8, 0, 0).getTime(), bristolScale: null }),
      makeEntry({ loggedAt: new Date(2026, 6, 1, 9, 0, 0).getTime(), bristolScale: 9 as unknown as number }),
    ];
    const buckets = weeklyBmCounts(entries, NOW, 1);
    expect(buckets[0]).toEqual({ label: 'Jun 26', count: 2, badCount: 0 });
  });

  it('classifies bristol 1, 2, 6, 7 as bad and 3, 4, 5 as not bad', () => {
    const entries = [1, 2, 3, 4, 5, 6, 7].map((bristolScale) =>
      makeEntry({ loggedAt: new Date(2026, 6, 1, 8, 0, 0).getTime(), bristolScale }),
    );
    const buckets = weeklyBmCounts(entries, NOW, 1);
    expect(buckets[0]).toEqual({ label: 'Jun 26', count: 7, badCount: 4 });
  });

  it('ignores non-BM entries', () => {
    const entries = [
      makeEntry({ loggedAt: new Date(2026, 6, 1, 8, 0, 0).getTime(), type: 'meal', bristolScale: null }),
    ];
    const buckets = weeklyBmCounts(entries, NOW, 1);
    expect(buckets[0]).toEqual({ label: 'Jun 26', count: 0, badCount: 0 });
  });
});

describe('bristolDistribution', () => {
  it('returns length-7 counts for Bristol 1..7 over the window', () => {
    const entries = [1, 1, 3, 7].map((bristolScale) =>
      makeEntry({ loggedAt: new Date(2026, 6, 1, 8, 0, 0).getTime(), bristolScale }),
    );
    const dist = bristolDistribution(entries, NOW, 1);
    expect(dist).toEqual([2, 0, 1, 0, 0, 0, 1]);
  });

  it('excludes entries with null/invalid bristolScale', () => {
    const entries = [
      makeEntry({ loggedAt: new Date(2026, 6, 1, 8, 0, 0).getTime(), bristolScale: null }),
      makeEntry({ loggedAt: new Date(2026, 6, 1, 8, 0, 0).getTime(), bristolScale: 9 as unknown as number }),
    ];
    const dist = bristolDistribution(entries, NOW, 1);
    expect(dist).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('excludes non-BM entries and entries outside the window', () => {
    const entries = [
      makeEntry({ loggedAt: new Date(2026, 6, 1, 8, 0, 0).getTime(), type: 'meal', bristolScale: 4 }),
      makeEntry({ loggedAt: new Date(2026, 4, 1, 8, 0, 0).getTime(), bristolScale: 4 }), // outside 1-week window
    ];
    const dist = bristolDistribution(entries, NOW, 1);
    expect(dist).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('defaults to an 8-week window', () => {
    const entries = [makeEntry({ loggedAt: new Date(2026, 5, 8, 8, 0, 0).getTime(), bristolScale: 4 })];
    expect(bristolDistribution(entries, NOW)).toEqual([0, 0, 0, 1, 0, 0, 0]);
  });
});

describe('bmRegularity', () => {
  it('computes total, perDay, and the hard/typical/loose split over the window', () => {
    const entries = [1, 2, 3, 4, 5, 6, 7].map((bristolScale) =>
      makeEntry({ loggedAt: new Date(2026, 6, 1, 8, 0, 0).getTime(), bristolScale }),
    );
    const result = bmRegularity(entries, NOW, 28);
    expect(result).toEqual({ total: 7, perDay: 0.3, hard: 2, typical: 3, loose: 2 });
  });

  it('counts unrated BMs in total only', () => {
    const entries = [
      makeEntry({ loggedAt: new Date(2026, 6, 1, 8, 0, 0).getTime(), bristolScale: null }),
      makeEntry({ loggedAt: new Date(2026, 6, 1, 8, 0, 0).getTime(), bristolScale: 4 }),
    ];
    const result = bmRegularity(entries, NOW, 28);
    expect(result).toEqual({ total: 2, perDay: 0.1, hard: 0, typical: 1, loose: 0 });
  });

  it('ignores non-BM entries', () => {
    const entries = [makeEntry({ loggedAt: new Date(2026, 6, 1, 8, 0, 0).getTime(), type: 'meal', bristolScale: 1 })];
    expect(bmRegularity(entries, NOW, 28)).toBeNull();
  });

  it('returns null when there are no BM entries in the window', () => {
    expect(bmRegularity([], NOW, 28)).toBeNull();
  });

  it('excludes entries outside the requested day window', () => {
    const entries = [makeEntry({ loggedAt: new Date(2026, 4, 1, 8, 0, 0).getTime(), bristolScale: 4 })]; // > 28 days back
    expect(bmRegularity(entries, NOW, 28)).toBeNull();
  });

  it('defaults to a 28-day window', () => {
    const entries = [makeEntry({ loggedAt: new Date(2026, 6, 1, 8, 0, 0).getTime(), bristolScale: 4 })];
    expect(bmRegularity(entries, NOW)).toEqual({ total: 1, perDay: 0, hard: 0, typical: 1, loose: 0 });
  });
});
