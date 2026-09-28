// Repository tests: the grouped-meal builder (docs/HANDOFF.md §3 "Meals").
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

describe('createMealWithComponents', () => {
  it('writes the entry (with an aggregate) and one component row per input, in order', async () => {
    const entry = await repo.createMealWithComponents({ type: 'meal', name: 'Bowl', loggedAt: Date.now() }, [
      { name: 'Rice', servings: 2, calories: 100 },
      { name: 'Beans', servings: 1, calories: 50 },
    ]);

    expect(entry.componentCount).toBe(2);
    expect(entry.calories).toBe(250); // 100*2 + 50*1

    const components = await repo.getMealComponents(entry.id);
    expect(components.map((c) => c.name)).toEqual(['Rice', 'Beans']);
    expect(components.map((c) => c.sortOrder)).toEqual([0, 1]);
    expect(components.every((c) => c.entryId === entry.id)).toBe(true);
  });

  it('stores no components for an empty component list', async () => {
    const entry = await repo.createMealWithComponents({ type: 'meal', name: 'Mystery', loggedAt: Date.now() }, []);
    expect(await repo.getMealComponents(entry.id)).toHaveLength(0);
  });
});

describe('updateMealComponentAndReaggregate', () => {
  it('updates the component and re-aggregates the parent entry nutrition/tags', async () => {
    const entry = await repo.createMealWithComponents({ type: 'meal', name: 'Bowl', loggedAt: Date.now() }, [
      { name: 'Rice', servings: 1, calories: 200, tagsJson: '["rice"]' },
      { name: 'Beans', servings: 1, calories: 100, tagsJson: '["beans"]' },
    ]);
    const [rice] = await repo.getMealComponents(entry.id);

    await repo.updateMealComponentAndReaggregate(rice.id, {
      name: 'Brown rice',
      servings: 2,
      calories: 200,
      tagsJson: '["brown-rice"]',
    });

    const rereadEntry = await repo.getLogEntry(entry.id);
    // 200*2 (brown rice) + 100*1 (beans) = 500
    expect(rereadEntry?.calories).toBe(500);
    expect(rereadEntry?.tagsJson).toContain('brown-rice');
    // Additive tag policy: the entry keeps tags from before the edit too.
    expect(rereadEntry?.tagsJson).toContain('beans');

    const rereadComponent = await repo.getMealComponent(rice.id);
    expect(rereadComponent?.name).toBe('Brown rice');
    expect(rereadComponent?.servings).toBe(2);
  });

  it('is a no-op when the component does not exist', async () => {
    await expect(
      repo.updateMealComponentAndReaggregate('does-not-exist', { name: 'X', servings: 1 }),
    ).resolves.toBeUndefined();
  });
});

describe('deleteMealComponentAndReaggregate', () => {
  it('deletes a component and re-aggregates the parent from what remains', async () => {
    const entry = await repo.createMealWithComponents({ type: 'meal', name: 'Bowl', loggedAt: Date.now() }, [
      { name: 'Rice', servings: 1, calories: 200 },
      { name: 'Beans', servings: 1, calories: 100 },
    ]);
    const [rice, beans] = await repo.getMealComponents(entry.id);

    const result = await repo.deleteMealComponentAndReaggregate(rice.id);

    expect(result).toBe('deleted');
    expect(await repo.getMealComponents(entry.id)).toEqual([beans]);
    const rereadEntry = await repo.getLogEntry(entry.id);
    expect(rereadEntry?.calories).toBe(100);
    expect(rereadEntry?.componentCount).toBe(1);
  });

  it("refuses to delete a meal's last remaining component", async () => {
    const entry = await repo.createMealWithComponents({ type: 'meal', name: 'Solo', loggedAt: Date.now() }, [
      { name: 'Rice', servings: 1, calories: 200 },
    ]);
    const [rice] = await repo.getMealComponents(entry.id);

    const result = await repo.deleteMealComponentAndReaggregate(rice.id);

    expect(result).toBe('last');
    expect(await repo.getMealComponents(entry.id)).toHaveLength(1);
    // Nothing about the parent entry should have changed either.
    const rereadEntry = await repo.getLogEntry(entry.id);
    expect(rereadEntry?.calories).toBe(200);
  });

  it('reports missing when the component does not exist', async () => {
    const result = await repo.deleteMealComponentAndReaggregate('does-not-exist');
    expect(result).toBe('missing');
  });
});

describe('listAllMealComponents / insertMealComponents', () => {
  it('lists every component ordered by sortOrder, and can re-insert pre-built rows verbatim', async () => {
    const entry = await repo.createMealWithComponents({ type: 'meal', name: 'Bowl', loggedAt: Date.now() }, [
      { name: 'Rice', servings: 1 },
    ]);
    const [existing] = await repo.getMealComponents(entry.id);

    const rebuilt = { ...existing, id: 'restored-id', name: 'Restored rice' };
    await repo.insertMealComponents([rebuilt]);

    const all = await repo.listAllMealComponents();
    expect(all.map((c) => c.id).sort()).toEqual([existing.id, 'restored-id'].sort());
  });

  it('is a no-op for an empty array', async () => {
    await expect(repo.insertMealComponents([])).resolves.toBeUndefined();
    expect(await repo.listAllMealComponents()).toHaveLength(0);
  });
});
