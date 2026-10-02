// Repository tests: daily confounders (GitHub #23) — setDayFactors,
// getDayFactors, listAllDayFactors and the backup-restore insert.
import * as repo from '../repository';
import type { DayFactor } from '../schema';
import { closeTestDb, migrateTestDb, resetTestDb } from '../testUtils/testDb';

jest.mock('expo-sqlite', () => jest.requireActual('../../../jest/expo-sqlite-node'));

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(closeTestDb);

function factorRow(id: string, date: string, overrides: Partial<DayFactor> = {}): DayFactor {
  return {
    id,
    date,
    sleep: null,
    stress: null,
    alcohol: null,
    caffeine: null,
    period: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('setDayFactors', () => {
  it('inserts a row with only the patched field set and the rest null', async () => {
    await repo.setDayFactors('2026-09-01', { stress: 4 });

    const row = await repo.getDayFactors('2026-09-01');
    expect(row).toMatchObject({
      date: '2026-09-01',
      stress: 4,
      sleep: null,
      alcohol: null,
      caffeine: null,
      period: null,
    });
  });

  it('patching one field leaves the others untouched', async () => {
    await repo.setDayFactors('2026-09-01', { stress: 4, sleep: 'poor', alcohol: 'some' });
    await repo.setDayFactors('2026-09-01', { caffeine: 'more' });

    const row = await repo.getDayFactors('2026-09-01');
    expect(row).toMatchObject({ stress: 4, sleep: 'poor', alcohol: 'some', caffeine: 'more', period: null });
  });

  it('null clears one field and keeps the others', async () => {
    await repo.setDayFactors('2026-09-01', { stress: 4, sleep: 'poor', period: true });
    await repo.setDayFactors('2026-09-01', { stress: null });

    const row = await repo.getDayFactors('2026-09-01');
    expect(row).toMatchObject({ stress: null, sleep: 'poor', period: true });
  });

  it('stores period as a boolean, both true and false', async () => {
    await repo.setDayFactors('2026-09-01', { period: true });
    expect((await repo.getDayFactors('2026-09-01'))?.period).toBe(true);
    await repo.setDayFactors('2026-09-01', { period: false });
    expect((await repo.getDayFactors('2026-09-01'))?.period).toBe(false);
  });

  it('keeps one row per date: the id and createdAt survive later patches', async () => {
    await repo.setDayFactors('2026-09-01', { sleep: 'ok' });
    const first = await repo.getDayFactors('2026-09-01');
    await repo.setDayFactors('2026-09-01', { sleep: 'good' });
    const second = await repo.getDayFactors('2026-09-01');

    expect(second?.id).toBe(first?.id);
    expect(second?.createdAt).toBe(first?.createdAt);
    expect(second?.sleep).toBe('good');
    expect(await repo.listAllDayFactors()).toHaveLength(1);
  });

  it('an empty patch writes nothing (no row is created)', async () => {
    await repo.setDayFactors('2026-09-01', {});
    expect(await repo.listAllDayFactors()).toEqual([]);
  });

  it('rejects a malformed date and writes nothing', async () => {
    await expect(repo.setDayFactors('09/01/2026', { stress: 3 })).rejects.toThrow(/invalid date/i);
    expect(await repo.listAllDayFactors()).toEqual([]);
  });

  it.each([
    ['stress 0', { stress: 0 }],
    ['stress 6', { stress: 6 }],
    ['stress 2.5', { stress: 2.5 }],
    ['an unknown sleep level', { sleep: 'great' as never }],
    ['an unknown alcohol level', { alcohol: 'lots' as never }],
    ['an unknown caffeine level', { caffeine: 'decaf' as never }],
    ['a non-boolean period', { period: 1 as never }],
  ])('throws on %s and writes nothing', async (_label, patch) => {
    await expect(repo.setDayFactors('2026-09-01', patch)).rejects.toThrow();
    expect(await repo.listAllDayFactors()).toEqual([]);
  });

  it('an invalid value in a patch also leaves an existing row untouched', async () => {
    await repo.setDayFactors('2026-09-01', { stress: 2, sleep: 'ok' });
    await expect(repo.setDayFactors('2026-09-01', { sleep: 'good', stress: 9 })).rejects.toThrow();

    const row = await repo.getDayFactors('2026-09-01');
    expect(row).toMatchObject({ stress: 2, sleep: 'ok' });
  });
});

describe('getDayFactors / listAllDayFactors', () => {
  it('getDayFactors returns undefined for a day with nothing logged', async () => {
    expect(await repo.getDayFactors('2026-01-01')).toBeUndefined();
  });

  it('lists newest date first', async () => {
    await repo.setDayFactors('2026-09-01', { stress: 1 });
    await repo.setDayFactors('2026-09-03', { stress: 1 });
    await repo.setDayFactors('2026-09-02', { stress: 1 });

    const all = await repo.listAllDayFactors();
    expect(all.map((r) => r.date)).toEqual(['2026-09-03', '2026-09-02', '2026-09-01']);
  });
});

describe('insertDayFactorsPreservingIds', () => {
  it('inserts new rows preserving their ids', async () => {
    const result = await repo.insertDayFactorsPreservingIds([
      factorRow('f1', '2026-09-01', { stress: 5 }),
      factorRow('f2', '2026-09-02', { period: true }),
    ]);

    expect(result).toEqual({ inserted: 2, skipped: 0 });
    const all = await repo.listAllDayFactors();
    expect(all.map((r) => r.id).sort()).toEqual(['f1', 'f2']);
  });

  it("the device's own row for a date wins, whole — even under a different id", async () => {
    await repo.setDayFactors('2026-09-01', { sleep: 'poor' });

    const result = await repo.insertDayFactorsPreservingIds([
      factorRow('backup-1', '2026-09-01', { sleep: 'good', stress: 5 }),
    ]);

    expect(result).toEqual({ inserted: 0, skipped: 1 });
    const row = await repo.getDayFactors('2026-09-01');
    // Not field-merged: the backup's stress never lands on the device's row.
    expect(row).toMatchObject({ sleep: 'poor', stress: null });
  });

  it('skips a row whose id already exists on the device', async () => {
    await repo.insertDayFactorsPreservingIds([factorRow('f1', '2026-09-01', { stress: 1 })]);
    const result = await repo.insertDayFactorsPreservingIds([factorRow('f1', '2026-09-09', { stress: 5 })]);

    expect(result).toEqual({ inserted: 0, skipped: 1 });
    expect(await repo.getDayFactors('2026-09-09')).toBeUndefined();
  });

  it('de-duplicates by date within the input batch, keeping the first', async () => {
    const result = await repo.insertDayFactorsPreservingIds([
      factorRow('a', '2026-09-02', { stress: 1 }),
      factorRow('b', '2026-09-02', { stress: 5 }),
    ]);

    expect(result).toEqual({ inserted: 1, skipped: 1 });
    const all = await repo.listAllDayFactors();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'a', stress: 1 });
  });

  it('is a no-op for an empty array', async () => {
    expect(await repo.insertDayFactorsPreservingIds([])).toEqual({ inserted: 0, skipped: 0 });
  });

  it('chunks a large restore without dropping or duplicating rows', async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => factorRow(`f-${i}`, `2020-01-01-${i}`));
    const result = await repo.insertDayFactorsPreservingIds(rows);

    expect(result).toEqual({ inserted: 1200, skipped: 0 });
    expect(await repo.listAllDayFactors()).toHaveLength(1200);
  });
});
