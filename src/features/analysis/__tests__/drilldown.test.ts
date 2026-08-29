import type { LogEntry } from '@/db/schema';
import { drilldownSummary, findingInstances } from '../drilldown';

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

const HOUR = 60 * 60 * 1000;
const T = 1000 * HOUR; // base timestamp, comfortably away from 0

describe('findingInstances — food matching', () => {
  it('matches case-insensitively and trimmed, mirroring insights grouping', () => {
    const a = makeEntry({ type: 'meal', name: 'Chicken Salad', loggedAt: T });
    const b = makeEntry({ type: 'meal', name: '  CHICKEN salad  ', loggedAt: T + HOUR });
    const other = makeEntry({ type: 'meal', name: 'Rice', loggedAt: T + 2 * HOUR });

    const instances = findingInstances([a, b, other], 'food', 'chicken salad');

    expect(instances.map((i) => i.entry.id)).toEqual([b.id, a.id]);
  });

  it('only matches food-type entries (meal/snack), not BMs or symptoms sharing a name', () => {
    const food = makeEntry({ type: 'snack', name: 'Yogurt', loggedAt: T });
    const bm = makeEntry({ type: 'bowel_movement', name: 'Yogurt', loggedAt: T + HOUR });
    const symptom = makeEntry({ type: 'symptom', name: 'Yogurt', loggedAt: T + 2 * HOUR });

    const instances = findingInstances([food, bm, symptom], 'food', 'Yogurt');

    expect(instances.map((i) => i.entry.id)).toEqual([food.id]);
  });

  it('tag matching is also food-entries-only — a non-food entry carrying tags never matches', () => {
    const food = makeEntry({ type: 'meal', name: 'Onion Dish', tagsJson: '["onion"]', loggedAt: T });
    const tagged = makeEntry({ type: 'symptom', name: 'Bloating', tagsJson: '["onion"]', loggedAt: T + HOUR });

    const instances = findingInstances([food, tagged], 'tag', 'onion');

    expect(instances.map((i) => i.entry.id)).toEqual([food.id]);
  });
});

describe('findingInstances — tag matching', () => {
  it('matches the exact tag token, no prefix bleed', () => {
    const exact = makeEntry({ type: 'meal', tagsJson: '["milk"]', loggedAt: T });
    const prefixed = makeEntry({ type: 'meal', tagsJson: '["milk powder"]', loggedAt: T + HOUR });
    const other = makeEntry({ type: 'meal', tagsJson: '["gluten"]', loggedAt: T + 2 * HOUR });

    const instances = findingInstances([exact, prefixed, other], 'tag', 'milk');

    expect(instances.map((i) => i.entry.id)).toEqual([exact.id]);
  });
});

describe('findingInstances — outcome window', () => {
  it('flags an outcome strictly inside the 24h window', () => {
    const meal = makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: T });
    const outcome = makeEntry({ type: 'symptom', severity: 4, loggedAt: T + 23 * HOUR });

    const instances = findingInstances([meal, outcome], 'tag', 'lactose');

    expect(instances).toHaveLength(1);
    expect(instances[0].followedByOutcome).toBe(true);
  });

  it('does not count an outcome at the exact same instant', () => {
    const meal = makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: T, sentiment: null });
    // A separate entry logged at the same instant that would otherwise qualify as an outcome.
    const outcome = makeEntry({ type: 'symptom', severity: 4, loggedAt: T });

    const instances = findingInstances([meal, outcome], 'tag', 'lactose');

    expect(instances).toHaveLength(1);
    expect(instances[0].followedByOutcome).toBe(false);
  });

  it('does not count an outcome beyond the 24h window', () => {
    const meal = makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: T });
    const outcome = makeEntry({ type: 'symptom', severity: 4, loggedAt: T + 24 * HOUR + 1 });

    const instances = findingInstances([meal, outcome], 'tag', 'lactose');

    expect(instances[0].followedByOutcome).toBe(false);
  });

  it('counts an outcome exactly at the 24h boundary', () => {
    const meal = makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: T });
    const outcome = makeEntry({ type: 'symptom', severity: 4, loggedAt: T + 24 * HOUR });

    const instances = findingInstances([meal, outcome], 'tag', 'lactose');

    expect(instances[0].followedByOutcome).toBe(true);
  });

  it('never counts an instance as its own outcome', () => {
    // Under isOutcome v2, food entries are never outcomes at all (regardless
    // of sentiment) — so a lone lactose meal, even one rated poorly, never
    // flags itself as followed-by-outcome.
    const meal = makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: T, sentiment: 1 });

    const instances = findingInstances([meal], 'tag', 'lactose');

    expect(instances).toHaveLength(1);
    expect(instances[0].followedByOutcome).toBe(false);
  });
});

describe('findingInstances — ordering', () => {
  it('sorts newest first', () => {
    const oldest = makeEntry({ type: 'meal', tagsJson: '["a"]', loggedAt: T });
    const middle = makeEntry({ type: 'meal', tagsJson: '["a"]', loggedAt: T + HOUR });
    const newest = makeEntry({ type: 'meal', tagsJson: '["a"]', loggedAt: T + 2 * HOUR });

    const instances = findingInstances([oldest, newest, middle], 'tag', 'a');

    expect(instances.map((i) => i.entry.id)).toEqual([newest.id, middle.id, oldest.id]);
  });
});

describe('drilldownSummary', () => {
  it('computes count/rated/avgSentiment/outcomes', () => {
    const instances = [
      { entry: makeEntry({ sentiment: 2, loggedAt: T }), followedByOutcome: true },
      { entry: makeEntry({ sentiment: 4, loggedAt: T + HOUR }), followedByOutcome: false },
      { entry: makeEntry({ sentiment: null, loggedAt: T + 2 * HOUR }), followedByOutcome: false },
    ];

    expect(drilldownSummary(instances)).toEqual({
      count: 3,
      rated: 2,
      avgSentiment: 3,
      outcomes: 1,
    });
  });

  it('rounds avgSentiment to 1 decimal', () => {
    const instances = [
      { entry: makeEntry({ sentiment: 1, loggedAt: T }), followedByOutcome: false },
      { entry: makeEntry({ sentiment: 2, loggedAt: T }), followedByOutcome: false },
      { entry: makeEntry({ sentiment: 2, loggedAt: T }), followedByOutcome: false },
    ];

    expect(drilldownSummary(instances).avgSentiment).toBe(1.7);
  });

  it('reports null avgSentiment and zero rated when nothing is rated', () => {
    const instances = [
      { entry: makeEntry({ sentiment: null, loggedAt: T }), followedByOutcome: false },
      { entry: makeEntry({ sentiment: null, loggedAt: T + HOUR }), followedByOutcome: true },
    ];

    expect(drilldownSummary(instances)).toEqual({
      count: 2,
      rated: 0,
      avgSentiment: null,
      outcomes: 1,
    });
  });

  it('returns all zeros/null for an empty instance list', () => {
    expect(drilldownSummary([])).toEqual({
      count: 0,
      rated: 0,
      avgSentiment: null,
      outcomes: 0,
    });
  });
});
