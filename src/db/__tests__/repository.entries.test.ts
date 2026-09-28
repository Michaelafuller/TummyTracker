// Repository tests: plain logEntry CRUD (docs/HANDOFF.md §3 "Log entries").
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

describe('createLogEntry', () => {
  it('stamps id/createdAt/updatedAt and persists the row', async () => {
    const before = Date.now();
    const entry = await repo.createLogEntry({ type: 'snack', name: 'Apple', loggedAt: before });

    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(entry.createdAt).toBe(entry.updatedAt);
    expect(entry.createdAt).toBeGreaterThanOrEqual(before);

    // `entry` only carries the fields the caller set plus id/createdAt/updatedAt
    // (createLogEntry returns its input, stamped — it doesn't re-read the row),
    // while `reread` is a full row with every other column explicitly null, so
    // this checks containment rather than deep equality.
    const reread = await repo.getLogEntry(entry.id);
    expect(reread).toMatchObject(entry);
  });
});

describe('createLogEntries (batch)', () => {
  it('stamps every row with its own id but a shared timestamp, and persists all of them', async () => {
    const loggedAt = Date.now();
    const entries = await repo.createLogEntries([
      { type: 'symptom', name: 'bloating', loggedAt, severity: 2 },
      { type: 'symptom', name: 'cramping', loggedAt, severity: 4 },
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0]?.id).not.toBe(entries[1]?.id);
    expect(entries[0]?.createdAt).toBe(entries[1]?.createdAt);

    const all = await repo.listLogEntries();
    expect(all).toHaveLength(2);
  });

  it('is a no-op for an empty batch', async () => {
    const entries = await repo.createLogEntries([]);
    expect(entries).toEqual([]);
    expect(await repo.listLogEntries()).toHaveLength(0);
  });
});

describe('listLogEntries', () => {
  it('orders newest loggedAt first', async () => {
    const older = await repo.createLogEntry({ type: 'meal', name: 'Breakfast', loggedAt: 1000 });
    const newer = await repo.createLogEntry({ type: 'meal', name: 'Dinner', loggedAt: 2000 });

    const all = await repo.listLogEntries();
    expect(all.map((e) => e.id)).toEqual([newer.id, older.id]);
  });
});

describe('updateLogEntry', () => {
  it('applies a partial patch and bumps updatedAt without touching other fields', async () => {
    const entry = await repo.createLogEntry({ type: 'meal', name: 'Toast', loggedAt: Date.now(), calories: 100 });
    const originalUpdatedAt = entry.updatedAt;

    await new Promise((resolve) => setTimeout(resolve, 2));
    await repo.updateLogEntry(entry.id, { name: 'Toast with butter' });

    const reread = await repo.getLogEntry(entry.id);
    expect(reread?.name).toBe('Toast with butter');
    expect(reread?.calories).toBe(100);
    expect(reread?.createdAt).toBe(entry.createdAt);
    expect(reread?.updatedAt).toBeGreaterThan(originalUpdatedAt);
  });
});

describe('deleteLogEntry', () => {
  it('deletes the entry and any meal components it owns', async () => {
    const entry = await repo.createMealWithComponents({ type: 'meal', name: 'Bowl', loggedAt: Date.now() }, [
      { name: 'Rice', servings: 1 },
      { name: 'Beans', servings: 1 },
    ]);

    await repo.deleteLogEntry(entry.id);

    expect(await repo.getLogEntry(entry.id)).toBeUndefined();
    expect(await repo.getMealComponents(entry.id)).toHaveLength(0);
  });

  it('is a no-op when the entry does not exist', async () => {
    await expect(repo.deleteLogEntry('does-not-exist')).resolves.toBeUndefined();
  });
});

describe('hasAnyLogEntry', () => {
  it('is false with an empty journal and true once something is logged', async () => {
    expect(await repo.hasAnyLogEntry()).toBe(false);
    await repo.createLogEntry({ type: 'snack', name: 'Chips', loggedAt: Date.now() });
    expect(await repo.hasAnyLogEntry()).toBe(true);
  });
});

describe('listRecentFoodEntries', () => {
  it('returns only food types, newest first, distinct by name', async () => {
    await repo.createLogEntry({ type: 'meal', name: 'Salad', loggedAt: 1000 });
    await repo.createLogEntry({ type: 'meal', name: 'Salad', loggedAt: 3000 }); // repeat name, newer
    await repo.createLogEntry({ type: 'snack', name: 'Chips', loggedAt: 2000 });
    await repo.createLogEntry({ type: 'symptom', name: 'bloating', loggedAt: 4000, severity: 1 });

    const recent = await repo.listRecentFoodEntries();

    expect(recent.map((e) => e.name)).toEqual(['Salad', 'Chips']);
    // The kept "Salad" row must be the newer of the two (loggedAt 3000).
    expect(recent[0]?.loggedAt).toBe(3000);
  });

  it('caps the result at the requested limit', async () => {
    for (let i = 0; i < 5; i++) {
      await repo.createLogEntry({ type: 'snack', name: `Snack ${i}`, loggedAt: i });
    }
    expect(await repo.listRecentFoodEntries(3)).toHaveLength(3);
  });
});
