// Repository tests: elimination experiments (docs/HANDOFF.md §3, GitHub #19)
// — starting adds the watchlist term once, a second start throws and writes
// nothing (real atomicity, not just a rejected promise), finish/abandon only
// take effect from 'active', and restore precedence for the "at most one
// active" invariant.
import type { Experiment } from '../schema';
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

function experimentRow(id: string, overrides: Partial<Experiment> = {}): Experiment {
  return {
    id,
    term: 'lactose',
    startDate: '2026-04-01',
    baselineDays: 14,
    eliminationDays: 14,
    challengeDays: 3,
    observationDays: 3,
    status: 'active',
    verdictJson: null,
    endedAt: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('startExperiment', () => {
  it('normalizes the term, sets startDate to today, and fills in the default protocol', async () => {
    const now = Date.parse('2026-04-15T12:00:00');
    const exp = await repo.startExperiment({ term: '  Lactose! ', eliminationDays: 21 }, now);

    expect(exp.term).toBe('lactose');
    expect(exp.startDate).toBe('2026-04-15');
    expect(exp.baselineDays).toBe(14);
    expect(exp.eliminationDays).toBe(21);
    expect(exp.challengeDays).toBe(3);
    expect(exp.observationDays).toBe(3);
    expect(exp.status).toBe('active');
    expect(exp.verdictJson).toBeNull();
    expect(exp.endedAt).toBeNull();
  });

  it('adds the term to the watchlist when it is not already watched', async () => {
    await repo.startExperiment({ term: 'soy', eliminationDays: 14 }, Date.now());
    const watched = await repo.listWatchlistItems();
    expect(watched.map((w) => w.term)).toEqual(['soy']);
  });

  it('does not add a duplicate watchlist entry when the term is already watched', async () => {
    await repo.addWatchlistItem('soy');
    await repo.startExperiment({ term: 'soy', eliminationDays: 14 }, Date.now());
    const watched = await repo.listWatchlistItems();
    expect(watched).toHaveLength(1);
  });

  it('throws for an invalid (too-short) term and writes nothing', async () => {
    await expect(repo.startExperiment({ term: '!', eliminationDays: 14 }, Date.now())).rejects.toThrow(/invalid term/i);
    expect(await repo.listExperiments()).toHaveLength(0);
  });

  it('a second start throws ExperimentAlreadyActiveError and writes nothing (real atomicity)', async () => {
    await repo.startExperiment({ term: 'lactose', eliminationDays: 14 }, Date.now());

    await expect(repo.startExperiment({ term: 'gluten', eliminationDays: 14 }, Date.now())).rejects.toThrow(
      repo.ExperimentAlreadyActiveError,
    );

    // Only the first experiment exists — the second start's insert (and its
    // watchlist insert) never happened, proving the sync transaction rolled
    // back rather than partially writing.
    const all = await repo.listExperiments();
    expect(all).toHaveLength(1);
    expect(all[0]?.term).toBe('lactose');
    const watched = await repo.listWatchlistItems();
    expect(watched.map((w) => w.term)).toEqual(['lactose']);
  });

  it('a second start is allowed once the first is finished or abandoned', async () => {
    const first = await repo.startExperiment({ term: 'lactose', eliminationDays: 14 }, Date.now());
    await repo.abandonExperiment(first.id, Date.now());

    await expect(repo.startExperiment({ term: 'gluten', eliminationDays: 14 }, Date.now())).resolves.toBeDefined();
    expect(await repo.getActiveExperiment()).toMatchObject({ term: 'gluten' });
  });
});

describe('getActiveExperiment / getExperiment / listExperiments', () => {
  it('getActiveExperiment finds the one active row', async () => {
    expect(await repo.getActiveExperiment()).toBeUndefined();
    const exp = await repo.startExperiment({ term: 'lactose', eliminationDays: 14 }, Date.now());
    expect((await repo.getActiveExperiment())?.id).toBe(exp.id);
  });

  it('getExperiment returns undefined for an unknown id', async () => {
    expect(await repo.getExperiment('nope')).toBeUndefined();
  });

  it('listExperiments lists newest-created first', async () => {
    const first = await repo.startExperiment({ term: 'lactose', eliminationDays: 14 }, 1000);
    await repo.abandonExperiment(first.id, 1001);
    const second = await repo.startExperiment({ term: 'gluten', eliminationDays: 14 }, 2000);

    const all = await repo.listExperiments();
    expect(all.map((e) => e.id)).toEqual([second.id, first.id]);
  });
});

describe('finishExperiment / abandonExperiment', () => {
  const verdict = {
    kind: 'likely-trigger' as const,
    confidence: 'high' as const,
    reason: 'Rough days dropped while avoiding it and came back after reintroducing it.',
    baselineRate: 0.5,
    eliminationRate: 0.1,
    reintroductionRate: 0.6,
  };

  it('finishExperiment freezes the verdict and sets status/endedAt, only from active', async () => {
    const exp = await repo.startExperiment({ term: 'lactose', eliminationDays: 14 }, 1000);
    await repo.finishExperiment(exp.id, verdict, 5000);

    const reread = await repo.getExperiment(exp.id);
    expect(reread?.status).toBe('completed');
    expect(reread?.endedAt).toBe(5000);
    expect(JSON.parse(reread?.verdictJson ?? 'null')).toEqual(verdict);
  });

  it('finishExperiment is a no-op on an already-completed experiment', async () => {
    const exp = await repo.startExperiment({ term: 'lactose', eliminationDays: 14 }, 1000);
    await repo.finishExperiment(exp.id, verdict, 5000);
    await repo.finishExperiment(exp.id, { ...verdict, reason: 'different' }, 9000);

    const reread = await repo.getExperiment(exp.id);
    expect(reread?.endedAt).toBe(5000); // untouched by the second call
    expect(JSON.parse(reread?.verdictJson ?? 'null').reason).toBe(verdict.reason);
  });

  it('abandonExperiment sets status/endedAt with no verdict, only from active', async () => {
    const exp = await repo.startExperiment({ term: 'lactose', eliminationDays: 14 }, 1000);
    await repo.abandonExperiment(exp.id, 5000);

    const reread = await repo.getExperiment(exp.id);
    expect(reread?.status).toBe('abandoned');
    expect(reread?.endedAt).toBe(5000);
    expect(reread?.verdictJson).toBeNull();
  });

  it('abandonExperiment is a no-op on an already-abandoned experiment', async () => {
    const exp = await repo.startExperiment({ term: 'lactose', eliminationDays: 14 }, 1000);
    await repo.abandonExperiment(exp.id, 5000);
    await repo.abandonExperiment(exp.id, 9000);

    expect((await repo.getExperiment(exp.id))?.endedAt).toBe(5000);
  });
});

describe('insertExperimentsPreservingIds', () => {
  it('inserts new rows preserving their id, and skips rows whose id already exists', async () => {
    const first = await repo.insertExperimentsPreservingIds([
      experimentRow('e1', { status: 'completed', endedAt: 2000 }),
      experimentRow('e2', { status: 'abandoned', endedAt: 2000, term: 'soy' }),
    ]);
    expect(first).toEqual({ inserted: 2, skipped: 0 });

    const second = await repo.insertExperimentsPreservingIds([
      experimentRow('e2', { term: 'should be skipped' }),
      experimentRow('e3', { status: 'completed', endedAt: 2000 }),
    ]);
    expect(second).toEqual({ inserted: 1, skipped: 1 });

    const all = await repo.listExperiments();
    expect(all.map((e) => e.id).sort()).toEqual(['e1', 'e2', 'e3']);
    expect(all.find((e) => e.id === 'e2')?.term).toBe('soy'); // pre-existing row untouched
  });

  it('is a no-op for an empty array', async () => {
    expect(await repo.insertExperimentsPreservingIds([])).toEqual({ inserted: 0, skipped: 0 });
  });

  it('demotes a restored "active" row to "abandoned" when the device already has an active experiment', async () => {
    await repo.startExperiment({ term: 'lactose', eliminationDays: 14 }, 1000);

    const result = await repo.insertExperimentsPreservingIds([
      experimentRow('backup-1', { status: 'active', updatedAt: 4000 }),
    ]);
    expect(result).toEqual({ inserted: 1, skipped: 0 });

    const restored = await repo.getExperiment('backup-1');
    expect(restored?.status).toBe('abandoned');
    expect(restored?.endedAt).toBe(4000); // backfilled from the row's own updatedAt
  });

  it('demotes every "active" row in the same restore file after the first one claims the slot', async () => {
    // No active experiment on the device — the first restored active row
    // (file order) keeps its status; a second active row in the same file
    // is demoted, since only one can truly be active at a time.
    const result = await repo.insertExperimentsPreservingIds([
      experimentRow('a', { status: 'active', updatedAt: 3000 }),
      experimentRow('b', { status: 'active', updatedAt: 4000, term: 'soy' }),
    ]);
    expect(result).toEqual({ inserted: 2, skipped: 0 });

    expect((await repo.getExperiment('a'))?.status).toBe('active');
    const b = await repo.getExperiment('b');
    expect(b?.status).toBe('abandoned');
    expect(b?.endedAt).toBe(4000);
  });

  it('a restored completed/abandoned row is imported verbatim, never touched by the active-slot rule', async () => {
    const result = await repo.insertExperimentsPreservingIds([
      experimentRow('c', { status: 'completed', endedAt: 2000, verdictJson: '{"kind":"inconclusive"}' }),
    ]);
    expect(result).toEqual({ inserted: 1, skipped: 0 });
    const restored = await repo.getExperiment('c');
    expect(restored?.status).toBe('completed');
    expect(restored?.verdictJson).toBe('{"kind":"inconclusive"}');
  });
});
