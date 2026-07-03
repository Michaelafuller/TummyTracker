import type { LogEntry } from '@/db/schema';
import { filterRecents } from '../recents';

const BASE_ENTRY: LogEntry = {
  id: 'base',
  type: 'meal',
  mealSlot: 'breakfast',
  name: 'Oatmeal',
  barcode: null,
  loggedAt: 1000,
  sentiment: null,
  bristolScale: null,
  symptomType: null,
  severity: null,
  notes: null,
  ingredientsText: null,
  tagsJson: null,
  calories: null,
  fatG: null,
  saturatedFatG: null,
  carbsG: null,
  proteinG: null,
  fiberG: null,
  sugarG: null,
  sodiumMg: null,
  servingG: null,
  createdAt: 1,
  updatedAt: 1,
};

function entry(id: string, name: string): LogEntry {
  return { ...BASE_ENTRY, id, name };
}

describe('filterRecents', () => {
  const entries = [
    entry('1', 'Chicken salad'),
    entry('2', 'Chicken soup'),
    entry('3', 'Greek yogurt'),
    entry('4', 'Peanut butter toast'),
    entry('5', 'Mixed nuts'),
  ];

  it('returns the first `limit` entries unchanged when the query is empty', () => {
    expect(filterRecents(entries, '', 3).map((e) => e.id)).toEqual(['1', '2', '3']);
  });

  it('treats a whitespace-only query as empty', () => {
    expect(filterRecents(entries, '   ', 2).map((e) => e.id)).toEqual(['1', '2']);
  });

  it('is case-insensitive', () => {
    expect(filterRecents(entries, 'CHICKEN').map((e) => e.id)).toEqual(['1', '2']);
  });

  it('ranks prefix matches before substring matches, preserving recency within each rank', () => {
    // "nut" is a substring of "Peanut butter toast" but a prefix of "Mixed nuts"... actually
    // neither starts with "nut"; use a query that distinguishes prefix vs substring clearly.
    const mixed = [entry('a', 'Salted nuts'), entry('b', 'Nutty granola'), entry('c', 'Walnut cookies')];
    // "nut" is a prefix of "Nutty granola" and a substring of the other two.
    expect(filterRecents(mixed, 'nut').map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('caps results at `limit`', () => {
    expect(filterRecents(entries, 'e', 2)).toHaveLength(2);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterRecents(entries, 'pizza')).toEqual([]);
  });
});
