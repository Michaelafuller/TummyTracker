import { chanceChecks, type ChanceFamily } from '../chance';
import { buildJournal } from '../testUtils/journal';

const ALL: ReadonlySet<ChanceFamily> = new Set<ChanceFamily>([
  'ingredients',
  'foods',
  'pairs',
  'slowerIngredients',
  'slowerFoods',
  'slowerPairs',
  'medications',
  'factors',
  'nutrients',
]);

describe('chanceChecks performance', () => {
  it('runs every family over a seeded 365-day journal quickly', () => {
    // 3 meals/day with 3-5 tags from a pool of 40, outcomes on ~30 % of days,
    // 3 medications dosed on ~25 % of days, daily stress/sleep rows.
    const journal = buildJournal({
      seed: 2026,
      days: 365,
      tagPool: 40,
      tagsPerMeal: [3, 5],
      outcomeProb: 0.3,
      medCount: 3,
      factors: true,
    });

    const started = Date.now();
    const result = chanceChecks({
      entries: journal.entries,
      checkIns: journal.checkIns,
      meds: journal.meds,
      events: journal.events,
      doses: journal.doses,
      factorRows: journal.factorRows,
      trackPeriod: false,
      families: ALL,
    });
    const elapsedMs = Date.now() - started;
    console.log(`chanceChecks, 365 days, all families: ${elapsedMs} ms`);

    for (const family of ALL) expect(result[family]).not.toBeNull();
    // Generous, CI-safe ceiling; the working target on a dev machine is < 300 ms.
    expect(elapsedMs).toBeLessThan(3000);
  });
});
