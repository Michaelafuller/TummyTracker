// Repository tests: backup-restore id-preserving inserts (docs/HANDOFF.md §3
// "Restore" — the 2026-09-26 bound-variable class + skip-if-exists semantics).
import type {
  DayCheckIn,
  Medication,
  MedicationDose,
  MedicationEvent,
  MedicationReminder,
  WatchlistItem,
} from '../schema';
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
    isRegular: false,
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
    reason: null,
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

  it('preserves isRegular on restore (GitHub #26)', async () => {
    await repo.insertMedicationsPreservingIds([
      medicationRow('m1', { isRegular: true, defaultDose: 5, doseUnit: 'mg' }),
      medicationRow('m2'),
    ]);
    const all = await repo.listAllMedications();
    expect(all.find((m) => m.id === 'm1')?.isRegular).toBe(true);
    expect(all.find((m) => m.id === 'm2')?.isRegular).toBe(false);
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

  it('preserves a dose reason on restore, and a null reason stays null (GitHub #28)', async () => {
    await repo.insertMedicationDosesPreservingIds([
      { ...medicationDoseRow('d1', 'e1', 'm1'), reason: 'headache' },
      medicationDoseRow('d2', 'e1', 'm1'),
    ]);
    const byId = new Map((await repo.listAllMedicationDoses()).map((dose) => [dose.id, dose.reason]));
    expect(byId.get('d1')).toBe('headache');
    expect(byId.get('d2')).toBeNull();
  });

  it('succeeds inserting 5,000 dose rows in one call (above the 32,766 bound-variable cap at 8 cols/row unchunked)', async () => {
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

function reminderRow(id: string, overrides: Partial<MedicationReminder> = {}): MedicationReminder {
  return {
    id,
    medicationId: 'm1',
    hour: 8,
    minute: 0,
    daysMask: 127,
    enabled: true,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('insertMedicationRemindersPreservingIds (GitHub #29)', () => {
  it('inserts new rows preserving id and every field, and skips an id that already exists', async () => {
    const first = await repo.insertMedicationRemindersPreservingIds([
      reminderRow('r1', { hour: 7, minute: 45, daysMask: 31, enabled: false }),
      reminderRow('r2'),
    ]);
    expect(first).toEqual({ inserted: 2, skipped: 0 });

    const second = await repo.insertMedicationRemindersPreservingIds([
      reminderRow('r1', { hour: 23 }),
      reminderRow('r3'),
    ]);
    expect(second).toEqual({ inserted: 1, skipped: 1 });

    const all = await repo.listAllMedicationReminders();
    expect(all.map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r3']);
    // The device's existing r1 was not overwritten by the backup's r1.
    expect(all.find((r) => r.id === 'r1')).toMatchObject({ hour: 7, minute: 45, daysMask: 31, enabled: false });
  });

  it('is a no-op for an empty array', async () => {
    expect(await repo.insertMedicationRemindersPreservingIds([])).toEqual({ inserted: 0, skipped: 0 });
  });

  it('chunks a large restore without dropping or duplicating rows', async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => reminderRow(`r-${i}`));
    expect(await repo.insertMedicationRemindersPreservingIds(rows)).toEqual({ inserted: 1200, skipped: 0 });
    expect(await repo.listAllMedicationReminders()).toHaveLength(1200);
  });
});

describe('insertWatchlistItemsPreservingIds (backup v11)', () => {
  const item = (id: string, term: string, createdAt = 1000): WatchlistItem => ({ id, term, createdAt });

  it('inserts new rows preserving id and createdAt', async () => {
    expect(await repo.insertWatchlistItemsPreservingIds([item('w1', 'lactose', 7), item('w2', 'soy', 8)])).toEqual({
      inserted: 2,
      skipped: 0,
    });
    expect(await repo.listWatchlistItems()).toEqual([item('w1', 'lactose', 7), item('w2', 'soy', 8)]);
  });

  it("skips a row whose id already exists, keeping the device's own entry", async () => {
    await repo.insertWatchlistItemsPreservingIds([item('w1', 'lactose', 7)]);
    const result = await repo.insertWatchlistItemsPreservingIds([item('w1', 'gluten', 9), item('w3', 'egg')]);
    expect(result).toEqual({ inserted: 1, skipped: 1 });
    const all = await repo.listWatchlistItems();
    expect(all.map((r) => [r.id, r.term])).toEqual([
      ['w1', 'lactose'],
      ['w3', 'egg'],
    ]);
  });

  it("skips a row whose term already exists under another id, keeping the device's row and createdAt", async () => {
    await repo.insertWatchlistItemsPreservingIds([item('device-1', 'lactose', 7)]);
    const result = await repo.insertWatchlistItemsPreservingIds([item('backup-1', 'lactose', 99), item('backup-2', 'soy')]);
    expect(result).toEqual({ inserted: 1, skipped: 1 });
    const all = await repo.listWatchlistItems();
    expect(all.find((r) => r.term === 'lactose')).toEqual(item('device-1', 'lactose', 7));
    expect(all.map((r) => r.id).sort()).toEqual(['backup-2', 'device-1']);
  });

  it('de-duplicates by term within the input batch, keeping the first, without violating the unique index', async () => {
    const result = await repo.insertWatchlistItemsPreservingIds([item('a', 'milk'), item('b', 'milk'), item('c', 'egg')]);
    expect(result).toEqual({ inserted: 2, skipped: 1 });
    expect((await repo.listWatchlistItems()).map((r) => r.id).sort()).toEqual(['a', 'c']);
  });

  it('is a no-op for an empty array', async () => {
    expect(await repo.insertWatchlistItemsPreservingIds([])).toEqual({ inserted: 0, skipped: 0 });
  });

  it('chunks a large restore without dropping or duplicating rows', async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => item(`w-${i}`, `term ${i}`));
    expect(await repo.insertWatchlistItemsPreservingIds(rows)).toEqual({ inserted: 1200, skipped: 0 });
    expect(await repo.listWatchlistItems()).toHaveLength(1200);
  });
});
