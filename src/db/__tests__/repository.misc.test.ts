// Repository tests: day check-ins, watchlist, goals, tag backfill
// (docs/HANDOFF.md §3 "Other writes"). Transaction atomicity for
// applyTagBackfill is covered separately in repository.atomicity.test.ts —
// this file only checks its ordinary functional behavior.
import * as repo from '../repository';
import { closeTestDb, migrateTestDb, resetTestDb } from '../testUtils/testDb';

// Jest hoists jest.mock(...) above the imports above at transform time
// (babel-plugin-jest-hoist), so '../repository's `../client` import already
// sees the fake.
jest.mock('expo-sqlite', () => jest.requireActual('../../../jest/expo-sqlite-node'));

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(closeTestDb);

describe('upsertDayCheckIn / getDayCheckIn / listAllDayCheckIns', () => {
  it('creates one row per date; answering again the same date updates it in place', async () => {
    await repo.upsertDayCheckIn('2026-09-01', 'fine');
    const first = await repo.getDayCheckIn('2026-09-01');

    await repo.upsertDayCheckIn('2026-09-01', 'rough');
    const second = await repo.getDayCheckIn('2026-09-01');

    expect(second?.id).toBe(first?.id);
    expect(second?.status).toBe('rough');
    expect(await repo.listAllDayCheckIns()).toHaveLength(1);
  });

  it('lists newest date first', async () => {
    await repo.upsertDayCheckIn('2026-09-01', 'fine');
    await repo.upsertDayCheckIn('2026-09-03', 'fine');
    await repo.upsertDayCheckIn('2026-09-02', 'fine');

    const all = await repo.listAllDayCheckIns();
    expect(all.map((c) => c.date)).toEqual(['2026-09-03', '2026-09-02', '2026-09-01']);
  });

  it('rejects a malformed date', async () => {
    await expect(repo.upsertDayCheckIn('09/01/2026', 'fine')).rejects.toThrow(/invalid date/i);
  });

  it('getDayCheckIn returns undefined for a date with no answer', async () => {
    expect(await repo.getDayCheckIn('2026-01-01')).toBeUndefined();
  });
});

describe('watchlist', () => {
  it('adds, renames, and removes an item; createdAt survives a rename', async () => {
    const item = await repo.addWatchlistItem('dairy');
    await repo.renameWatchlistItem(item.id, 'lactose');

    let all = await repo.listWatchlistItems();
    expect(all).toHaveLength(1);
    expect(all[0]?.term).toBe('lactose');
    expect(all[0]?.createdAt).toBe(item.createdAt);

    await repo.removeWatchlistItem(item.id);
    all = await repo.listWatchlistItems();
    expect(all).toHaveLength(0);
  });

  it('lists oldest-watched first', async () => {
    const first = await repo.addWatchlistItem('gluten');
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await repo.addWatchlistItem('soy');

    const all = await repo.listWatchlistItems();
    expect(all.map((i) => i.id)).toEqual([first.id, second.id]);
  });

  it('throws on a duplicate term (unique index) and propagates to the caller', async () => {
    await repo.addWatchlistItem('dairy');
    await expect(repo.addWatchlistItem('dairy')).rejects.toThrow();
  });
});

describe('goals', () => {
  it('upsertGoal overwrites by nutrient and keeps the original createdAt', async () => {
    const first = await repo.upsertGoal('sodiumMg', 'cap', 2000);
    const second = await repo.upsertGoal('sodiumMg', 'cap', 1500);

    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.threshold).toBe(1500);

    const all = await repo.listGoals();
    expect(all).toHaveLength(1);
  });

  it('lists alphabetically by nutrient', async () => {
    await repo.upsertGoal('sodiumMg', 'cap', 2000);
    await repo.upsertGoal('fiberG', 'floor', 25);

    const all = await repo.listGoals();
    expect(all.map((g) => g.nutrient)).toEqual(['fiberG', 'sodiumMg']);
  });

  it('removeGoal deletes it', async () => {
    await repo.upsertGoal('fiberG', 'floor', 25);
    await repo.removeGoal('fiberG');
    expect(await repo.listGoals()).toHaveLength(0);
  });
});

describe('applyTagBackfill', () => {
  it('patches only tagsJson on the given entries/components, and never bumps updatedAt', async () => {
    const entry = await repo.createMealWithComponents({ type: 'meal', name: 'Soup', loggedAt: Date.now() }, [
      { name: 'Broth', servings: 1, tagsJson: '["broth"]' },
    ]);
    const [component] = await repo.getMealComponents(entry.id);
    const originalUpdatedAt = entry.updatedAt;

    await new Promise((resolve) => setTimeout(resolve, 2));
    await repo.applyTagBackfill(
      [{ id: entry.id, tagsJson: '["broth","backfilled"]' }],
      [{ id: component.id, tagsJson: '["broth","backfilled"]' }],
    );

    const rereadEntry = await repo.getLogEntry(entry.id);
    expect(rereadEntry?.tagsJson).toBe('["broth","backfilled"]');
    expect(rereadEntry?.updatedAt).toBe(originalUpdatedAt);

    const rereadComponent = await repo.getMealComponent(component.id);
    expect(rereadComponent?.tagsJson).toBe('["broth","backfilled"]');
  });

  it('is a no-op for two empty arrays', async () => {
    await expect(repo.applyTagBackfill([], [])).resolves.toBeUndefined();
  });
});
