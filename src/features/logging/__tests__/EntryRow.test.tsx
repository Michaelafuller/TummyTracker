import { render } from '@testing-library/react-native';
import React from 'react';

import type { LogEntry } from '@/db/schema';
import { EntryRow } from '../EntryRow';

// EntryRow wraps its Pressable in expo-router's <Link>; stub it to a passthrough
// so this test doesn't need the full router transform chain (see explore.test.tsx
// for the same pattern used elsewhere in this codebase).
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const BASE_ENTRY: LogEntry = {
  id: 'e1',
  type: 'meal',
  mealSlot: 'lunch',
  name: 'Lunch',
  barcode: null,
  loggedAt: new Date(2026, 5, 27, 12, 0).getTime(),
  sentiment: null,
  bristolScale: null,
  symptomType: null,
  severity: null,
  notes: null,
  ingredientsText: null,
  tagsJson: null,
  calories: 640,
  fatG: null,
  saturatedFatG: null,
  carbsG: null,
  proteinG: null,
  fiberG: null,
  sugarG: null,
  sodiumMg: null,
  servingG: null,
  componentCount: null,
  createdAt: 1,
  updatedAt: 1,
};

// RNTL v14 renders asynchronously: `render` returns a promise.
describe('EntryRow subtitle', () => {
  it('does not append an item count for a plain single-item entry (componentCount null)', async () => {
    const { getByText } = await render(<EntryRow entry={BASE_ENTRY} />);
    expect(getByText('Meal · lunch · 640 kcal')).toBeTruthy();
  });

  it('does not append an item count when componentCount is 1', async () => {
    const entry = { ...BASE_ENTRY, componentCount: 1 };
    const { getByText } = await render(<EntryRow entry={entry} />);
    expect(getByText('Meal · lunch · 640 kcal')).toBeTruthy();
  });

  it('appends "N items" for a grouped meal with componentCount > 1', async () => {
    const entry = { ...BASE_ENTRY, componentCount: 3 };
    const { getByText } = await render(<EntryRow entry={entry} />);
    expect(getByText('Meal · lunch · 3 items · 640 kcal')).toBeTruthy();
  });

  it('omits the kcal segment when calories is null', async () => {
    const entry = { ...BASE_ENTRY, componentCount: 2, calories: null };
    const { getByText } = await render(<EntryRow entry={entry} />);
    expect(getByText('Meal · lunch · 2 items')).toBeTruthy();
  });
});
