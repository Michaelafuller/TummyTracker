import type { LogEntry } from '@/db/schema';
import { weeklyIntake, weeklySentiment } from '../chartData';

let seq = 0;
function makeEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: `e${seq++}`,
    type: 'meal',
    mealSlot: null,
    name: 'Food',
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

describe('weeklySentiment', () => {
  it('buckets rated food entries into rolling 7-day windows anchored on now, oldest first', () => {
    const entries = [
      // Current week (Jun 26 - Jul 2): Jun 30 (sentiment 4) and Jul 1 (sentiment 2) -> avg 3
      makeEntry({ loggedAt: new Date(2026, 5, 30, 12, 0, 0).getTime(), sentiment: 4 }),
      makeEntry({ loggedAt: new Date(2026, 6, 1, 8, 0, 0).getTime(), sentiment: 2 }),
      // Prior week (Jun 19 - Jun 25): Jun 20 (sentiment 5) -> avg 5
      makeEntry({ loggedAt: new Date(2026, 5, 20, 9, 0, 0).getTime(), sentiment: 5 }),
    ];

    const buckets = weeklySentiment(entries, NOW, 2);

    expect(buckets).toHaveLength(2);
    // Oldest-first: index 0 is the Jun 19 bucket, index 1 is the current (Jun 26) bucket.
    expect(buckets[0]).toEqual({ label: 'Jun 19', avg: 5, count: 1 });
    expect(buckets[1]).toEqual({ label: 'Jun 26', avg: 3, count: 2 });
  });

  it('gives a bucket avg: null (not zero) when it has no rated food entries', () => {
    const buckets = weeklySentiment([], NOW, 3);
    expect(buckets).toHaveLength(3);
    for (const bucket of buckets) {
      expect(bucket.avg).toBeNull();
      expect(bucket.count).toBe(0);
    }
  });

  it('ignores unrated entries and non-food entries', () => {
    const entries = [
      makeEntry({ loggedAt: new Date(2026, 5, 30, 12, 0, 0).getTime(), sentiment: null }),
      makeEntry({
        loggedAt: new Date(2026, 5, 30, 12, 0, 0).getTime(),
        type: 'bowel_movement',
        sentiment: 1,
        bristolScale: 4,
      }),
    ];
    const buckets = weeklySentiment(entries, NOW, 1);
    expect(buckets[0]).toEqual({ label: 'Jun 26', avg: null, count: 0 });
  });

  it('excludes entries logged before the requested number of weeks', () => {
    // Jun 5 falls outside a 2-week window ending Jul 2 (window starts Jun 19).
    const entries = [makeEntry({ loggedAt: new Date(2026, 5, 5, 12, 0, 0).getTime(), sentiment: 3 })];
    const buckets = weeklySentiment(entries, NOW, 2);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });

  it('defaults to 8 weeks', () => {
    expect(weeklySentiment([], NOW)).toHaveLength(8);
  });
});

describe('weeklyIntake', () => {
  it('averages a food field per day (sum/7) across the bucket, oldest first', () => {
    const entries = [
      // Current week (Jun 26 - Jul 2): 210 + 140 = 350 -> 350/7 = 50
      makeEntry({ loggedAt: new Date(2026, 5, 30, 12, 0, 0).getTime(), calories: 210 }),
      makeEntry({ loggedAt: new Date(2026, 6, 1, 8, 0, 0).getTime(), calories: 140 }),
      // Prior week (Jun 19 - Jun 25): 70 -> 70/7 = 10
      makeEntry({ loggedAt: new Date(2026, 5, 20, 9, 0, 0).getTime(), calories: 70 }),
    ];

    const buckets = weeklyIntake(entries, NOW, 'calories', 2);

    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toEqual({ label: 'Jun 19', avg: 10 });
    expect(buckets[1]).toEqual({ label: 'Jun 26', avg: 50 });
  });

  it('gives a bucket avg: null (not zero) when no food entry carries the field', () => {
    const buckets = weeklyIntake([], NOW, 'calories', 3);
    expect(buckets).toHaveLength(3);
    for (const bucket of buckets) {
      expect(bucket.avg).toBeNull();
    }
  });

  it('yields avg: 0 (not null) when logged values are explicitly zero', () => {
    const entries = [makeEntry({ loggedAt: new Date(2026, 5, 30, 12, 0, 0).getTime(), fiberG: 0 })];
    const buckets = weeklyIntake(entries, NOW, 'fiberG', 1);
    expect(buckets[0]).toEqual({ label: 'Jun 26', avg: 0 });
  });

  it('ignores non-food entries (BM/symptom)', () => {
    const entries = [
      makeEntry({
        loggedAt: new Date(2026, 5, 30, 12, 0, 0).getTime(),
        type: 'bowel_movement',
        calories: 999,
        bristolScale: 4,
      }),
    ];
    const buckets = weeklyIntake(entries, NOW, 'calories', 1);
    expect(buckets[0]).toEqual({ label: 'Jun 26', avg: null });
  });

  it('uses the same bucket boundaries/labels as weeklySentiment for the same now', () => {
    const sentimentBuckets = weeklySentiment([], NOW, 4);
    const intakeBuckets = weeklyIntake([], NOW, 'calories', 4);
    expect(intakeBuckets.map((b) => b.label)).toEqual(sentimentBuckets.map((b) => b.label));
  });

  it('is field-generic (works the same for a second field, e.g. fiberG)', () => {
    const entries = [makeEntry({ loggedAt: new Date(2026, 5, 30, 12, 0, 0).getTime(), fiberG: 7 })];
    const buckets = weeklyIntake(entries, NOW, 'fiberG', 1);
    expect(buckets[0]).toEqual({ label: 'Jun 26', avg: 1 });
  });

  it('defaults to 8 weeks', () => {
    expect(weeklyIntake([], NOW, 'calories')).toHaveLength(8);
  });
});
