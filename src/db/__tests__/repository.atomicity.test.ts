// Atomicity tests for every `db.transaction(...)` call in src/db/repository.ts
// (GitHub #18 / docs/HANDOFF.md §3). Each test forces the LAST write inside a
// transaction to fail and asserts that none of the earlier writes in that same
// call persisted.
//
// Several of the nine transactions are pure UPDATE/DELETE sequences with no
// constraint a legitimate caller input can trip (UPDATE-by-id and DELETE-by-id
// never conflict — there are no FK/CHECK constraints in this schema, see
// schema.ts), so a real constraint violation isn't reachable for those. Instead
// every test here uses `armNextStatementFailure` (jest/expo-sqlite-node.ts) to
// deterministically fail one specific statement by matching its generated SQL —
// a standard fault-injection technique for exercising an atomicity boundary,
// not a workaround for anything the fix changes.
//
// IMPORTANT — read before touching src/db/repository.ts: run this file BEFORE
// converting any `db.transaction(async (tx) => { … await … })` callback to a
// synchronous one. Each test below documents, in its own comment, what it
// found pre-fix. After the conversion every test in this file must pass.
import { armNextStatementFailure, clearArmedStatementFailure } from '../../../jest/expo-sqlite-node';
import * as repo from '../repository';
import { closeTestDb, migrateTestDb, resetTestDb } from '../testUtils/testDb';

// Jest hoists jest.mock(...) above the imports above at transform time
// (babel-plugin-jest-hoist), so `../client`'s `openDatabaseSync` call (reached
// via '../repository' and '../testUtils/testDb' above) already sees the fake.
jest.mock('expo-sqlite', () => jest.requireActual('../../../jest/expo-sqlite-node'));

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  clearArmedStatementFailure();
});

afterAll(closeTestDb);

afterEach(() => {
  clearArmedStatementFailure();
});

describe('repository transaction atomicity', () => {
  // Only one statement (a single multi-row INSERT) — SQLite itself makes one
  // statement all-or-nothing regardless of how it's wrapped, so this holds
  // whether or not the surrounding transaction callback is sync. Included for
  // completeness (HANDOFF.md §3 asks for coverage on every transactional
  // write); it is NOT one of the tests that demonstrates the bug.
  it('createLogEntries: nothing persists when its one insert statement fails', async () => {
    armNextStatementFailure(/insert into "log_entry"/i);

    await expect(
      repo.createLogEntries([
        { type: 'symptom', name: 'a', loggedAt: Date.now(), severity: 3 },
        { type: 'symptom', name: 'b', loggedAt: Date.now(), severity: 3 },
      ]),
    ).rejects.toThrow();

    expect(await repo.listLogEntries()).toHaveLength(0);
  });

  // PRE-FIX RESULT: FAILED. The `log_entry` insert (statement 1) committed on
  // its own before the `meal_component` insert (statement 2, armed) ever ran —
  // `getLogEntry(id)` found the entry that should have been rolled back.
  it('createMealWithComponents: rolls back the entry insert when the component insert fails', async () => {
    armNextStatementFailure(/insert into "meal_component"/i);

    await expect(
      repo.createMealWithComponents({ type: 'meal', name: 'Trail mix', loggedAt: Date.now() }, [
        { name: 'Almonds', servings: 1 },
        { name: 'Raisins', servings: 1 },
      ]),
    ).rejects.toThrow();

    expect(await repo.listLogEntries()).toHaveLength(0);
  });

  // PRE-FIX RESULT: FAILED. The component UPDATE (statement, pre-armed target)
  // had already committed by itself; the component's name came back as the
  // EDITED value even though the overall call rejected, instead of the
  // original value the rollback should have restored.
  it('updateMealComponentAndReaggregate: rolls back the component update when the entry re-aggregate fails', async () => {
    const entry = await repo.createMealWithComponents({ type: 'meal', name: 'Bowl', loggedAt: Date.now() }, [
      { name: 'Rice', servings: 1, calories: 200 },
      { name: 'Beans', servings: 1, calories: 100 },
    ]);
    const [rice] = await repo.getMealComponents(entry.id);

    armNextStatementFailure(/update "log_entry" set/i);

    await expect(
      repo.updateMealComponentAndReaggregate(rice.id, {
        name: 'Rice (edited)',
        servings: 1,
        calories: 999,
      }),
    ).rejects.toThrow();

    const reread = await repo.getMealComponent(rice.id);
    expect(reread?.name).toBe('Rice');
    expect(reread?.calories).toBe(200);
  });

  // PRE-FIX RESULT: FAILED. The component DELETE had already committed by
  // itself; the component was gone even though the overall call rejected and
  // the parent entry's aggregate was never patched to match — an orphaned,
  // inconsistent state instead of the delete being rolled back.
  it('deleteMealComponentAndReaggregate: rolls back the component delete when the entry re-aggregate fails', async () => {
    const entry = await repo.createMealWithComponents({ type: 'meal', name: 'Bowl', loggedAt: Date.now() }, [
      { name: 'Rice', servings: 1, calories: 200 },
      { name: 'Beans', servings: 1, calories: 100 },
    ]);
    const [rice] = await repo.getMealComponents(entry.id);

    armNextStatementFailure(/update "log_entry" set/i);

    await expect(repo.deleteMealComponentAndReaggregate(rice.id)).rejects.toThrow();

    const reread = await repo.getMealComponent(rice.id);
    expect(reread).toBeDefined();
    expect(await repo.getMealComponents(entry.id)).toHaveLength(2);
  });

  // PRE-FIX RESULT: FAILED. The log_entry tagsJson update had already
  // committed on its own before the (armed) meal_component update ran — the
  // entry ended up re-tagged even though the overall call rejected and the
  // component was never touched, leaving entry/component tags inconsistent.
  it('applyTagBackfill: rolls back the entry tag update when the component tag update fails', async () => {
    const entry = await repo.createMealWithComponents({ type: 'meal', name: 'Soup', loggedAt: Date.now() }, [
      { name: 'Broth', servings: 1, tagsJson: '["broth"]' },
    ]);
    const [component] = await repo.getMealComponents(entry.id);

    armNextStatementFailure(/update "meal_component" set/i);

    await expect(
      repo.applyTagBackfill(
        [{ id: entry.id, tagsJson: '["backfilled"]' }],
        [{ id: component.id, tagsJson: '["backfilled"]' }],
      ),
    ).rejects.toThrow();

    const rereadEntry = await repo.getLogEntry(entry.id);
    expect(rereadEntry?.tagsJson).toBe('["broth"]');
  });

  // PRE-FIX RESULT: FAILED. The meal_component delete had already committed
  // on its own before the (armed) log_entry delete ran — the entry's
  // components were gone even though the entry itself, and the overall call,
  // did not succeed.
  it('deleteLogEntry: rolls back the component delete when the entry delete fails', async () => {
    const entry = await repo.createMealWithComponents({ type: 'meal', name: 'Bowl', loggedAt: Date.now() }, [
      { name: 'Rice', servings: 1 },
    ]);

    armNextStatementFailure(/delete from "log_entry"/i);

    await expect(repo.deleteLogEntry(entry.id)).rejects.toThrow();

    expect(await repo.getMealComponents(entry.id)).toHaveLength(1);
    expect(await repo.getLogEntry(entry.id)).toBeDefined();
  });

  // PRE-FIX RESULT: FAILED. The medication_event insert had already committed
  // on its own before the (armed) medication_dose insert ran — an event with
  // zero doses existed even though the overall call rejected.
  it('createMedicationEvent: rolls back the event insert when the dose insert fails', async () => {
    const medication = await repo.createMedication({ name: 'Ibuprofen' });

    armNextStatementFailure(/insert into "medication_dose"/i);

    await expect(
      repo.createMedicationEvent({ takenAt: Date.now() }, [{ medicationId: medication.id, dose: 1, doseUnit: 'mg' }]),
    ).rejects.toThrow();

    expect(await repo.listAllMedicationEvents()).toHaveLength(0);
    expect(await repo.listAllMedicationDoses()).toHaveLength(0);
  });

  // PRE-FIX RESULT: FAILED. The medication_event update and the old dose's
  // delete had already committed on their own before the (armed) new-dose
  // insert ran — the event ended up with its NEW takenAt but ZERO doses
  // (the old dose deleted, the new one never inserted) even though the
  // overall call rejected. This is the mirror image of the 2026-09-26
  // stale-doses class the fix's own doc comment calls out: instead of stale
  // doses surviving an edit, a failed edit wiped doses entirely.
  it('updateMedicationEvent: rolls back the event update and dose replacement when the new dose insert fails', async () => {
    const medication = await repo.createMedication({ name: 'Ibuprofen' });
    const originalTakenAt = Date.now() - 1000;
    const { event } = await repo.createMedicationEvent({ takenAt: originalTakenAt }, [
      { medicationId: medication.id, dose: 1, doseUnit: 'mg' },
    ]);

    armNextStatementFailure(/insert into "medication_dose"/i);

    await expect(
      repo.updateMedicationEvent(event.id, { takenAt: Date.now() }, [
        { medicationId: medication.id, dose: 2, doseUnit: 'mg' },
      ]),
    ).rejects.toThrow();

    const reread = await repo.getMedicationEvent(event.id);
    expect(reread?.event.takenAt).toBe(originalTakenAt);
    expect(reread?.doses).toHaveLength(1);
    expect(reread?.doses[0]?.dose).toBe(1);
  });

  // PRE-FIX RESULT: FAILED. The dose delete had already committed on its own
  // before the (armed) event delete ran — the event survived with zero doses
  // even though the overall call rejected.
  it('deleteMedicationEvent: rolls back the dose delete when the event delete fails', async () => {
    const medication = await repo.createMedication({ name: 'Ibuprofen' });
    const { event } = await repo.createMedicationEvent({ takenAt: Date.now() }, [
      { medicationId: medication.id, dose: 1, doseUnit: 'mg' },
    ]);

    armNextStatementFailure(/delete from "medication_event"/i);

    await expect(repo.deleteMedicationEvent(event.id)).rejects.toThrow();

    const reread = await repo.getMedicationEvent(event.id);
    expect(reread?.doses).toHaveLength(1);
  });
});
