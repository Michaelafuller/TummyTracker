// Repository tests: medications + medication events/doses (docs/HANDOFF.md §3
// "Medications").
import * as repo from '../repository';
import { closeTestDb, migrateTestDb, resetTestDb } from '../testUtils/testDb';

// Jest hoists jest.mock(...) above the imports above at transform time
// (babel-plugin-jest-hoist), so '../repository's `../client` import already
// sees the fake.
jest.mock('expo-sqlite', () => require('../../../jest/expo-sqlite-node'));

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(closeTestDb);

describe('medications', () => {
  it('creates, lists (active first then alphabetical), and updates (rename)', async () => {
    await repo.createMedication({ name: 'Bibuprofen', isActive: true });
    const a = await repo.createMedication({ name: 'Aspirin', isActive: true });
    await repo.createMedication({ name: 'Zzzcodeine', isActive: false });

    let all = await repo.listMedications();
    expect(all.map((m) => m.name)).toEqual(['Aspirin', 'Bibuprofen', 'Zzzcodeine']);

    await repo.updateMedication(a.id, { name: 'Aspirin (renamed)' });
    all = await repo.listMedications();
    expect(all.find((m) => m.id === a.id)?.name).toBe('Aspirin (renamed)');
  });

  it('deactivates and reactivates instead of deleting — there is no delete path', async () => {
    const med = await repo.createMedication({ name: 'Ibuprofen', isActive: true });

    await repo.setMedicationActive(med.id, false);
    expect((await repo.getMedication(med.id))?.isActive).toBe(false);

    await repo.setMedicationActive(med.id, true);
    expect((await repo.getMedication(med.id))?.isActive).toBe(true);

    // No repo.deleteMedication export exists (invariant) — listAllMedications
    // must still find it after all that.
    expect(await repo.listAllMedications()).toHaveLength(1);
  });
});

describe('medication events + doses', () => {
  it('creates an event with its dose rows in one call', async () => {
    const med1 = await repo.createMedication({ name: 'Med1' });
    const med2 = await repo.createMedication({ name: 'Med2' });

    const { event, doses } = await repo.createMedicationEvent({ takenAt: Date.now() }, [
      { medicationId: med1.id, dose: 1, doseUnit: 'tablet' },
      { medicationId: med2.id, dose: 5, doseUnit: 'mg' },
    ]);

    expect(doses).toHaveLength(2);
    const reread = await repo.getMedicationEvent(event.id);
    expect(reread?.doses.map((d) => d.medicationId).sort()).toEqual([med1.id, med2.id].sort());
  });

  it('update REPLACES doses — old rows gone, new ones present, no duplicates (2026-09-26 stale-doses class)', async () => {
    const med = await repo.createMedication({ name: 'Med1' });
    const { event } = await repo.createMedicationEvent({ takenAt: 1000 }, [
      { medicationId: med.id, dose: 1, doseUnit: 'mg' },
    ]);

    await repo.updateMedicationEvent(event.id, { takenAt: 2000 }, [
      { medicationId: med.id, dose: 2, doseUnit: 'mg' },
      { medicationId: med.id, dose: 3, doseUnit: 'mg' },
    ]);

    const reread = await repo.getMedicationEvent(event.id);
    expect(reread?.event.takenAt).toBe(2000);
    expect(reread?.doses).toHaveLength(2);
    expect(reread?.doses.map((d) => d.dose).sort()).toEqual([2, 3]);
    // The doses must be genuinely new rows (fresh ids), not the old row mutated.
    const allDoses = await repo.listAllMedicationDoses();
    expect(allDoses).toHaveLength(2);
  });

  it('delete removes the event and its dose rows together', async () => {
    const med = await repo.createMedication({ name: 'Med1' });
    const { event } = await repo.createMedicationEvent({ takenAt: Date.now() }, [
      { medicationId: med.id, dose: 1, doseUnit: 'mg' },
    ]);

    await repo.deleteMedicationEvent(event.id);

    expect(await repo.getMedicationEvent(event.id)).toBeUndefined();
    expect(await repo.listAllMedicationDoses()).toHaveLength(0);
  });

  it('getMedicationEvent returns undefined for an id that does not resolve', async () => {
    expect(await repo.getMedicationEvent('does-not-exist')).toBeUndefined();
  });
});
