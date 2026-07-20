// Regression test for HANDOFF.md Phase 2.6: grouped meals must stay invisible to
// the analyzers as a special case — they consume plain LogEntry rows, and a
// grouped meal's tagsJson is the union computed by unionComponentTags at save
// time. This locks in that a meal built from two tagged components is visible
// to both analyzers under BOTH of its component tags, not just one.

import type { LogEntry } from '@/db/schema';
import { defaultComponentFormState, buildComponentDraft } from '@/features/logging/componentFormModel';
import { buildMealEntry, type MealReviewFormState } from '@/features/logging/mealReviewFormModel';
import { mapOffResponse, offProductToComponentFormState } from '@/lib/openFoodFacts';
import { parseTagsJson, serializeTags } from '@/lib/ingredients';
import { unionComponentTags, type MealComponentDraft } from '@/lib/mealAggregate';
import { analyzeIngredientSentiment, MIN_TAG_OCCURRENCES } from '../insights';
import { analyzeTemporalTriggers, DEFAULT_MIN_MEALS } from '../temporal';

function draft(name: string, tagsJson: string): MealComponentDraft {
  return {
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
    tagsJson,
    sortOrder: 0,
  };
}

let seq = 0;
function groupedMealEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  const components = [draft('Milk sauce', '["milk"]'), draft('Fried onion', '["onion"]')];
  const tagsJson = serializeTags(unionComponentTags(components));
  return {
    id: `meal${seq++}`,
    type: 'meal',
    mealSlot: null,
    name: 'Milk sauce + 1 more',
    barcode: null,
    loggedAt: 0,
    sentiment: 2,
    bristolScale: null,
    symptomType: null,
    severity: null,
    notes: null,
    ingredientsText: 'Milk sauce, Fried onion',
    tagsJson,
    calories: null,
    fatG: null,
    saturatedFatG: null,
    carbsG: null,
    proteinG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    servingG: null,
    componentCount: 2,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('grouped-meal analysis compatibility (Phase 2.6)', () => {
  it('a grouped meal tagsJson carries both component tags', () => {
    const entry = groupedMealEntry();
    expect(entry.tagsJson).toContain('milk');
    expect(entry.tagsJson).toContain('onion');
  });

  it('analyzeIngredientSentiment sees a grouped meal under both of its component tags', () => {
    // Need MIN_TAG_OCCURRENCES rated meals per tag to clear the gate; reuse the
    // same grouped-meal shape N times (distinct ids) to simulate repeat logging.
    // Baseline-relative analysis also needs OTHER rated food entries to compare
    // against — add a few high-sentiment control entries so the tag's delta
    // clears DELTA_MARGIN (without them there's no baseline to compare to).
    const groupedMeals = Array.from({ length: MIN_TAG_OCCURRENCES }, () => groupedMealEntry({ sentiment: 2 }));
    const control: LogEntry[] = Array.from({ length: 3 }, (_, i) => ({
      ...groupedMealEntry({ sentiment: 5 }),
      id: `control${i}`,
      tagsJson: null,
      componentCount: null,
    }));
    const findings = analyzeIngredientSentiment([...groupedMeals, ...control]);
    const tags = findings.map((f) => f.tag);
    expect(tags).toContain('milk');
    expect(tags).toContain('onion');
  });

  it('analyzeTemporalTriggers sees a grouped meal under both of its component tags', () => {
    const HOUR = 60 * 60 * 1000;
    const entries: LogEntry[] = [];
    // Grouped meals (tagged milk+onion) are ALWAYS followed by a bad outcome —
    // excess risk over the baseline set below, which never is.
    for (let i = 0; i < DEFAULT_MIN_MEALS; i++) {
      const mealAt = i * 48 * HOUR;
      entries.push(groupedMealEntry({ loggedAt: mealAt, sentiment: 4 }));
      entries.push({
        ...groupedMealEntry({ loggedAt: mealAt + HOUR }),
        id: `bm${i}`,
        type: 'bowel_movement',
        tagsJson: null,
        componentCount: null,
        bristolScale: 1,
        sentiment: null,
      });
    }
    // Control: plain untagged-adjacent meals with no following outcome, so the
    // grouped meal's tags show excess risk over this baseline (not a 100% tie).
    for (let i = 0; i < DEFAULT_MIN_MEALS; i++) {
      entries.push(
        groupedMealEntry({
          id: `control${i}`,
          loggedAt: (DEFAULT_MIN_MEALS + i) * 48 * HOUR,
          tagsJson: serializeTags(['plain']),
          componentCount: null,
          sentiment: 4,
        }),
      );
    }
    const findings = analyzeTemporalTriggers(entries);
    const tags = findings.map((f) => f.tag);
    expect(tags).toContain('milk');
    expect(tags).toContain('onion');
  });
});

/**
 * HANDOFF.md Phase 4: end-to-end tripwire over the *real* pipeline (no
 * hand-rolled tagsJson) proving the audit verdict — collating scanned
 * components into one meal never smooths out a component's tags, including
 * the parenthetical sub-ingredients Phase 1 stopped dropping.
 */
describe('meal-collation tag-granularity invariant (Phase 4)', () => {
  function offJson(product: Record<string, unknown>): unknown {
    return { status: 1, product };
  }

  // Four realistic OFF-style products (the owner's own tofu/eggs/cheese/beans
  // example), each with allergens_tags + additives_tags + multi-token
  // ingredients_text that includes a parenthetical sub-ingredient breakdown.
  const OFF_PRODUCTS = [
    offJson({
      product_name: 'Tofu',
      ingredients_text: 'Tofu (water, soybeans, calcium sulfate), seasoning (onion powder, garlic)',
      allergens_tags: ['en:soybeans'],
      additives_tags: ['en:e330'],
    }),
    offJson({
      product_name: 'Eggs',
      ingredients_text: 'Eggs (chicken egg, water)',
      allergens_tags: ['en:eggs'],
      additives_tags: [],
    }),
    offJson({
      product_name: 'Cheese',
      ingredients_text: 'Cheese (milk 13%, salt, rennet)',
      allergens_tags: ['en:milk'],
      additives_tags: ['en:e202'],
    }),
    offJson({
      product_name: 'Beans',
      ingredients_text: 'Beans (kidney beans, water, may contain traces of nuts)',
      allergens_tags: [],
      additives_tags: [],
    }),
  ];

  it('collating components into a meal never drops a component tag', () => {
    // Run every product through the real pipeline: OFF response -> OffProduct
    // -> component form prefill -> validated MealComponentDraft.
    const products = OFF_PRODUCTS.map((json, i) => mapOffResponse(String(i), json));
    const drafts: MealComponentDraft[] = products.map((product, i) => {
      const prefill = offProductToComponentFormState(product);
      const result = buildComponentDraft(defaultComponentFormState(prefill), i);
      if (!result.valid || !result.draft) {
        throw new Error(`expected a valid draft for product ${i}`);
      }
      return result.draft;
    });

    const mealState: MealReviewFormState = {
      type: 'meal',
      name: 'Tofu scramble bowl',
      mealSlot: 'dinner',
      dateInput: '2026-07-19',
      timeInput: '18:00',
      sentiment: null,
      notes: '',
    };
    const result = buildMealEntry(mealState, drafts);
    if (!result.valid || !result.entry) {
      throw new Error('expected a valid meal entry');
    }
    const entry = result.entry;
    const parentTags = parseTagsJson(entry.tagsJson);

    // 1. Every tag derivable from every component — including parenthetical
    // sub-ingredients and every allergen/additive — survives into the
    // parent's tagsJson. Nothing is smoothed out by collation.
    for (const product of products) {
      for (const tag of product.tags) {
        expect(parentTags).toContain(tag);
      }
    }
    // Spot-check the sub-ingredient signal explicitly (the Phase 1 fix).
    expect(parentTags).toEqual(
      expect.arrayContaining([
        'soybeans', 'calcium sulfate', 'onion powder', 'garlic', // Tofu
        'chicken egg', // Eggs
        'milk', 'rennet', // Cheese
        'kidney beans', 'nuts', // Beans
      ]),
    );
    // The stopword phrase around Beans' allergen note never survives whole.
    expect(parentTags).not.toContain('may');
    expect(parentTags).not.toContain('contain');
    expect(parentTags).not.toContain('traces');

    // 2. Each component draft retains its own full ingredientsText.
    drafts.forEach((draft, i) => {
      expect(draft.ingredientsText).toBe(products[i].ingredientsText);
    });

    // 3. The parent ingredientsText stays the condensed names-join for the
    // multi-component case — the owner-approved display contract.
    expect(entry.ingredientsText).toBe('Tofu, Eggs, Cheese, Beans');
  });
});
