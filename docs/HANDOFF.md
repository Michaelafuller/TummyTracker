# HANDOFF.md — Cycle: OFF search-by-name lookup

> **Read first:** root `CLAUDE.md` (auto-loaded). No other protocol doc is needed
> for this handoff — every task below is fully specced with file paths and line
> numbers from the current tree.
>
> **Session type:** execute (feature). Definition of done per CLAUDE.md §4:
> `npm run typecheck && npm run lint && npm test` green, tests ship with the
> feature, one logical change per commit, imperative scoped commit messages.
> No schema change, so `npm run bundle:check` is good practice but not mandatory
> the way a migration cycle demands it. Do NOT run `npm run e2e` (no device
> attached) — flow YAML edits are *authored* (⏳), never claimed verified.
>
> **Source of these requirements:** owner planning session, 2026-07-03. This
> item was already backlog Tier 3 ("OFF search-by-name — produce/restaurant/
> homemade have no barcode"); this handoff is its full spec. Where this handoff
> conflicts with an older doc, this handoff wins.
>
> **Note:** `docs/RESULTS.md`'s open item (`e-temporal-insights` re-run pending
> a device session) and the 2026-07-02 cycle's owner-on-device checklist are
> unrelated and still open — the owner chose to sequence this feature ahead of
> that device pass. Don't fold them into this cycle.

---

## Architecture decisions (resolved with owner — do not deviate)

1. **Trigger: on Name-field blur, not live-typing.** No debounce utility needed —
   one search fires per committed edit, not per keystroke.
2. **Result UX: inline suggestion list, never a blind auto-fill.** OFF Generic_Search
   on a generic term ("banana") returns many branded/junk matches; silently
   overwriting the nutrition grid from the top hit risks populating garbage. Show
   up to 5 rows (name · brand · kcal) under the Name field — same inline-list shape
   as `RecentFoodPicker` (`src/features/logging/RecentFoodPicker.tsx`), just backed
   by the network instead of local recents. Tapping a row fills the form. Zero
   results (or a network error) shows a short-lived inline notice, *not* a global
   toast component — none exists in the codebase yet (Tier 3's "save-confirmation
   toasts" is separate, unbuilt work; don't pull it into this cycle).
3. **Manual entry is unified onto the meal-builder chain.** Home's "+ Add manually"
   CTA currently opens `/entry/new` (`LogEntryForm`, single item, never chainable
   into a multi-item meal — see `src/app/(tabs)/index.tsx:71`). Retarget it to
   `/meal/component` (`ComponentForm`), the same screen the scan flow's "Enter
   manually" escape hatch already uses (`src/app/scan.tsx:90`). This is what makes
   "a meal is multiple items, scanned or typed, coalesced into one entry with one
   sentiment" true for manually-typed items too — today it's only true for scanned
   ones. **This changes the on-screen flow**: manual entry becomes two steps
   (component confirm → meal review with date/slot/sentiment/notes) instead of
   `LogEntryForm`'s single all-in-one screen. That's expected and matches the scan
   flow already; call it out plainly in your summary.
   - `entry/new.tsx` + `LogEntryForm` are **not deleted** — they stay live for the
     Home "Recent" re-log tap (`handleRecentTap`, `src/app/(tabs)/index.tsx:29-42`)
     and for editing existing entries (`src/app/entry/[id].tsx`). Don't touch
     either of those call sites.
4. **No new guardrail trigger.** This is a different endpoint on the same OFF host
   already approved in CLAUDE.md §3/§9 (`world.openfoodfacts.org`), not a new
   external service — no owner sign-off needed beyond this handoff.
5. **Skip search entirely when the component already has a barcode** (i.e.
   `state.barcode != null` — a scanned item). Barcode-sourced nutrition is
   authoritative; never let a name-search silently clobber it, even if the user
   edits the scanned name afterward.

---

## Phase 1 — OFF Generic_Search: fetch + pure mapping

### 1.1 Extract a reusable per-product mapper in `src/lib/openFoodFacts.ts`

`mapOffResponse` (line 67) currently inlines both the miss-check (`root.status`)
*and* the per-product field extraction (name/nutrition/ingredients/tags, lines
74–113) in one function. Split the field-extraction half out:

```ts
/** Parse one raw OFF product node (the shape found at root.product in a
 *  product-lookup response, or one entry of root.products in a search
 *  response) into an OffProduct. barcode is the caller's authoritative code
 *  for a product lookup, or null to fall back to the node's own `code` field
 *  (search results carry their own). */
function mapOffProductJson(barcode: string | null, product: Record<string, unknown>): OffProduct {
  // body = lines 77-113 of the current mapOffResponse, unchanged, plus:
  const resolvedBarcode = barcode ?? (typeof product.code === 'string' ? product.code : null);
  const brandsRaw = product.brands;
  const brand = typeof brandsRaw === 'string' && brandsRaw.trim().length > 0
    ? brandsRaw.split(',')[0].trim()
    : null;
  // ...return { barcode: resolvedBarcode, brand, found: true, name, nutrition, servingG, ingredientsText, tags };
}
```

- Add `barcode: string | null` (was `string`) and `brand: string | null` to the
  `OffProduct` interface (line 23). `mapOffResponse`'s miss branch (line 71) keeps
  passing the known barcode string through unchanged — no behavior change for the
  existing barcode-lookup callers. `offProductToFormState`/`offProductToComponentFormState`
  (lines 125, 141) already just copy `product.barcode` through; a nullable type
  is a compile-time ripple, not a logic change, since a search-selected product's
  barcode being `null` is correct (many OFF entries lack a scannable code, and
  that's fine — the resulting log entry just has `barcode: null`, same as any
  manual entry today).
- `mapOffResponse` becomes a thin wrapper: check `status === 1` (miss branch
  unchanged), then `mapOffProductJson(barcode, asRecord(root.product))`.

### 1.2 New: `mapOffSearchResponse(json: unknown): OffProduct[]`

Below `mapOffResponse`, in the same file:

```ts
/** Map a raw OFF /cgi/search.pl response into candidate products, most-scanned
 *  first (the request sorts by unique_scans_n). Entries with no product name
 *  are dropped — OFF search returns plenty of incomplete community entries. */
export function mapOffSearchResponse(json: unknown): OffProduct[] {
  const root = asRecord(json);
  const products = Array.isArray(root.products) ? root.products : [];
  return products
    .map((p) => mapOffProductJson(null, asRecord(p)))
    .filter((p) => p.name != null)
    .slice(0, 5);
}
```

### 1.3 Fetch function in `src/features/barcode/api.ts`

Add alongside `fetchOffProduct`:

```ts
const SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';

export async function fetchOffSearchResults(query: string, signal?: AbortSignal): Promise<OffProduct[]> {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '5',
    sort_by: 'unique_scans_n', // most-scanned (most reliable) products first
    fields: 'code,product_name,brands,nutriments,serving_quantity,ingredients_text,allergens_tags,additives_tags',
  });
  const response = await fetch(`${SEARCH_URL}?${params.toString()}`, {
    signal,
    headers: { 'User-Agent': 'TummyTracker/1.0 (local-first food journal)' },
  });
  if (!response.ok) {
    throw new Error(`Open Food Facts search failed (${response.status}).`);
  }
  const json: unknown = await response.json();
  return mapOffSearchResponse(json);
}
```

### 1.4 Hook in `src/features/barcode/useOffSearch.ts` (new file, mirrors `useOffLookup.ts`)

```ts
import { useQuery } from '@tanstack/react-query';
import { usePrefsStore } from '@/features/prefs/prefsStore';
import { fetchOffSearchResults } from './api';

/** Looks up a food name against Open Food Facts search. Disabled until a query
 *  of at least 2 non-whitespace chars is committed, or when offline mode is
 *  active. One retry; the caller shows an inline notice on miss/error. */
export function useOffSearch(query: string | null) {
  const offlineMode = usePrefsStore((s) => s.offlineMode);
  const trimmed = query?.trim() ?? '';
  const enabled = trimmed.length >= 2 && !offlineMode;
  return useQuery({
    queryKey: ['off-search', trimmed],
    queryFn: ({ signal }) => fetchOffSearchResults(trimmed, signal),
    enabled,
    retry: 1,
    staleTime: 1000 * 60 * 60,
  });
}
```

### Tests (Phase 1)

- `src/lib/__tests__/openFoodFacts.test.ts` — add fixture cases for
  `mapOffSearchResponse`: multiple products → mapped + capped at 5; a product
  missing `product_name` → dropped; `brands: "Chiquita, Something"` → `brand:
  "Chiquita"`; a product with no `code` → `barcode: null`. Confirm
  `mapOffResponse`'s existing tests still pass unchanged (behavior-preserving
  refactor).
- `src/features/barcode/__tests__/useOffSearch.test.ts` — mirror
  `useOffLookup.test.ts` structure: idle when query is `null`/too short, idle
  when `offlineMode` is true, resolves when enabled.

Commit: `feat(barcode): OFF search-by-name fetch + mapping`

---

## Phase 2 — Wire the lookup into `ComponentForm`

All changes in `src/features/logging/ComponentForm.tsx`.

### 2.1 Local state + trigger

```ts
const [committedQuery, setCommittedQuery] = useState<string | null>(null);
const search = useOffSearch(committedQuery);
const trimmedName = state.name.trim();
const showSearchUi = committedQuery != null && trimmedName === committedQuery;

function handleNameBlur() {
  if (state.barcode != null) return; // scanned item — never override barcode data
  if (trimmedName.length < 2 || trimmedName === committedQuery) return;
  setCommittedQuery(trimmedName);
}

function handleSelectSearchResult(product: OffProduct) {
  setState((prev) => ({ ...prev, ...offProductToComponentFormState(product) }));
  setCommittedQuery(null); // hide the list; a later blur can re-search if needed
}
```

`showSearchUi` gates everything below on "the field's current text is exactly
what we last searched for" — if the user edits the name again after seeing
results, the stale list disappears without any extra state to manage.

### 2.2 Zero-result / error notice with auto-dismiss

```ts
const [noticeVisible, setNoticeVisible] = useState(false);
const searchMiss = showSearchUi && search.isSuccess && search.data.length === 0;
const searchError = showSearchUi && search.isError;

useEffect(() => {
  if (!searchMiss && !searchError) { setNoticeVisible(false); return; }
  setNoticeVisible(true);
  const t = setTimeout(() => setNoticeVisible(false), 3000);
  return () => clearTimeout(t);
}, [searchMiss, searchError, committedQuery]);
```

### 2.3 JSX — under the existing Name `FormField` (after line 96)

- `onBlur={handleNameBlur}` on the Name `ThemedTextInput` (line 89-95).
- While `showSearchUi && search.isLoading`: a small row with `ActivityIndicator`
  (size="small") + `<ThemedText type="small" themeColor="textSecondary">Looking
  up nutrition…</ThemedText>`, `accessibilityLabel="Looking up nutrition"`.
- While `showSearchUi && search.isSuccess && search.data.length > 0`: render each
  result as a `Pressable` row (copy `RecentFoodPicker`'s row styling —
  `backgroundColor: theme.backgroundElement`, `borderColor: theme.border`) with:
  - `testID={`off-search-${index}`}`
  - `accessibilityRole="button"`
  - `` accessibilityLabel={`Use ${product.name}${product.brand ? ` by ${product.brand}` : ''}`} ``
  - Primary line: `product.name`. Secondary line (small, `textSecondary`): join
    `product.brand` and, if `product.nutrition.calories != null`,
    `` `${product.nutrition.calories} kcal` `` with `' · '`.
  - `onPress={() => handleSelectSearchResult(product)}`.
- While `noticeVisible`: `<ThemedText type="small" themeColor="textSecondary">`
  with `"Couldn't find nutrition for that — you can still fill it in
  manually."` (miss) or `"Couldn't reach Open Food Facts — you can still fill it
  in manually."` (error, when `search.error` is set).

### Tests (Phase 2)

Extend `src/features/logging/__tests__/ComponentForm.test.tsx` (RNTL v14 async
pattern — `await render(...)`, mock `../barcode/useOffSearch` or its underlying
`fetchOffSearchResults` the way the existing OFF-adjacent tests do):

- Blurring the Name field with 2+ chars and no barcode set triggers a search
  (assert the mock was called with the trimmed text).
- Blurring with `state.barcode` already set does **not** trigger a search.
- Blurring twice with the same text only searches once.
- Tapping a rendered result row fills the nutrition inputs from that product and
  hides the list.
- Zero results renders the inline notice; it's absent once the name changes again.

Commit: `feat(logging): search-by-name lookup on the component form`

---

## Phase 3 — Retarget Home's manual-entry CTA

`src/app/(tabs)/index.tsx:71` — change:

```tsx
<Link href="/entry/new" asChild>
```

to:

```tsx
<Link href="/meal/component" asChild>
```

Leave the `accessibilityLabel="Add an entry manually"` and visible label
`"+ Add manually"` (line 74, 79) unchanged — same button, new destination.
Leave `handleRecentTap` (line 29-42, still targets `/entry/new`) and the whole
`usePrefillStore`/`LogEntryForm`/`entry/[id].tsx` edit path untouched.

Verify manually (no device needed for this check — just trace the code): with no
prior `useComponentPrefillStore` prefill set, `src/app/meal/component.tsx:22`
reads `prefill` as `null`, so `ComponentForm` mounts with
`defaultComponentFormState(undefined)` — a blank form, exactly like the scan
flow's "Enter manually" today. No new prefill wiring needed.

Commit: `feat(home): route manual entry through the meal-builder chain`

---

## Phase 4 — Flow YAML + doc updates (authored-only, ⏳)

`flows/01b-manual-entry.yaml` currently drives the whole thing (name, meal slot,
sentiment, notes, ingredients, serving size, nutrition, save) in **one** screen
because it targets `LogEntryForm`. Retargeting Home's CTA to `/meal/component`
means this flow must become a **two-screen** flow: fill `ComponentForm` fields →
tap "Finish meal" → land on `meal/review.tsx` for name/slot/date/sentiment/notes
→ Save. Rewrite it to match (check `src/app/meal/review.tsx` and
`flows/01c-barcode-fallback.yaml`/the meal-builder flows for the current
`meal/review` field labels — they changed in the 2026-07-02 cycle). This is a
**shared-infra-adjacent** change (Home's primary manual-entry path) — note in
your summary that the next device session should treat `01b-manual-entry`,
`ab-satfat-ingredients`, and any other flow that starts from "Add an entry
manually" as needing a fresh look, not just a targeted re-run.

Do NOT author a flow asserting the OFF search-by-name UI itself — it's a live
network call against a real product database (same class as "scan a real
barcode"), non-deterministic in `clearState`. Mark it `· manual` in
`docs/E2E.md`/`ACCEPTANCE.md` the way the real-barcode-scan item already is.

Update:
- `docs/E2E.md` — add a Tier-3 coverage row: "OFF search-by-name lookup" →
  `— manual (network, real product DB)`.
- `docs/ACCEPTANCE.md` — add under a new "Post-MVP · OFF search-by-name" section:
  - Typing a food name into the manual-entry Name field and tabbing away shows a
    spinner, then up to 5 candidate rows. · manual (network)
  - Tapping a candidate fills the nutrition grid, servings, and ingredients. · manual (network)
  - A name with no OFF matches shows a short-lived notice and leaves the form
    editable. · manual (network)
  - Home's "+ Add manually" now opens the component-confirm screen and chains
    into "Finish meal" the same as scanning. · auto (rewritten `01b-manual-entry.yaml`, pending device run)
- `PROGRESS.md` Tier 3 line — this handoff supersedes it; the plan session
  already updated the bullet (see below), don't re-edit it here.

---

## After all phases (execute-session closeout)

1. Full rungs green (`npm run typecheck && npm run lint && npm test`).
2. Summarize: what shipped, that manual entry is now a two-step flow (component
   confirm → meal review), which flows were YAML-edited (⏳ authored, pending a
   device test-execute session), and that the feature itself has no automatable
   on-device coverage (network + real product DB, same class as barcode scan).
3. Do not touch `docs/RESULTS.md` (test-execute owns it) or tick ACCEPTANCE boxes.
