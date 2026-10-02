// Repository tests: saved meals / "My meals" (GitHub #25) — create, replace by
// id, replace by name clash, delete, the opt-in tag backfill, the backup
// restore insert, and atomicity of each transaction.
import { armNextStatementFailure, clearArmedStatementFailure } from '../../../jest/expo-sqlite-node';
import type { MealComponentDraft } from '@/lib/mealAggregate';
import * as repo from '../repository';
import { db, sqlite } from '../client';
import {
  logEntry,
  mealComponent,
  savedMealComponent,
  type LogEntry,
  type SavedMeal,
  type SavedMealComponent,
} from '../schema';
import { closeTestDb, migrateTestDb, resetTestDb } from '../testUtils/testDb';

jest.mock('expo-sqlite', () => jest.requireActual('../../../jest/expo-sqlite-node'));

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  clearArmedStatementFailure();
});

afterEach(() => {
  clearArmedStatementFailure();
});

afterAll(closeTestDb);

function draft(name: string, overrides: Partial<MealComponentDraft> = {}): MealComponentDraft {
  return { name, servings: 1, calories: 100, tagsJson: JSON.stringify([name.toLowerCase()]), ...overrides };
}

async function names(savedMealId: string): Promise<string[]> {
  const all = await repo.listSavedMeals();
  return all.find((m) => m.meal.id === savedMealId)?.components.map((c) => c.name) ?? [];
}

describe('saveSavedMeal / listSavedMeals', () => {
  it('creates a template with its items in order and stores the trimmed name + nameKey', async () => {
    const saved = await repo.saveSavedMeal({
      name: '  Chicken Rice ',
      type: 'meal',
      mealSlot: 'dinner',
      components: [draft('Rice', { servings: 1.5 }), draft('Chicken')],
    });

    expect(saved).toMatchObject({ name: 'Chicken Rice', nameKey: 'chicken rice', type: 'meal', mealSlot: 'dinner' });
    const list = await repo.listSavedMeals();
    expect(list).toHaveLength(1);
    expect(list[0].components.map((c) => [c.name, c.servings, c.sortOrder])).toEqual([
      ['Rice', 1.5, 0],
      ['Chicken', 1, 1],
    ]);
    expect(list[0].components.every((c) => c.savedMealId === saved.id)).toBe(true);
  });

  it('lists A-Z by name, case-insensitively', async () => {
    for (const name of ['banana smoothie', 'Apple pie', 'cereal']) {
      await repo.saveSavedMeal({ name, type: 'meal', mealSlot: null, components: [draft('x')] });
    }
    expect((await repo.listSavedMeals()).map((m) => m.meal.name)).toEqual([
      'Apple pie',
      'banana smoothie',
      'cereal',
    ]);
  });

  it('never creates a log entry or a meal component', async () => {
    await repo.saveSavedMeal({ name: 'Toast', type: 'snack', mealSlot: null, components: [draft('Bread')] });
    expect(await repo.listLogEntries()).toHaveLength(0);
    expect(await db.select().from(mealComponent)).toHaveLength(0);
  });

  it('replaces by id: new fields, ALL items swapped, createdAt kept, id kept', async () => {
    const created = await repo.saveSavedMeal({
      name: 'Oatmeal',
      type: 'meal',
      mealSlot: 'breakfast',
      components: [draft('Oats'), draft('Milk')],
    });

    const edited = await repo.saveSavedMeal({
      id: created.id,
      name: 'Oatmeal deluxe',
      type: 'snack',
      mealSlot: null,
      components: [draft('Oats', { servings: 2 })],
    });

    expect(edited.id).toBe(created.id);
    expect(edited.createdAt).toBe(created.createdAt);
    const list = await repo.listSavedMeals();
    expect(list).toHaveLength(1);
    expect(list[0].meal).toMatchObject({ name: 'Oatmeal deluxe', nameKey: 'oatmeal deluxe', type: 'snack', mealSlot: null });
    expect(list[0].components.map((c) => [c.name, c.servings])).toEqual([['Oats', 2]]);
  });

  it('editing a template without renaming it does not clash with itself', async () => {
    const created = await repo.saveSavedMeal({ name: 'Oatmeal', type: 'meal', mealSlot: null, components: [draft('Oats')] });
    await expect(
      repo.saveSavedMeal({ id: created.id, name: 'OATMEAL', type: 'meal', mealSlot: null, components: [draft('Oats'), draft('Milk')] }),
    ).resolves.toMatchObject({ id: created.id, name: 'OATMEAL' });
    expect(await names(created.id)).toEqual(['Oats', 'Milk']);
  });

  it('a name clash without replaceId throws and writes nothing', async () => {
    const existing = await repo.saveSavedMeal({ name: 'Oatmeal', type: 'meal', mealSlot: null, components: [draft('Oats')] });

    await expect(
      repo.saveSavedMeal({ name: ' oatmeal ', type: 'snack', mealSlot: null, components: [draft('Other')] }),
    ).rejects.toBeInstanceOf(repo.SavedMealNameTakenError);

    const list = await repo.listSavedMeals();
    expect(list).toHaveLength(1);
    expect(list[0].meal).toEqual(existing);
    expect(list[0].components.map((c) => c.name)).toEqual(['Oats']);
  });

  it('replace by name clash (create): overwrites the existing template in place, one row, new items', async () => {
    const existing = await repo.saveSavedMeal({
      name: 'Oatmeal',
      type: 'meal',
      mealSlot: 'breakfast',
      components: [draft('Oats'), draft('Milk')],
    });

    const replaced = await repo.saveSavedMeal({
      name: 'oatmeal',
      type: 'snack',
      mealSlot: null,
      components: [draft('Porridge')],
      replaceId: existing.id,
    });

    expect(replaced.id).toBe(existing.id);
    const list = await repo.listSavedMeals();
    expect(list).toHaveLength(1);
    expect(list[0].meal).toMatchObject({ name: 'oatmeal', type: 'snack', mealSlot: null });
    expect(list[0].components.map((c) => c.name)).toEqual(['Porridge']);
  });

  it('rename into another template\'s name with replaceId: the edited template survives, the other is deleted with its items', async () => {
    const a = await repo.saveSavedMeal({ name: 'A', type: 'meal', mealSlot: null, components: [draft('a1')] });
    const b = await repo.saveSavedMeal({ name: 'B', type: 'meal', mealSlot: null, components: [draft('b1'), draft('b2')] });

    const result = await repo.saveSavedMeal({
      id: a.id,
      name: 'b',
      type: 'meal',
      mealSlot: null,
      components: [draft('a1'), draft('a2')],
      replaceId: b.id,
    });

    expect(result.id).toBe(a.id);
    const list = await repo.listSavedMeals();
    expect(list).toHaveLength(1);
    expect(list[0].meal).toMatchObject({ id: a.id, name: 'b', nameKey: 'b' });
    expect(list[0].components.map((c) => c.name)).toEqual(['a1', 'a2']);
    expect(await db.select().from(savedMealComponent)).toHaveLength(2);
  });

  it('rename into another name WITHOUT replaceId throws and changes nothing', async () => {
    const a = await repo.saveSavedMeal({ name: 'A', type: 'meal', mealSlot: null, components: [draft('a1')] });
    await repo.saveSavedMeal({ name: 'B', type: 'meal', mealSlot: null, components: [draft('b1')] });

    await expect(
      repo.saveSavedMeal({ id: a.id, name: 'B', type: 'meal', mealSlot: null, components: [draft('zzz')] }),
    ).rejects.toBeInstanceOf(repo.SavedMealNameTakenError);

    expect(await names(a.id)).toEqual(['a1']);
    expect(await repo.listSavedMeals()).toHaveLength(2);
  });

  it('editing an unknown id throws', async () => {
    await expect(
      repo.saveSavedMeal({ id: 'nope', name: 'X', type: 'meal', mealSlot: null, components: [] }),
    ).rejects.toThrow(/no saved meal/i);
  });

  it('findSavedMealByNameKey finds by key', async () => {
    const created = await repo.saveSavedMeal({ name: 'Oatmeal', type: 'meal', mealSlot: null, components: [] });
    expect((await repo.findSavedMealByNameKey('oatmeal'))?.id).toBe(created.id);
    expect(await repo.findSavedMealByNameKey('missing')).toBeUndefined();
  });
});

describe('deleteSavedMeal', () => {
  it('removes the meal and all its items, leaving other templates and past meals alone', async () => {
    const keep = await repo.saveSavedMeal({ name: 'Keep', type: 'meal', mealSlot: null, components: [draft('k1')] });
    const gone = await repo.saveSavedMeal({ name: 'Gone', type: 'meal', mealSlot: null, components: [draft('g1'), draft('g2')] });
    const past = await repo.createLogEntry({ type: 'meal', name: 'Gone', loggedAt: 1 });

    await repo.deleteSavedMeal(gone.id);

    const list = await repo.listSavedMeals();
    expect(list.map((m) => m.meal.id)).toEqual([keep.id]);
    expect(list[0].components).toHaveLength(1);
    expect(await db.select().from(savedMealComponent)).toHaveLength(1);
    expect((await repo.getLogEntry(past.id))?.name).toBe('Gone');
  });
});

describe('backfillSavedMealTags', () => {
  async function insertEntry(overrides: Partial<LogEntry> & { id: string }): Promise<void> {
    await db.insert(logEntry).values({
      type: 'meal',
      name: 'Oatmeal',
      loggedAt: 1000,
      createdAt: 500,
      updatedAt: 500,
      ...overrides,
    });
  }

  async function row(id: string): Promise<LogEntry> {
    const found = await repo.getLogEntry(id);
    if (!found) throw new Error(`missing ${id}`);
    return found;
  }

  it('updates only the targets and leaves tagged / other-name / non-food rows byte-identical', async () => {
    await insertEntry({ id: 'target1' });
    await insertEntry({ id: 'target2', name: '  OATMEAL ', type: 'snack', tagsJson: '[]', ingredientsText: 'my own text' });
    await insertEntry({ id: 'tagged', tagsJson: '["oats"]' });
    await insertEntry({ id: 'other', name: 'Toast' });
    await insertEntry({ id: 'bm', type: 'bowel_movement' });
    await insertEntry({ id: 'symptom', type: 'symptom', symptomType: 'bloating', severity: 3 });
    const untouchedIds = ['tagged', 'other', 'bm', 'symptom'];
    const before = await Promise.all(untouchedIds.map(row));

    const count = await repo.backfillSavedMealTags('oatmeal', ['oats', 'milk'], 'oats, milk');

    expect(count).toBe(2);
    const t1 = await row('target1');
    expect(t1.tagsJson).toBe('["oats","milk"]');
    expect(t1.ingredientsText).toBe('oats, milk');
    expect(t1.updatedAt).toBeGreaterThan(500);
    const t2 = await row('target2');
    expect(t2.tagsJson).toBe('["oats","milk"]');
    expect(t2.ingredientsText).toBe('my own text'); // only set when null/empty
    expect(await Promise.all(untouchedIds.map(row))).toEqual(before);
  });

  it('never touches the components of a target entry', async () => {
    await insertEntry({ id: 'target', componentCount: 1 });
    await db.insert(mealComponent).values({ id: 'c1', entryId: 'target', name: 'Oats', servings: 1, tagsJson: null, sortOrder: 0, createdAt: 500 });
    const before = await db.select().from(mealComponent);

    await repo.backfillSavedMealTags('oatmeal', ['oats'], 'oats');

    expect(await db.select().from(mealComponent)).toEqual(before);
  });

  it('recomputes targets inside the call: an entry tagged since the UI counted is skipped', async () => {
    await insertEntry({ id: 'a' });
    await insertEntry({ id: 'b' });
    await repo.updateLogEntry('b', { tagsJson: '["oats"]' });

    expect(await repo.backfillSavedMealTags('oatmeal', ['oats'], null)).toBe(1);
    expect((await row('b')).tagsJson).toBe('["oats"]');
    expect((await row('a')).tagsJson).toBe('["oats"]');
  });

  it('returns 0 and writes nothing when there are no tags or no targets', async () => {
    await insertEntry({ id: 'a' });
    const before = await row('a');
    expect(await repo.backfillSavedMealTags('oatmeal', [], 'x')).toBe(0);
    expect(await repo.backfillSavedMealTags('toast', ['bread'], null)).toBe(0);
    expect(await row('a')).toEqual(before);
  });

  it('a null/blank template ingredientsText leaves the entry text alone', async () => {
    await insertEntry({ id: 'a' });
    await repo.backfillSavedMealTags('oatmeal', ['oats'], '   ');
    const after = await row('a');
    expect(after.tagsJson).toBe('["oats"]');
    expect(after.ingredientsText).toBeNull();
  });
});

describe('backfillSavedMealTags on meals logged through the builder (review 2026-09-30)', () => {
  // Every meal since the meal builder is saved by createMealWithComponents,
  // whose tag union always includes each item's own name — so "no ingredients"
  // means "no tags beyond item/meal names", never "no tags at all".
  async function logPast(name: string, items: MealComponentDraft[]): Promise<LogEntry> {
    return repo.createMealWithComponents({ type: 'meal', name, loggedAt: 1000, mealSlot: null }, items);
  }

  it('fills a past name-only meal (one manual item, no ingredients), keeping its name tag', async () => {
    const past = await logPast("Mom's lasagna", [{ name: "Mom's lasagna", servings: 1 }]);
    expect(JSON.parse(past.tagsJson ?? '[]')).toEqual(["mom's lasagna"]);

    const count = await repo.backfillSavedMealTags("mom's lasagna", ["mom's lasagna", 'pasta', 'cheese'], 'pasta, cheese');

    expect(count).toBe(1);
    const after = await repo.getLogEntry(past.id);
    expect(JSON.parse(after?.tagsJson ?? '[]')).toEqual(["mom's lasagna", 'pasta', 'cheese']);
    // Its display text was already its item name — only an empty text is filled.
    expect(after?.ingredientsText).toBe(past.ingredientsText);
  });

  it('fills a past multi-item meal whose items carry no ingredients', async () => {
    const past = await logPast("Mom's lasagna", [
      { name: 'Lasagna', servings: 1 },
      { name: 'Garlic bread', servings: 1 },
    ]);
    expect(await repo.backfillSavedMealTags("mom's lasagna", ['pasta'], null)).toBe(1);
    expect(JSON.parse((await repo.getLogEntry(past.id))?.tagsJson ?? '[]')).toEqual(['lasagna', 'garlic bread', 'pasta']);
  });

  it('never touches a same-name meal whose items already carry ingredient tags', async () => {
    const past = await logPast("Mom's lasagna", [{ name: 'Lasagna', servings: 1, tagsJson: '["wheat"]' }]);
    const before = await repo.getLogEntry(past.id);
    expect(await repo.backfillSavedMealTags("mom's lasagna", ['pasta'], null)).toBe(0);
    expect(await repo.getLogEntry(past.id)).toEqual(before);
  });
});

describe('insertSavedMealsPreservingIds (restore)', () => {
  function mealRow(id: string, name: string): SavedMeal {
    return { id, name, nameKey: name.trim().toLowerCase(), type: 'meal', mealSlot: null, createdAt: 1, updatedAt: 1 };
  }
  function compRow(id: string, savedMealId: string, name: string): SavedMealComponent {
    return {
      id,
      savedMealId,
      name,
      barcode: null,
      servings: 1,
      servingG: null,
      calories: null,
      fatG: null,
      saturatedFatG: null,
      carbsG: null,
      proteinG: null,
      fiberG: null,
      sugarG: null,
      sodiumMg: null,
      ingredientsText: null,
      tagsJson: null,
      sortOrder: 0,
      createdAt: 1,
    };
  }

  it('inserts meals and their items with ids preserved', async () => {
    const result = await repo.insertSavedMealsPreservingIds([mealRow('m1', 'Oatmeal')], [compRow('c1', 'm1', 'Oats')]);
    expect(result).toEqual({ inserted: 1, skipped: 0 });
    const list = await repo.listSavedMeals();
    expect(list[0].meal.id).toBe('m1');
    expect(list[0].components.map((c) => c.id)).toEqual(['c1']);
  });

  it('skips a meal whose nameKey exists on the device, keeping the device row and its items', async () => {
    const device = await repo.saveSavedMeal({ name: 'oatmeal', type: 'meal', mealSlot: null, components: [draft('Device oats')] });

    const result = await repo.insertSavedMealsPreservingIds(
      [mealRow('m1', 'Oatmeal'), mealRow('m2', 'Toast')],
      [compRow('c1', 'm1', 'Backup oats'), compRow('c2', 'm2', 'Bread')],
    );

    expect(result).toEqual({ inserted: 1, skipped: 1 });
    const list = await repo.listSavedMeals();
    expect(list.map((m) => m.meal.name)).toEqual(['oatmeal', 'Toast']);
    expect(list[0].meal.id).toBe(device.id);
    expect(list[0].components.map((c) => c.name)).toEqual(['Device oats']);
    expect(list[1].components.map((c) => c.name)).toEqual(['Bread']);
  });

  it('skips a meal whose id exists on the device (even under another name)', async () => {
    const device = await repo.saveSavedMeal({ name: 'Device name', type: 'meal', mealSlot: null, components: [draft('d')] });
    const result = await repo.insertSavedMealsPreservingIds([mealRow(device.id, 'Renamed')], [compRow('c9', device.id, 'x')]);
    expect(result).toEqual({ inserted: 0, skipped: 1 });
    expect(await names(device.id)).toEqual(['d']);
  });

  it('de-duplicates names inside one file (first wins) and ignores orphan items', async () => {
    const result = await repo.insertSavedMealsPreservingIds(
      [mealRow('m1', 'Oatmeal'), mealRow('m2', ' OATMEAL')],
      [compRow('c1', 'm1', 'a'), compRow('c2', 'm2', 'b'), compRow('c3', 'ghost', 'c')],
    );
    expect(result).toEqual({ inserted: 1, skipped: 1 });
    const list = await repo.listSavedMeals();
    expect(list).toHaveLength(1);
    expect(list[0].components.map((c) => c.id)).toEqual(['c1']);
  });

  it('is idempotent: importing the same file twice inserts once', async () => {
    const meals = [mealRow('m1', 'Oatmeal')];
    const comps = [compRow('c1', 'm1', 'Oats')];
    await repo.insertSavedMealsPreservingIds(meals, comps);
    expect(await repo.insertSavedMealsPreservingIds(meals, comps)).toEqual({ inserted: 0, skipped: 1 });
    expect((await repo.listSavedMeals())[0].components).toHaveLength(1);
  });
});

describe('saved-meal transaction atomicity', () => {
  it('create: rolls back the template when the item insert fails', async () => {
    armNextStatementFailure(/insert into "saved_meal_component"/i);

    await expect(
      repo.saveSavedMeal({ name: 'Oatmeal', type: 'meal', mealSlot: null, components: [draft('Oats')] }),
    ).rejects.toThrow();

    expect(await repo.listSavedMeals()).toHaveLength(0);
  });

  it('replace by id: rolls back the field update and the item delete when the new items fail to insert', async () => {
    const created = await repo.saveSavedMeal({
      name: 'Oatmeal',
      type: 'meal',
      mealSlot: 'breakfast',
      components: [draft('Oats'), draft('Milk')],
    });
    armNextStatementFailure(/insert into "saved_meal_component"/i);

    await expect(
      repo.saveSavedMeal({ id: created.id, name: 'Renamed', type: 'snack', mealSlot: null, components: [draft('New')] }),
    ).rejects.toThrow();

    const list = await repo.listSavedMeals();
    expect(list).toHaveLength(1);
    expect(list[0].meal).toEqual(created);
    expect(list[0].components.map((c) => c.name)).toEqual(['Oats', 'Milk']);
  });

  it('rename + Replace: rolls back the other template\'s deletion when the later write fails', async () => {
    const a = await repo.saveSavedMeal({ name: 'A', type: 'meal', mealSlot: null, components: [draft('a1')] });
    const b = await repo.saveSavedMeal({ name: 'B', type: 'meal', mealSlot: null, components: [draft('b1')] });
    armNextStatementFailure(/insert into "saved_meal_component"/i);

    await expect(
      repo.saveSavedMeal({ id: a.id, name: 'B', type: 'meal', mealSlot: null, components: [draft('x')], replaceId: b.id }),
    ).rejects.toThrow();

    const list = await repo.listSavedMeals();
    expect(list.map((m) => m.meal.name)).toEqual(['A', 'B']);
    expect(await names(b.id)).toEqual(['b1']);
    expect(await names(a.id)).toEqual(['a1']);
  });

  it('delete: rolls back the item delete when the meal delete fails', async () => {
    const created = await repo.saveSavedMeal({ name: 'Oatmeal', type: 'meal', mealSlot: null, components: [draft('Oats')] });
    // The item delete runs first; fail the meal delete (`"saved_meal" where`, not `"saved_meal_component"`).
    armNextStatementFailure(/delete from "saved_meal" where/i);

    await expect(repo.deleteSavedMeal(created.id)).rejects.toThrow();

    expect(await names(created.id)).toEqual(['Oats']);
  });

  it('backfill: rolls back earlier entry updates when a later one fails', async () => {
    for (const id of ['a', 'b', 'c']) {
      await db.insert(logEntry).values({ id, type: 'meal', name: 'Oatmeal', loggedAt: 1, createdAt: 1, updatedAt: 1 });
    }
    // Targets are updated in row order (a, b, c): make the LAST update fail so the
    // first two have already been written inside the transaction.
    sqlite.execSync(
      "CREATE TRIGGER fail_backfill BEFORE UPDATE ON log_entry WHEN NEW.id = 'c' " +
        "BEGIN SELECT RAISE(ABORT, 'boom'); END;",
    );
    try {
      await expect(repo.backfillSavedMealTags('oatmeal', ['oats'], 'oats')).rejects.toThrow();
    } finally {
      sqlite.execSync('DROP TRIGGER fail_backfill;');
    }

    for (const id of ['a', 'b', 'c']) {
      const entry = await repo.getLogEntry(id);
      expect(entry?.tagsJson).toBeNull();
      expect(entry?.ingredientsText).toBeNull();
      expect(entry?.updatedAt).toBe(1);
    }
  });
});
