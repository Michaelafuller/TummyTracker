import type { LogEntry, MealComponent } from '@/db/schema';
import { runTagBackfillOnce } from '@/db/tagBackfillRunner';
import { loadPrefs } from '@/lib/prefs';
import { listAllMealComponents, listLogEntries } from '@/db/repository';
import { serializeTags } from '../ingredients';
import { planTagBackfill, rederiveRowTags } from '../tagBackfill';

jest.mock('@/lib/prefs', () => ({
  loadPrefs: jest.fn(),
  savePrefs: jest.fn(),
}));

jest.mock('@/db/repository', () => ({
  listLogEntries: jest.fn(),
  listAllMealComponents: jest.fn(),
  applyTagBackfill: jest.fn(),
}));

function entry(overrides: Partial<LogEntry> & { id: string }): LogEntry {
  return {
    type: 'meal',
    mealSlot: null,
    name: 'Entry',
    barcode: null,
    loggedAt: 0,
    sentiment: null,
    bristolScale: null,
    symptomType: null,
    severity: null,
    notes: null,
    ingredientsText: null,
    tagsJson: null,
    servingG: null,
    calories: null,
    fatG: null,
    saturatedFatG: null,
    carbsG: null,
    proteinG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    componentCount: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function component(overrides: Partial<MealComponent> & { id: string; entryId: string }): MealComponent {
  return {
    name: 'Component',
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
    createdAt: 0,
    ...overrides,
  };
}

describe('rederiveRowTags', () => {
  it('recovers parenthetical sub-ingredients, keeping existing tags first and order preserved', () => {
    const existing = serializeTags(['tofu']);
    const result = rederiveRowTags(existing, 'Tofu (water, soybeans, calcium sulfate)');
    expect(result).not.toBeNull();
    const tags = JSON.parse(result as string) as string[];
    expect(tags[0]).toBe('tofu');
    expect(tags).toContain('water');
    expect(tags).toContain('soybeans');
    expect(tags).toContain('calcium sulfate');
  });

  it('is additive-only: a tag whose word no longer appears in the text survives', () => {
    const existing = serializeTags(['tofu', 'gluten']);
    const result = rederiveRowTags(existing, 'Tofu');
    // "gluten" isn't re-extracted from the new text, but it must not be dropped.
    // Since extractTags("Tofu") only yields "tofu" (already present), the union
    // doesn't grow, so no update is produced — existing tags are untouched.
    expect(result).toBeNull();
  });

  it('produces no update when the text is a subset of existing tags', () => {
    const existing = serializeTags(['tofu', 'water', 'soybeans']);
    const result = rederiveRowTags(existing, 'Tofu (water, soybeans)');
    expect(result).toBeNull();
  });

  it('produces no update from null/empty ingredientsText', () => {
    expect(rederiveRowTags(serializeTags(['tofu']), null)).toBeNull();
    expect(rederiveRowTags(serializeTags(['tofu']), '')).toBeNull();
  });
});

describe('planTagBackfill', () => {
  it('produces an entry update when the union grows, keeping existing tags first', () => {
    const entries = [
      entry({
        id: 'e1',
        tagsJson: serializeTags(['tofu']),
        ingredientsText: 'Tofu (water, soybeans, calcium sulfate)',
      }),
    ];
    const plan = planTagBackfill(entries, new Map());
    expect(plan.entryUpdates).toHaveLength(1);
    expect(plan.entryUpdates[0].id).toBe('e1');
    const tags = JSON.parse(plan.entryUpdates[0].tagsJson) as string[];
    expect(tags[0]).toBe('tofu');
    expect(tags).toEqual(expect.arrayContaining(['water', 'soybeans', 'calcium sulfate']));
    expect(plan.componentUpdates).toHaveLength(0);
  });

  it('produces no update when the union does not grow', () => {
    const entries = [
      entry({
        id: 'e1',
        tagsJson: serializeTags(['tofu', 'water', 'soybeans']),
        ingredientsText: 'Tofu (water, soybeans)',
      }),
    ];
    const plan = planTagBackfill(entries, new Map());
    expect(plan.entryUpdates).toHaveLength(0);
  });

  it('is idempotent: re-planning over the updated rows yields zero updates', () => {
    const entries = [
      entry({
        id: 'e1',
        tagsJson: serializeTags(['tofu']),
        ingredientsText: 'Tofu (water, soybeans, calcium sulfate)',
      }),
    ];
    const firstPlan = planTagBackfill(entries, new Map());
    expect(firstPlan.entryUpdates).toHaveLength(1);

    const updatedEntries = [{ ...entries[0], tagsJson: firstPlan.entryUpdates[0].tagsJson }];
    const secondPlan = planTagBackfill(updatedEntries, new Map());
    expect(secondPlan.entryUpdates).toHaveLength(0);
    expect(secondPlan.componentUpdates).toHaveLength(0);
  });

  it('a multi-component parent gains a tag recovered on a component and stays a superset', () => {
    const entries = [
      entry({
        id: 'e1',
        tagsJson: serializeTags(['meal']),
        ingredientsText: null,
      }),
    ];
    const components = new Map([
      [
        'e1',
        [
          component({
            id: 'c1',
            entryId: 'e1',
            tagsJson: serializeTags(['tofu']),
            ingredientsText: 'Tofu (water, soybeans, calcium sulfate)',
          }),
          component({
            id: 'c2',
            entryId: 'e1',
            tagsJson: serializeTags(['rice']),
            ingredientsText: 'Rice',
          }),
        ],
      ],
    ]);

    const plan = planTagBackfill(entries, components);

    expect(plan.componentUpdates).toHaveLength(1);
    expect(plan.componentUpdates[0].id).toBe('c1');
    const componentTags = JSON.parse(plan.componentUpdates[0].tagsJson) as string[];
    expect(componentTags).toEqual(expect.arrayContaining(['tofu', 'water', 'soybeans', 'calcium sulfate']));

    expect(plan.entryUpdates).toHaveLength(1);
    const parentTags = JSON.parse(plan.entryUpdates[0].tagsJson) as string[];
    expect(parentTags[0]).toBe('meal'); // existing entry tags stay first
    // Parent stays a superset of every (post-re-derive) component tag.
    for (const t of componentTags) expect(parentTags).toContain(t);
    expect(parentTags).toContain('rice');
  });

  it('skips non-food entry types', () => {
    const entries = [
      entry({
        id: 'bm1',
        type: 'bowel_movement',
        tagsJson: serializeTags(['tofu']),
        ingredientsText: 'Tofu (water, soybeans)',
      }),
      entry({
        id: 's1',
        type: 'symptom',
        tagsJson: serializeTags(['tofu']),
        ingredientsText: 'Tofu (water, soybeans)',
      }),
    ];
    const plan = planTagBackfill(entries, new Map());
    expect(plan.entryUpdates).toHaveLength(0);
  });

  it('handles null/empty ingredientsText on the parent while still running the component-union step', () => {
    const entries = [entry({ id: 'e1', tagsJson: null, ingredientsText: null })];
    const components = new Map([
      ['e1', [component({ id: 'c1', entryId: 'e1', tagsJson: serializeTags(['rice']), ingredientsText: null })]],
    ]);
    const plan = planTagBackfill(entries, components);
    expect(plan.entryUpdates).toHaveLength(1);
    expect(JSON.parse(plan.entryUpdates[0].tagsJson)).toEqual(['rice']);
    expect(plan.componentUpdates).toHaveLength(0); // component itself had nothing new to recover
  });
});

describe('runTagBackfillOnce', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('short-circuits before any DB read when tagBackfillV1Done is already set', async () => {
    (loadPrefs as jest.Mock).mockResolvedValue({ offlineMode: false, tagBackfillV1Done: true });

    await runTagBackfillOnce();

    expect(listLogEntries as jest.Mock).not.toHaveBeenCalled();
    expect(listAllMealComponents as jest.Mock).not.toHaveBeenCalled();
  });
});
