import type { LogEntry } from '@/db/schema';
import type { OutcomeFinding } from '@/features/analysis/temporal';
import type { MedicationJournalItem } from '@/lib/journal';
import { hoursBeforeLabel, lookback } from '../lookback';

let seq = 0;
function makeEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: `e${seq++}`,
    type: 'meal',
    mealSlot: null,
    name: 'Food',
    barcode: null,
    loggedAt: 0,
    sentiment: null,
    bristolScale: null,
    symptomType: null,
    severity: null,
    notes: null,
    calories: null,
    fatG: null,
    saturatedFatG: null,
    carbsG: null,
    proteinG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    servingG: null,
    ingredientsText: null,
    tagsJson: null,
    componentCount: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeMed(overrides: Partial<MedicationJournalItem>): MedicationJournalItem {
  return {
    kind: 'medication',
    id: `m${seq++}`,
    loggedAt: 0,
    timeKnown: true,
    summary: 'Ibuprofen 200 mg',
    notes: null,
    ...overrides,
  };
}

function makeFinding(overrides: Partial<OutcomeFinding>): OutcomeFinding {
  return {
    key: 'gluten',
    label: 'gluten',
    occurrences: 4,
    hits: 3,
    hitRate: 0.75,
    baseRate: 0.2,
    confidence: 'high',
    ...overrides,
  };
}

const NO_FINDINGS = { foodFindings: [], ingredientFindings: [], pairFindings: [] };

const HOUR = 60 * 60 * 1000;
const T = 1000 * HOUR; // base timestamp, comfortably away from 0

function outcomeAt(t: number): LogEntry {
  return makeEntry({ id: 'outcome', type: 'symptom', severity: 4, loggedAt: t });
}

describe('lookback — window edges', () => {
  it('includes an item exactly 24 h before, for the 24 h window', () => {
    const outcome = outcomeAt(T);
    const meal = makeEntry({ loggedAt: T - 24 * HOUR });

    const items = lookback(outcome, [outcome, meal], [], NO_FINDINGS, 24);

    expect(items.map((i) => (i.kind === 'food' ? i.entry.id : i.item.id))).toEqual([meal.id]);
  });

  it('excludes an item at the exact same instant as the outcome', () => {
    const outcome = outcomeAt(T);
    const meal = makeEntry({ loggedAt: T });

    const items = lookback(outcome, [outcome, meal], [], NO_FINDINGS, 24);

    expect(items).toEqual([]);
  });

  it('excludes an item after the outcome', () => {
    const outcome = outcomeAt(T);
    const meal = makeEntry({ loggedAt: T + HOUR });

    const items = lookback(outcome, [outcome, meal], [], NO_FINDINGS, 24);

    expect(items).toEqual([]);
  });

  it('excludes an item 24 h + 1 ms before at the 24 h window, but includes it at 48 h', () => {
    const outcome = outcomeAt(T);
    const meal = makeEntry({ loggedAt: T - 24 * HOUR - 1 });

    expect(lookback(outcome, [outcome, meal], [], NO_FINDINGS, 24)).toEqual([]);
    const items48 = lookback(outcome, [outcome, meal], [], NO_FINDINGS, 48);
    expect(items48.map((i) => (i.kind === 'food' ? i.entry.id : i.item.id))).toEqual([meal.id]);
  });
});

describe('lookback — food/ingredient/combination matching', () => {
  it('matches a food finding case-insensitively and trimmed', () => {
    const outcome = outcomeAt(T);
    const meal = makeEntry({ name: '  WHEAT bread  ', loggedAt: T - HOUR });
    const findings = { ...NO_FINDINGS, foodFindings: [makeFinding({ key: 'wheat bread', label: 'Wheat Bread' })] };

    const items = lookback(outcome, [outcome, meal], [], findings, 24);

    expect(items).toHaveLength(1);
    const item = items[0];
    if (item.kind !== 'food') throw new Error('expected a food item');
    expect(item.suspicion).toBe('high');
    expect(item.matches).toEqual([{ kind: 'food', label: 'Wheat Bread', confidence: 'high' }]);
  });

  it('matches an ingredient finding by exact tag', () => {
    const outcome = outcomeAt(T);
    const meal = makeEntry({ tagsJson: '["gluten","milk"]', loggedAt: T - HOUR });
    const findings = { ...NO_FINDINGS, ingredientFindings: [makeFinding({ key: 'gluten', label: 'gluten' })] };

    const items = lookback(outcome, [outcome, meal], [], findings, 24);

    const item = items[0];
    if (item.kind !== 'food') throw new Error('expected a food item');
    expect(item.matches).toEqual([{ kind: 'ingredient', label: 'gluten', confidence: 'high' }]);
  });

  it('matches a combination finding only when both tags are present, order-free', () => {
    const outcome = outcomeAt(T);
    const meal = makeEntry({ tagsJson: '["milk","wheat"]', loggedAt: T - HOUR });
    const partial = makeEntry({ tagsJson: '["milk"]', loggedAt: T - 2 * HOUR });
    const findings = { ...NO_FINDINGS, pairFindings: [makeFinding({ key: 'milk + wheat', label: 'milk + wheat' })] };

    const items = lookback(outcome, [outcome, meal, partial], [], findings, 24);

    const matched = items.find((i) => i.kind === 'food' && i.entry.id === meal.id);
    const unmatched = items.find((i) => i.kind === 'food' && i.entry.id === partial.id);
    if (matched?.kind !== 'food' || unmatched?.kind !== 'food') throw new Error('expected food items');
    expect(matched.matches).toEqual([{ kind: 'combination', label: 'milk + wheat', confidence: 'high' }]);
    expect(unmatched.matches).toEqual([]);
    expect(unmatched.suspicion).toBeNull();
  });

  it('orders matches strongest first: high > medium > low, then food > ingredient > combination', () => {
    const outcome = outcomeAt(T);
    const meal = makeEntry({ name: 'Wheat Bread', tagsJson: '["gluten","milk"]', loggedAt: T - HOUR });
    const findings = {
      foodFindings: [makeFinding({ key: 'wheat bread', label: 'Wheat Bread', confidence: 'medium' })],
      ingredientFindings: [makeFinding({ key: 'gluten', label: 'gluten', confidence: 'high' })],
      pairFindings: [makeFinding({ key: 'gluten + milk', label: 'gluten + milk', confidence: 'medium' })],
    };

    const items = lookback(outcome, [outcome, meal], [], findings, 24);

    const item = items[0];
    if (item.kind !== 'food') throw new Error('expected a food item');
    expect(item.matches.map((m) => m.kind)).toEqual(['ingredient', 'food', 'combination']);
    expect(item.suspicion).toBe('high');
  });

  it('reports suspicion: null and matches: [] when nothing matches — "No pattern yet"', () => {
    const outcome = outcomeAt(T);
    const meal = makeEntry({ name: 'Plain Rice', loggedAt: T - HOUR });

    const items = lookback(outcome, [outcome, meal], [], NO_FINDINGS, 24);

    const item = items[0];
    if (item.kind !== 'food') throw new Error('expected a food item');
    expect(item.suspicion).toBeNull();
    expect(item.matches).toEqual([]);
  });
});

describe('lookback — medications', () => {
  it('includes a timed medication in the window with a floored whole-hour hoursBefore', () => {
    const outcome = outcomeAt(T);
    const med = makeMed({ loggedAt: T - 3.5 * HOUR, timeKnown: true });

    const items = lookback(outcome, [outcome], [med], NO_FINDINGS, 24);

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({ kind: 'medication', item: med, hoursBefore: 3 });
  });

  it('excludes a medication outside the window', () => {
    const outcome = outcomeAt(T);
    const med = makeMed({ loggedAt: T - 25 * HOUR, timeKnown: true });

    const items = lookback(outcome, [outcome], [med], NO_FINDINGS, 24);

    expect(items).toEqual([]);
  });

  it('includes an untimed medication (stored at local noon) when noon is in the window, with hoursBefore: null', () => {
    const outcome = outcomeAt(T);
    const med = makeMed({ loggedAt: T - 2 * HOUR, timeKnown: false });

    const items = lookback(outcome, [outcome], [med], NO_FINDINGS, 24);

    expect(items).toEqual([{ kind: 'medication', item: med, hoursBefore: null }]);
  });
});

describe('lookback — exclusions and ordering', () => {
  it('excludes other BMs/symptoms in the window — only food and medications are listed', () => {
    const outcome = outcomeAt(T);
    const otherSymptom = makeEntry({ type: 'symptom', severity: 3, loggedAt: T - HOUR });
    const otherBm = makeEntry({ type: 'bowel_movement', bristolScale: 4, loggedAt: T - 2 * HOUR });

    const items = lookback(outcome, [outcome, otherSymptom, otherBm], [], NO_FINDINGS, 24);

    expect(items).toEqual([]);
  });

  it('orders items closest-to-the-outcome first, interleaving meals and medications', () => {
    const outcome = outcomeAt(T);
    const mealFar = makeEntry({ id: 'far', loggedAt: T - 10 * HOUR });
    const medMid = makeMed({ id: 'mid', loggedAt: T - 5 * HOUR });
    const mealNear = makeEntry({ id: 'near', loggedAt: T - HOUR });

    const items = lookback(outcome, [outcome, mealFar, mealNear], [medMid], NO_FINDINGS, 24);

    expect(items.map((i) => (i.kind === 'food' ? i.entry.id : i.item.id))).toEqual(['near', 'mid', 'far']);
  });
});

describe('hoursBeforeLabel', () => {
  it('shows "Just before" under 1 h', () => {
    expect(hoursBeforeLabel(0.5)).toBe('Just before');
  });

  it('shows whole hours under 24 h', () => {
    expect(hoursBeforeLabel(3)).toBe('3 h before');
  });

  it('shows days + hours at or beyond 24 h', () => {
    expect(hoursBeforeLabel(26)).toBe('1 day 2 h before');
  });
});
