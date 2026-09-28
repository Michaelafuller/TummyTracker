// Repository tests: backup-restore id-preserving inserts (docs/HANDOFF.md §3
// "Restore" — the 2026-09-26 bound-variable class + skip-if-exists semantics).
import type { DayCheckIn, Medication, MedicationDose, MedicationEvent } from '../schema';
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

function medicationRow(id: string, overrides: Partial<Medication> = {}): Medication {
  return {
    id,
    name: `Med ${id}`,
    defaultDose: null,
    doseUnit: null,
    frequency: null,
    startDate: null,
    endDate: null,
    isActive: true,
    notes: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function medicationEventRow(id: string, overrides: Partial<MedicationEvent> = {}): MedicationEvent {
  return {
    id,
    takenAt: 1000,
    timeKnown: true,
    notes: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function medicationDoseRow(id: string, eventId: string, medicationId: string): MedicationDose {
  return {
    id,
    eventId,
    medicationId,
    dose: 1,
    doseUnit: 'mg',
    createdAt: 1000,
    updatedAt: 1000,
  };
}

function dayCheckInRow(id: string, date: string, overrides: Partial<DayCheckIn> = {}): DayCheckIn {
  return {
    id,
    date,
    status: 'fine',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('insertMedicationsPreservingIds', () => {
  it('inserts new rows preserving their id, and skips rows whose id already exists', async () => {
    const first = await repo.insertMedicationsPreservingIds([medicationRow('m1'), medicationRow('m2')]);
    expect(first).toEqual({ inserted: 2, skipped: 0 });

    const second = await repo.insertMedicationsPreservingIds([
      medicationRow('m2', { name: 'Should be skipped' }),
      medicationRow('m3'),
    ]);
    expect(second).toEqual({ inserted: 1, skipped: 1 });

    const all = await repo.listAllMedications();
    expect(all.map((m) => m.id).sort()).toEqual(['m1', 'm2', 'm3']);
    // The pre-existing m2 row must be untouched, not overwritten.
    expect(all.find((m) => m.id === 'm2')?.name).toBe('Med m2');
  });

  it('is a no-op for an empty array', async () => {
    expect(await repo.insertMedicationsPreservingIds([])).toEqual({ inserted: 0, skipped: 0 });
  });
});

describe('insertMedicationEventsPreservingIds', () => {
  it('inserts new rows preserving id and returns insertedIds, skipping existing ids', async () => {
    const first = await repo.insertMedicationEventsPreservingIds([medicationEventRow('e1'), medicationEventRow('e2')]);
    expect(first.inserted).toBe(2);
    expect(first.skipped).toBe(0);
    expect(first.insertedIds.sort()).toEqual(['e1', 'e2']);

    const second = await repo.insertMedicationEventsPreservingIds([
      medicationEventRow('e2'),
      medicationEventRow('e3'),
    ]);
    expect(second.inserted).toBe(1);
    expect(second.skipped).toBe(1);
    expect(second.insertedIds).toEqual(['e3']);
  });
});

describe('insertMedicationDosesPreservingIds', () => {
  it('inserts new rows preserving id, skips existing ids', async () => {
    const first = await repo.insertMedicationDosesPreservingIds([
      medicationDoseRow('d1', 'e1', 'm1'),
      medicationDoseRow('d2', 'e1', 'm1'),
    ]);
    expect(first).toEqual({ inserted: 2, skipped: 0 });

    const second = await repo.insertMedicationDosesPreservingIds([
      medicationDoseRow('d2', 'e1', 'm1'),
      medicationDoseRow('d3', 'e1', 'm1'),
    ]);
    expect(second).toEqual({ inserted: 1, skipped: 1 });
    expect(await repo.listAllMedicationDoses()).toHaveLength(3);
  });

  it('succeeds inserting 5,000 dose rows in one call (above the 32,766 bound-variable cap at 7 cols/row unchunked)', async () => {
    const rows: MedicationDose[] = Array.from({ length: 5000 }, (_, i) => medicationDoseRow(`dose-${i}`, 'e1', 'm1'));

    const start = Date.now();
    const result = await repo.insertMedicationDosesPreservingIds(rows);
    const elapsedMs = Date.now() - start;

    expect(result).toEqual({ inserted: 5000, skipped: 0 });
    expect(await repo.listAllMedicationDoses()).toHaveLength(5000);
    // Not a strict perf assertion — just a canary that chunking didn't turn
    // into something pathological (HANDOFF.md §4: flag if this file is slow).
    expect(elapsedMs).toBeLessThan(5000);
  }, 15000);
});

describe('insertDayCheckInsPreservingIds', () => {
  it("skips a row when the device's own date already has an answer, even under a different id", async () => {
    await repo.upsertDayCheckIn('2026-09-01', 'rough');

    const result = await repo.insertDayCheckInsPreservingIds([dayCheckInRow('backup-1', '2026-09-01', { status: 'fine' })]);

    expect(result).toEqual({ inserted: 0, skipped: 1 });
    const reread = await repo.getDayCheckIn('2026-09-01');
    // The device's own "rough" answer wins over the backup's "fine".
    expect(reread?.status).toBe('rough');
  });

  it('de-duplicates by date within the input batch, keeping the first', async () => {
    const result = await repo.insertDayCheckInsPreservingIds([
      dayCheckInRow('a', '2026-09-02', { status: 'fine' }),
      dayCheckInRow('b', '2026-09-02', { status: 'rough' }),
    ]);

    expect(result).toEqual({ inserted: 1, skipped: 1 });
    const all = await repo.listAllDayCheckIns();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe('a');
    expect(all[0]?.status).toBe('fine');
  });

  it('chunks a large restore (well above RESTORE_CHUNK_SIZE) without dropping or duplicating rows', async () => {
    const rows: DayCheckIn[] = Array.from({ length: 1200 }, (_, i) =>
      dayCheckInRow(`day-${i}`, `2020-01-${String((i % 28) + 1).padStart(2, '0')}-${i}`),
    );
    // Dates must be unique for this test's purposes; the padded index makes
    // each one distinct while still exercising chunk boundaries at 500/1000.
    const result = await repo.insertDayCheckInsPreservingIds(rows);
    expect(result).toEqual({ inserted: 1200, skipped: 0 });
    expect(await repo.listAllDayCheckIns()).toHaveLength(1200);
  });

  it('is a no-op for an empty array', async () => {
    expect(await repo.insertDayCheckInsPreservingIds([])).toEqual({ inserted: 0, skipped: 0 });
  });
});
