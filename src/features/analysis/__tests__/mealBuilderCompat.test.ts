// Regression test for HANDOFF.md Phase 2.6: grouped meals must stay invisible to
// the analyzers as a special case — they consume plain LogEntry rows, and a
// grouped meal's tagsJson is the union computed by unionComponentTags at save
// time. This locks in that a meal built from two tagged components is visible
// to both analyzers under BOTH of its component tags, not just one.

import type { LogEntry } from '@/db/schema';
import { unionComponentTags, type MealComponentDraft } from '@/lib/mealAggregate';
import { serializeTags } from '@/lib/ingredients';
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
