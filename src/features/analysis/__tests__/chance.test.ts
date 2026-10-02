import type { LogEntry } from '@/db/schema';
import {
  chanceChecks,
  chanceSentence,
  loggedDayKeys,
  MAX_SLIDES,
  MIN_SLIDE_DAYS,
  MIN_SLIDES,
  rotateRoughDays,
  slideOffsets,
  slideOutcomes,
  type ChanceCheck,
  type ChanceFamily,
} from '../chance';
import { isOutcome } from '../temporal';
import { buildJournal, dayAt, makeEntry, type JournalOptions } from '../testUtils/journal';

const DAY = 24 * 60 * 60 * 1000;
const NOUN = { one: 'ingredient', many: 'ingredients' };

function checksFor(opts: JournalOptions, families: ChanceFamily[]) {
  const j = buildJournal(opts);
  return chanceChecks({ ...j, trackPeriod: false, families: new Set(families) });
}

describe('slideOffsets', () => {
  it('is empty when the span is too short for MIN_SLIDES slides', () => {
    expect(slideOffsets(0)).toEqual([]);
    expect(slideOffsets(5)).toEqual([]);
    expect(slideOffsets(2 * MIN_SLIDE_DAYS + MIN_SLIDES - 2)).toEqual([]); // 14 days: only 9 slides
  });

  it('returns every distance when there are exactly MIN_SLIDES', () => {
    const span = 2 * MIN_SLIDE_DAYS + MIN_SLIDES - 1; // 15 days
    expect(slideOffsets(span)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('returns every distance up to MAX_SLIDES', () => {
    const offsets = slideOffsets(2 * MIN_SLIDE_DAYS + MAX_SLIDES - 1);
    expect(offsets).toHaveLength(MAX_SLIDES);
    expect(offsets[0]).toBe(MIN_SLIDE_DAYS);
  });

  it('spaces MAX_SLIDES distances evenly for a long journal, ascending and unique', () => {
    const span = 365;
    const offsets = slideOffsets(span);
    expect(offsets).toHaveLength(MAX_SLIDES);
    expect(offsets[0]).toBe(MIN_SLIDE_DAYS);
    expect(offsets[offsets.length - 1]).toBe(span - MIN_SLIDE_DAYS);
    expect(new Set(offsets).size).toBe(MAX_SLIDES);
    for (let i = 1; i < offsets.length; i++) expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
  });
});

describe('loggedDayKeys and slideOutcomes', () => {
  // 20 local days: meals every day at 12:00, outcomes on a few days at various hours.
  const meals = Array.from({ length: 20 }, (_, d) => makeEntry({ type: 'meal', loggedAt: dayAt(d, 12) }));
  const outcomes = [
    makeEntry({ type: 'symptom', severity: 4, loggedAt: dayAt(2, 9) }),
    makeEntry({ type: 'bowel_movement', bristolScale: 7, loggedAt: dayAt(10, 17) }),
    makeEntry({ type: 'symptom', severity: 5, loggedAt: dayAt(18, 22) }),
  ];
  const quiet = [
    makeEntry({ type: 'bowel_movement', bristolScale: 4, loggedAt: dayAt(5, 8) }), // not an outcome
    makeEntry({ type: 'symptom', severity: 1, loggedAt: dayAt(6, 8) }), // not an outcome
  ];
  const entries = [...meals, ...outcomes, ...quiet];

  it('lists each local day with an entry once, ascending', () => {
    expect(loggedDayKeys(entries)).toHaveLength(20);
    expect(loggedDayKeys([...entries].reverse())).toEqual(loggedDayKeys(entries));
    expect(loggedDayKeys([])).toEqual([]);
    expect(loggedDayKeys([meals[0]])).toHaveLength(1);
  });

  it('slides among logged days only, skipping a break in logging', () => {
    // Logged on days 0-9 and 100-109; an outcome on day 8 at 17:00, slid 3 logged days.
    const gapped = [
      ...Array.from({ length: 10 }, (_, d) => makeEntry({ type: 'meal', loggedAt: dayAt(d, 12) })),
      ...Array.from({ length: 10 }, (_, d) => makeEntry({ type: 'meal', loggedAt: dayAt(100 + d, 12) })),
      makeEntry({ id: 'late', type: 'symptom', severity: 4, loggedAt: dayAt(8, 17) }),
    ];
    const moved = slideOutcomes(gapped, 3).find((e) => e.id === 'late') as LogEntry;
    expect(moved.loggedAt).toBe(dayAt(101, 17)); // day 8 -> 9 -> 100 -> 101, same time of day
  });

  it('moves only outcomes, and only by whole days', () => {
    const slid = slideOutcomes(entries, 4);
    expect(slid).toHaveLength(entries.length);
    entries.forEach((entry, i) => {
      if (isOutcome(entry)) {
        expect(slid[i].id).toBe(entry.id);
        expect(Math.abs((slid[i].loggedAt - entry.loggedAt) % DAY)).toBe(0);
        expect(slid[i].loggedAt).not.toBe(entry.loggedAt);
      } else {
        expect(slid[i]).toBe(entry); // the very same object
      }
    });
    expect(slid.filter(isOutcome)).toHaveLength(outcomes.length);
  });

  it('wraps past the end back near the start of the journal', () => {
    const start = dayAt(0, 0);
    const slid = slideOutcomes(entries, 4);
    const lateOutcome = slid[meals.length + 2]; // was day 18 at 22:00; +4 days wraps past day 19
    expect(lateOutcome.loggedAt).toBeGreaterThanOrEqual(start);
    expect(lateOutcome.loggedAt).toBeLessThan(start + 4 * DAY);
    // ...and it keeps its time of day (22:00 local, DST permitting at most an hour).
    expect(new Date(lateOutcome.loggedAt).getHours()).toBeGreaterThanOrEqual(21);
  });

  it('keeps every slid outcome inside the journal span', () => {
    const start = dayAt(0, 0);
    for (const d of [3, 7, 12, 17]) {
      for (const e of slideOutcomes(entries, d)) {
        expect(e.loggedAt).toBeGreaterThanOrEqual(start);
        expect(e.loggedAt).toBeLessThan(start + 20 * DAY + DAY); // span plus a DST hour of slack
      }
    }
  });

  it('does not mutate its input', () => {
    const before = entries.map((e) => e.loggedAt);
    slideOutcomes(entries, 5);
    expect(entries.map((e) => e.loggedAt)).toEqual(before);
  });

  it('returns [] for no entries', () => {
    expect(slideOutcomes([], 3)).toEqual([]);
  });
});

describe('rotateRoughDays', () => {
  const covered = new Set(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05']);

  it('moves rough flags later among covered days, preserving the count', () => {
    const rough = new Set(['2026-01-01', '2026-01-03']);
    expect([...rotateRoughDays(covered, rough, 1)].sort()).toEqual(['2026-01-02', '2026-01-04']);
    expect(rotateRoughDays(covered, rough, 2).size).toBe(2);
  });

  it('wraps past the last covered day', () => {
    const rough = new Set(['2026-01-05']);
    expect([...rotateRoughDays(covered, rough, 1)]).toEqual(['2026-01-01']);
    expect([...rotateRoughDays(covered, rough, 3)]).toEqual(['2026-01-03']);
  });

  it('returns the same set for 0 positions (and a full lap)', () => {
    const rough = new Set(['2026-01-02', '2026-01-04']);
    expect(rotateRoughDays(covered, rough, 0)).toEqual(rough);
    expect(rotateRoughDays(covered, rough, covered.size)).toEqual(rough);
  });

  it('sorts covered days itself, whatever order the set was built in', () => {
    const shuffled = new Set(['2026-01-04', '2026-01-01', '2026-01-03', '2026-01-02']);
    expect([...rotateRoughDays(shuffled, new Set(['2026-01-04']), 1)]).toEqual(['2026-01-01']);
  });
});

describe('chanceChecks', () => {
  // A journal with a planted signal: a tag every meal of which is followed by a symptom 3 h later.
  const PLANTED: JournalOptions = {
    seed: 7,
    days: 60,
    tagPool: 8,
    tagsPerMeal: [2, 3],
    outcomeProb: 0.2,
    plantedTag: 'planted',
    plantedProb: 0.12,
  };

  it('planted signal: found.high is at least 1 and luck alone gives fewer', () => {
    const check = checksFor(PLANTED, ['ingredients']).ingredients as ChanceCheck;
    expect(check.slides).toBeGreaterThanOrEqual(MIN_SLIDES);
    expect(check.checked).toBeGreaterThan(0);
    expect(check.found.high).toBeGreaterThanOrEqual(1);
    expect(check.expected.high).toBeLessThan(check.found.high);
    const sentence = chanceSentence(check, 'high', NOUN);
    expect(sentence).toMatch(/^Chance check: of \d+ ingredients checked, luck alone would make /);
    expect(sentence).not.toContain('could easily be chance');
  });

  it('pure noise: the tier the noise reached could easily be chance', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const check = checksFor(
        { seed, days: 70, tagPool: 8, tagsPerMeal: [2, 3], outcomeProb: 0.35 },
        ['ingredients'],
      ).ingredients as ChanceCheck;
      // Noise reaches only the low tier here, and luck alone makes about as many.
      expect(check.found.high).toBe(0);
      expect(check.found.low).toBeGreaterThan(0);
      expect(chanceSentence(check, 'low', NOUN)).toContain('could easily be chance');
    }
  });

  it('only returns the families that were asked for', () => {
    const result = checksFor(PLANTED, ['foods', 'nutrients']);
    expect(Object.keys(result).sort()).toEqual(['foods', 'nutrients']);
  });

  it('every meal-level family produces a check on a long journal', () => {
    const families: ChanceFamily[] = [
      'ingredients',
      'foods',
      'pairs',
      'slowerIngredients',
      'slowerFoods',
      'slowerPairs',
      'nutrients',
    ];
    const result = checksFor({ ...PLANTED, days: 90 }, families);
    for (const family of families) {
      const check = result[family] as ChanceCheck;
      expect(check).not.toBeNull();
      expect(check.slides).toBeGreaterThanOrEqual(MIN_SLIDES);
      // Counts at "this tier or better" can only grow as the bar drops.
      expect(check.found.high).toBeLessThanOrEqual(check.found.medium);
      expect(check.found.medium).toBeLessThanOrEqual(check.found.low);
      expect(check.expected.high).toBeLessThanOrEqual(check.expected.medium);
      expect(check.expected.medium).toBeLessThanOrEqual(check.expected.low);
    }
  });

  it('slower families never count low: low equals medium', () => {
    const result = checksFor({ ...PLANTED, days: 90 }, ['slowerIngredients', 'slowerFoods', 'slowerPairs']);
    for (const check of Object.values(result) as ChanceCheck[]) {
      expect(check.found.low).toBe(check.found.medium);
      expect(check.expected.low).toBe(check.expected.medium);
    }
  });

  it('medications: exposure that coincides with rough days is found, luck alone rarely makes it', () => {
    const check = checksFor(
      { seed: 1, days: 60, tagPool: 8, outcomeProb: 0.25, medCount: 2, medOnRoughDays: true },
      ['medications'],
    ).medications as ChanceCheck;
    expect(check.checked).toBe(2);
    expect(check.found.high).toBeGreaterThanOrEqual(1);
    expect(check.expected.high).toBeLessThan(check.found.high);
    expect(chanceSentence(check, 'high', { one: 'medication', many: 'medications' })).toMatch(
      /^Chance check: of 2 medications checked, luck alone would make fewer than 1 look this strong\.$/,
    );
  });

  it('daily factors produce a check over the factors compared', () => {
    const check = checksFor(
      { seed: 3, days: 60, tagPool: 8, outcomeProb: 0.3, factors: true },
      ['factors'],
    ).factors as ChanceCheck;
    expect(check.checked).toBe(2); // stress and sleep
    expect(check.slides).toBeGreaterThanOrEqual(MIN_SLIDES);
  });

  it('a journal too short to slide gives null for every requested family', () => {
    const families: ChanceFamily[] = ['ingredients', 'slowerPairs', 'nutrients', 'medications', 'factors'];
    const result = checksFor(
      { seed: 1, days: 10, tagPool: 8, outcomeProb: 0.3, medCount: 2, factors: true },
      families,
    );
    for (const family of families) expect(result[family]).toBeNull();
  });

  it('is deterministic: the same input gives deeply equal output', () => {
    const all: ChanceFamily[] = [
      'ingredients',
      'foods',
      'pairs',
      'slowerIngredients',
      'slowerFoods',
      'slowerPairs',
      'medications',
      'factors',
      'nutrients',
    ];
    const opts: JournalOptions = { ...PLANTED, days: 80, medCount: 2, factors: true };
    expect(checksFor(opts, all)).toEqual(checksFor(opts, all));
  });

  it('does not mutate the journal it is given', () => {
    const j = buildJournal({ ...PLANTED, days: 40 });
    const before = JSON.stringify(j.entries);
    chanceChecks({ ...j, trackPeriod: false, families: new Set<ChanceFamily>(['ingredients', 'slowerFoods']) });
    expect(JSON.stringify(j.entries)).toBe(before);
  });

  it('handles an empty journal', () => {
    const result = chanceChecks({
      entries: [] as LogEntry[],
      checkIns: [],
      meds: [],
      events: [],
      doses: [],
      factorRows: [],
      trackPeriod: false,
      families: new Set<ChanceFamily>(['ingredients', 'medications']),
    });
    expect(result).toEqual({ ingredients: null, medications: null });
  });
});

describe('chanceSentence', () => {
  const check = (over: Partial<ChanceCheck> = {}): ChanceCheck => ({
    checked: 42,
    found: { high: 1, medium: 2, low: 4 },
    expected: { high: 0.2, medium: 1.2, low: 3.6 },
    slides: 30,
    ...over,
  });

  it('asks for more history when there is no check', () => {
    expect(chanceSentence(null, 'high', NOUN)).toBe('Chance check: needs a couple of weeks of logs first.');
  });

  it('says "fewer than 1" below 0.5, and never flags it', () => {
    expect(chanceSentence(check({ expected: { high: 0.49, medium: 0.49, low: 0.49 }, found: { high: 0, medium: 0, low: 0 } }), 'high', NOUN)).toBe(
      'Chance check: of 42 ingredients checked, luck alone would make fewer than 1 look this strong.',
    );
  });

  it('rounds the expected count to the number read', () => {
    expect(chanceSentence(check(), 'low', NOUN)).toContain('would make about 4 look this strong.');
    expect(chanceSentence(check({ expected: { high: 0, medium: 2.4, low: 0 } }), 'medium', NOUN)).toContain('about 2 look');
    expect(chanceSentence(check({ expected: { high: 0, medium: 2.5, low: 0 } }), 'medium', NOUN)).toContain('about 3 look');
  });

  it('uses the singular noun for one thing checked', () => {
    expect(chanceSentence(check({ checked: 1 }), 'high', NOUN)).toContain('of 1 ingredient checked');
  });

  it('flags "could easily be chance" when the number read is at least the number found', () => {
    // found.low = 4, expected.low = 3.6 -> reads 4 -> flagged.
    expect(chanceSentence(check(), 'low', NOUN)).toBe(
      "Chance check: of 42 ingredients checked, luck alone would make about 4 look this strong. That's as many as you have, so this could easily be chance.",
    );
    // found.medium = 2, expected.medium = 1.2 -> reads 1 -> not flagged.
    expect(chanceSentence(check(), 'medium', NOUN)).not.toContain('could easily be chance');
  });

  it('flags at the boundary E = 0.5 with found = 1, but not at E = 0.49', () => {
    const at = check({ expected: { high: 0.5, medium: 0.5, low: 0.5 }, found: { high: 1, medium: 1, low: 1 } });
    expect(chanceSentence(at, 'high', NOUN)).toContain('about 1 look this strong. That');
    expect(chanceSentence(at, 'high', NOUN)).toContain('could easily be chance');
    const below = check({ expected: { high: 0.49, medium: 0.49, low: 0.49 }, found: { high: 1, medium: 1, low: 1 } });
    expect(chanceSentence(below, 'high', NOUN)).not.toContain('could easily be chance');
  });

  it('never claims causation or safety', () => {
    const sentence = chanceSentence(check(), 'low', NOUN);
    expect(sentence).not.toMatch(/coincidence|real|safe|cause/i);
  });
});

describe('chanceChecks: calendar gaps never make noise look trustworthy (review 2026-09-30)', () => {
  // Pure noise that the check flags as "could easily be chance" (see above).
  const NOISE: JournalOptions = { seed: 1, days: 70, tagPool: 8, tagsPerMeal: [2, 3], outcomeProb: 0.35 };

  function ingredientsCheck(entries: LogEntry[]): ChanceCheck {
    const j = buildJournal(NOISE);
    return chanceChecks({ ...j, entries, trackPeriod: false, families: new Set(['ingredients']) })
      .ingredients as ChanceCheck;
  }

  it('one stray entry dated two years earlier leaves the estimate where it was', () => {
    const { entries } = buildJournal(NOISE);
    const clean = ingredientsCheck(entries);
    const stray = makeEntry({ id: 'stray', type: 'bowel_movement', bristolScale: 4, loggedAt: dayAt(-730, 9) });
    const withStray = ingredientsCheck([stray, ...entries]);

    expect(withStray.found).toEqual(clean.found);
    expect(withStray.expected.low).toBeGreaterThan(clean.expected.low * 0.75);
    expect(chanceSentence(withStray, 'low', NOUN)).toContain('could easily be chance');
  });

  it('a long break in logging leaves the estimate where it was', () => {
    const { entries } = buildJournal(NOISE);
    const clean = ingredientsCheck(entries);
    // Days 35+ of the same journal happen 200 days later instead.
    const gapped = entries.map((e) =>
      e.loggedAt >= dayAt(35, 0) ? { ...e, loggedAt: e.loggedAt + 200 * DAY } : e,
    );
    const withGap = ingredientsCheck(gapped);

    expect(withGap.found).toEqual(clean.found);
    expect(withGap.expected.low).toBeGreaterThan(clean.expected.low * 0.75);
    expect(chanceSentence(withGap, 'low', NOUN)).toContain('could easily be chance');
  });
});
