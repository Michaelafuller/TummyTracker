import type { LogEntry } from '@/db/schema';
import { weeklyIntake, weeklyOutcomes } from '../chartData';

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

  it('uses the same bucket boundaries/labels as weeklyOutcomes for the same now', () => {
    const outcomeBuckets = weeklyOutcomes([], NOW, 4);
    const intakeBuckets = weeklyIntake([], NOW, 'calories', 4);
    expect(intakeBuckets.map((b) => b.label)).toEqual(outcomeBuckets.map((b) => b.label));
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

describe('weeklyOutcomes', () => {
  it('counts isOutcome entries into the same rolling 7-day buckets, with badCount mirroring count', () => {
    const entries = [
      // Current week (Jun 26 - Jul 2): a bad-Bristol BM (outcome) and a mild BM (not an outcome).
      makeEntry({ type: 'bowel_movement', loggedAt: new Date(2026, 5, 30, 12, 0, 0).getTime(), bristolScale: 1 }),
      makeEntry({ type: 'bowel_movement', loggedAt: new Date(2026, 6, 1, 8, 0, 0).getTime(), bristolScale: 4 }),
      // Prior week (Jun 19 - Jun 25): a severity-3 symptom (outcome) and a mild one (not).
      makeEntry({ type: 'symptom', loggedAt: new Date(2026, 5, 20, 9, 0, 0).getTime(), severity: 3 }),
      makeEntry({ type: 'symptom', loggedAt: new Date(2026, 5, 21, 9, 0, 0).getTime(), severity: 2 }),
    ];

    const buckets = weeklyOutcomes(entries, NOW, 2);

    expect(buckets).toHaveLength(2);
    // Oldest-first, same labels as weeklyBmCounts/weeklyIntake for this `now`.
    expect(buckets[0]).toEqual({ label: 'Jun 19', count: 1, badCount: 1 });
    expect(buckets[1]).toEqual({ label: 'Jun 26', count: 1, badCount: 1 });
  });

  it('ignores non-outcome entries (good-Bristol BM, mild symptom, food entries)', () => {
    const entries = [
      makeEntry({ type: 'bowel_movement', loggedAt: new Date(2026, 6, 1, 8, 0, 0).getTime(), bristolScale: 4 }),
      makeEntry({ type: 'symptom', loggedAt: new Date(2026, 6, 1, 8, 0, 0).getTime(), severity: 1 }),
      makeEntry({ type: 'meal', loggedAt: new Date(2026, 6, 1, 8, 0, 0).getTime() }),
    ];
    const buckets = weeklyOutcomes(entries, NOW, 1);
    expect(buckets[0]).toEqual({ label: 'Jun 26', count: 0, badCount: 0 });
  });

  it('returns count: 0, badCount: 0 buckets for empty input', () => {
    const buckets = weeklyOutcomes([], NOW, 3);
    expect(buckets).toHaveLength(3);
    for (const bucket of buckets) {
      expect(bucket.count).toBe(0);
      expect(bucket.badCount).toBe(0);
    }
  });

  it('uses the same bucket boundaries/labels as weeklyIntake for the same now', () => {
    const intakeBuckets = weeklyIntake([], NOW, 'calories', 4);
    const outcomeBuckets = weeklyOutcomes([], NOW, 4);
    expect(outcomeBuckets.map((b) => b.label)).toEqual(intakeBuckets.map((b) => b.label));
  });

  it('defaults to 8 weeks', () => {
    expect(weeklyOutcomes([], NOW)).toHaveLength(8);
  });
});
