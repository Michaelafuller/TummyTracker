import { render } from '@testing-library/react-native';
import React from 'react';

import type { LogEntry } from '@/db/schema';
import { useWatchlistStore } from '@/features/watchlist/watchlistStore';
import { EntryRow } from '../EntryRow';

// EntryRow wraps its Pressable in expo-router's <Link>; stub it to a passthrough
// so this test doesn't need the full router transform chain (see explore.test.tsx
// for the same pattern used elsewhere in this codebase).
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

// useWatchlistStore pulls in src/db/repository, which opens the real
// expo-sqlite native module at import time — not available under Jest (see
// watchlistStore.test.ts for the same mock). EntryRow only ever reads
// `items` from the store, never calls load/add/remove, so stubbed repository
// functions are never invoked.
jest.mock('@/db/repository', () => ({
  listWatchlistItems: jest.fn(),
  addWatchlistItem: jest.fn(),
  removeWatchlistItem: jest.fn(),
  renameWatchlistItem: jest.fn(),
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

describe('EntryRow sentiment display gating', () => {
  it('does not show a rating emoji or "rated"/"not rated" a11y clause for a food entry', async () => {
    const entry = { ...BASE_ENTRY, type: 'meal' as const, sentiment: 4 };
    const { getByText, getByLabelText } = await render(<EntryRow entry={entry} />);

    expect(getByText('·')).toBeTruthy();
    expect(getByLabelText(/Lunch, Meal · lunch · 640 kcal$/)).toBeTruthy();
  });

  it('does not show a rating for an unrated food entry either (no "not rated" clause)', async () => {
    const entry = { ...BASE_ENTRY, type: 'snack' as const, sentiment: null };
    const { getByLabelText } = await render(<EntryRow entry={entry} />);

    expect(getByLabelText(/^Lunch, Snack · lunch · 640 kcal$/)).toBeTruthy();
  });

  it('shows the rating emoji and "rated" a11y clause for a rated bowel movement entry', async () => {
    const entry = {
      ...BASE_ENTRY,
      type: 'bowel_movement' as const,
      name: 'BM',
      mealSlot: null,
      calories: null,
      bristolScale: 4,
      sentiment: 4,
    };
    const { getByText, getByLabelText } = await render(<EntryRow entry={entry} />);

    expect(getByText('🙂')).toBeTruthy();
    expect(getByLabelText(/rated satisfied$/)).toBeTruthy();
  });

  it('shows the "not rated" a11y clause and placeholder for an unrated bowel movement entry', async () => {
    const entry = {
      ...BASE_ENTRY,
      type: 'bowel_movement' as const,
      name: 'BM',
      mealSlot: null,
      calories: null,
      bristolScale: 4,
      sentiment: null,
    };
    const { getByText, getByLabelText } = await render(<EntryRow entry={entry} />);

    expect(getByText('·')).toBeTruthy();
    expect(getByLabelText(/not rated$/)).toBeTruthy();
  });
});

describe('EntryRow watchlist badge', () => {
  afterEach(() => {
    useWatchlistStore.setState({ items: [] });
  });

  it('shows the watched pill and extends the a11y label for a matching food entry', async () => {
    useWatchlistStore.setState({ items: [{ id: 'w1', term: 'soy', createdAt: 1 }] });
    const entry = { ...BASE_ENTRY, type: 'meal' as const, tagsJson: JSON.stringify(['soybeans']) };
    const { getByTestId, getByLabelText } = await render(<EntryRow entry={entry} />);

    expect(getByTestId('entry-row-lunch-watched')).toBeTruthy();
    expect(
      getByLabelText(/Lunch, Meal · lunch · 640 kcal, contains watched ingredient: soy — matched: soybeans$/),
    ).toBeTruthy();
  });

  it('does not show the pill for a bowel_movement entry with the same matching tags', async () => {
    useWatchlistStore.setState({ items: [{ id: 'w1', term: 'soy', createdAt: 1 }] });
    const entry = {
      ...BASE_ENTRY,
      type: 'bowel_movement' as const,
      name: 'BM',
      mealSlot: null,
      calories: null,
      bristolScale: 4,
      tagsJson: JSON.stringify(['soybeans']),
    };
    const { queryByTestId } = await render(<EntryRow entry={entry} />);

    expect(queryByTestId('entry-row-bm-watched')).toBeNull();
  });

  it('leaves a non-matching food entry unchanged (no pill, anchored a11y regex still passes)', async () => {
    useWatchlistStore.setState({ items: [{ id: 'w1', term: 'soy', createdAt: 1 }] });
    const entry = { ...BASE_ENTRY, type: 'meal' as const, tagsJson: JSON.stringify(['onion']) };
    const { queryByTestId, getByLabelText } = await render(<EntryRow entry={entry} />);

    expect(queryByTestId('entry-row-lunch-watched')).toBeNull();
    expect(getByLabelText(/Lunch, Meal · lunch · 640 kcal$/)).toBeTruthy();
  });
});
