# HANDOFF.md — Cycle: rank OFF search-by-name toward generic/unbranded matches

> **Read first:** root `CLAUDE.md` (auto-loaded). No other protocol doc is needed —
> every task below is fully specced with file paths and line numbers from the
> current tree.
>
> **Session type:** execute (fine-tune). Definition of done per CLAUDE.md §4:
> `npm run typecheck && npm run lint && npm test` green, tests ship with the
> change, one logical change per commit, imperative scoped commit message.
> No schema/UI change, so `npm run bundle:check` is not required this cycle.
>
> **Source of these requirements:** owner planning session, 2026-07-03. Follow-up
> to the OFF search-by-name feature that just shipped (`f3b22ac`, `0ac4da8`,
> `51be0f1`, `3d4ee53`). Owner feedback: typing "banana" into the manual-entry
> Name field surfaces banana chips, banana-flavored cookies, and other branded
> banana-adjacent products ahead of an actual plain banana. Barcode scans are
> high-fidelity already (a real product); this is specifically about the
> free-text name-search path (produce, staples, anything typed rather than
> scanned).

---

## Why this is a fine-tune, not a new integration (read before changing scope)

I pulled live results from OFF's public search endpoint to check this empirically
rather than guess:

- `search_terms=banana`, `sort_by=unique_scans_n`, top 20: mostly banana-flavored
  yogurt/cookies/cereal/smoothies/chips — but a **plain, unbranded "Bananes"**
  (`brands: ""`, `categories_tags` incl. `en:fruits`, `en:bananas`) sits at
  position 8, and a branded-but-organic **"Banane BIO"** at position 13. The
  signal exists in OFF's own data; it's just outranked by scan-popularity of
  branded snacks that happen to contain the word "banana".
- `search_terms=apple`, same params, top ~15: **zero** plain/unbranded apple
  entries — all compotes, juices, sodas, cereal bars. OFF simply may not have a
  well-scanned generic "Apple" entry to surface at all.

**Conclusion:** client-side re-ranking of a larger OFF candidate pool can
recover the "banana" case (the data is there, just buried) but cannot manufacture
data OFF doesn't have (the "apple" case). This handoff does the re-ranking —
it's a real improvement, no new dependency, no new guardrail (same OFF host
already approved in CLAUDE.md §3/§9). It is **not** a complete fix for every
food. If after this ships the owner still finds common produce/staples poorly
served, the durable fix is a produce-focused source like **USDA FoodData
Central** (has literal "Apples, raw, with skin" entries) — that is a new
external API and needs explicit owner sign-off before it's scoped in; do not
add it in this cycle.

---

## Phase 1 — extend `OffProduct` with category tags

### 1.1 `src/lib/openFoodFacts.ts`

- Add `categoriesTags: string[]` to the `OffProduct` interface (after `tags:
  string[]`, line 33).
- In `mapOffProductJson` (line 71), extract it defensively and add it to the
  returned object (the return statement is currently line 118):

  ```ts
  const categoriesTagsRaw = product.categories_tags;
  const categoriesTags = Array.isArray(categoriesTagsRaw)
    ? categoriesTagsRaw.filter((t): t is string => typeof t === 'string')
    : [];

  return { barcode: resolvedBarcode, brand, found: true, name, nutrition, servingG, ingredientsText, tags, categoriesTags };
  ```

- In `mapOffResponse`'s not-found literal (lines 130-139), add `categoriesTags:
  []` alongside the other empty fields — it's a plain object literal there, not
  a call through `mapOffProductJson`, so it needs the field added by hand.

### 1.2 `src/features/barcode/api.ts`

- Add `categories_tags` to the `fields` param of `fetchOffSearchResults` (line
  34): `'code,product_name,brands,nutriments,serving_quantity,ingredients_text,allergens_tags,additives_tags,categories_tags'`.

No test changes needed yet for this sub-step alone — Phase 2's tests cover the
new field end to end.

---

## Phase 2 — re-rank search results toward generic/unbranded matches

### 2.1 Widen the candidate pool: `src/features/barcode/api.ts`

Change `page_size: '5'` (line 32) to `page_size: '24'`. We still only ever show
5 rows to the user (`mapOffSearchResponse` keeps its `.slice(0, 5)`) — this just
gives the re-ranker a bigger pool to find the buried generic entry in, matching
what the live "banana" pull above showed (position 8 of 20).

Update the function's return (line 48) to pass the query through:
`return mapOffSearchResponse(json, query);` — `query` is already the trimmed
string the caller (`useOffSearch`) passed in, no new trimming needed here.

### 2.2 Scoring function + re-rank: `src/lib/openFoodFacts.ts`

Add above `mapOffSearchResponse`:

```ts
const PRODUCE_CATEGORY_HINTS = [
  'en:fruits',
  'en:vegetables',
  'en:fresh-fruits',
  'en:fresh-vegetables',
  'en:tubers-and-root-vegetables',
  'en:legumes',
  'en:nuts-and-their-products',
];

const PROCESSED_CATEGORY_HINTS = [
  'en:snacks',
  'en:sweet-snacks',
  'en:desserts',
  'en:beverages',
  'en:biscuits-and-cakes',
  'en:confectioneries',
  'en:chips-and-fries',
];

/**
 * Heuristic "how plain/generic is this candidate" score for a search result —
 * lower means more likely the actual food the user typed (a raw banana),
 * higher means more likely a branded product that merely contains the word (a
 * banana-flavored cookie). Three signals, weighted so category only breaks
 * ties between otherwise-similar candidates:
 *   - name/query word-count delta (a name close in length to the query wins)
 *   - presence of a brand (community "generic" entries rarely carry one)
 *   - category tag hints (produce tags nudge down, processed tags nudge up)
 * This can only re-rank what OFF's search already returned — if OFF has no
 * unbranded entry for a food, no score here can invent one (see HANDOFF).
 */
function genericityScore(query: string, product: OffProduct): number {
  const queryWords = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const nameWords = (product.name ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const lengthDelta = Math.abs(nameWords.length - queryWords.length);
  const brandPenalty = product.brand != null ? 1 : 0;
  const hasProduceHint = product.categoriesTags.some((t) => PRODUCE_CATEGORY_HINTS.includes(t));
  const hasProcessedHint = product.categoriesTags.some((t) => PROCESSED_CATEGORY_HINTS.includes(t));
  const categoryAdjustment = (hasProduceHint ? -1 : 0) + (hasProcessedHint ? 1 : 0);
  return lengthDelta * 2 + brandPenalty * 2 + categoryAdjustment;
}
```

Change `mapOffSearchResponse`'s signature and body (line 151):

```ts
/**
 * Map a raw OFF `/cgi/search.pl` (Generic_Search) response into candidate
 * products. Entries with no product name are dropped, the rest are re-ranked
 * by `genericityScore` against `query` (most-generic first — see that
 * function's doc comment), then capped at 5. OFF's own `sort_by=unique_scans_n`
 * ordering is preserved as the tiebreak among equally-generic candidates.
 */
export function mapOffSearchResponse(json: unknown, query: string): OffProduct[] {
  const root = asRecord(json);
  const products = Array.isArray(root.products) ? root.products : [];
  return products
    .map((p) => mapOffProductJson(null, asRecord(p)))
    .filter((p) => p.name != null)
    .map((product, index) => ({ product, index })) // index = tiebreak, sort() stability isn't guaranteed on RN's Hermes
    .sort((a, b) => genericityScore(query, a.product) - genericityScore(query, b.product) || a.index - b.index)
    .map(({ product }) => product)
    .slice(0, 5);
}
```

### 2.3 Tests — `src/lib/__tests__/openFoodFacts.test.ts`

The existing `describe('mapOffSearchResponse', ...)` block calls the function
with one arg; every call site needs a second `query` arg now. For the tests
that aren't about ranking (capping, name-drop, brand extraction, barcode-null,
garbage-input defensiveness), pick a query where every fixture product scores
identically so ordering/capping behavior is unchanged and the assertions still
hold — e.g. a query whose word count matches none of the fixture names closely
in a way that would differentiate them, and fixtures with no `brands`/
`categories_tags` fields (so brandPenalty/categoryAdjustment are 0 for all).
The "maps each product node and caps at 5, most-scanned order preserved" test
already uses homogeneous `Product 0`..`Product 6` names with no brands field —
just add `, 'query'` as the second arg and it should still pass unchanged
(verify after writing).

Add new tests for the ranking behavior itself, modeled on the real OFF response
captured for "banana" (see the callout above):

```ts
it('ranks an unbranded, name-close candidate above longer branded matches', () => {
  const json = {
    products: [
      { code: '1', product_name: 'Gerblé - Organic Cookie Flavored w/ Banana', brands: 'Gerblé', categories_tags: ['en:snacks', 'en:biscuits-and-cakes'], nutriments: {} },
      { code: '2', product_name: 'Bananes', brands: '', categories_tags: ['en:fruits', 'en:tropical-fruits', 'en:bananas'], nutriments: {} },
      { code: '3', product_name: 'Banana chips', brands: 'Suny Bites', categories_tags: ['en:dried-fruits'], nutriments: {} },
    ],
  };
  const results = mapOffSearchResponse(json, 'banana');
  expect(results[0].name).toBe('Bananes');
});

it('breaks name/brand ties using produce vs. processed category hints', () => {
  const json = {
    products: [
      { code: '1', product_name: 'Zucchini Loaf', brands: '', categories_tags: ['en:snacks', 'en:desserts'], nutriments: {} },
      { code: '2', product_name: 'Zucchini Spears', brands: '', categories_tags: ['en:vegetables'], nutriments: {} },
    ],
  };
  const results = mapOffSearchResponse(json, 'zucchini');
  expect(results[0].name).toBe('Zucchini Spears');
});

it('extracts categoriesTags defensively', () => {
  expect(mapOffSearchResponse({ products: [{ product_name: 'A', nutriments: {} }] }, 'a')[0].categoriesTags).toEqual([]);
  expect(mapOffSearchResponse({ products: [{ product_name: 'B', categories_tags: 'not-an-array', nutriments: {} }] }, 'b')[0].categoriesTags).toEqual([]);
  const mixed = mapOffSearchResponse({ products: [{ product_name: 'C', categories_tags: ['en:fruits', 42, null], nutriments: {} }] }, 'c');
  expect(mixed[0].categoriesTags).toEqual(['en:fruits']);
});
```

Also add one `mapOffResponse`/`mapOffProductJson` assertion (in the existing
`describe('mapOffResponse', ...)` block) that a barcode lookup populates
`categoriesTags` from `categories_tags` when present, and that the not-found
branch reports `categoriesTags: []` — reuse the `found`/`notfound` fixtures or
an inline JSON object, whichever fits the existing style in that block.

Commit: `feat(barcode): rank OFF search-by-name results toward unbranded matches`

---

## After this phase (execute-session closeout)

1. Full rungs green (`npm run typecheck && npm run lint && npm test`).
2. Summarize: what changed (larger candidate pool + re-ranking heuristic, no UI
   change, no new dependency), and restate the honest limit — this helps when
   OFF has a buried generic entry, but can't fix foods where OFF has none. Point
   back to this file's "Why this is a fine-tune, not a new integration" section
   if the owner asks about further improving produce lookups.
3. Do not touch `docs/RESULTS.md`, `docs/ACCEPTANCE.md`, or `docs/E2E.md` — no
   observable flow or UI changed (same spinner → 5 rows → tap-to-fill shape),
   only result ordering underneath. `PROGRESS.md`'s Tier 3 bullet was already
   updated by the planning session; don't re-edit it here.
