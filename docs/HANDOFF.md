# HANDOFF.md — Cycle: Search-a-licious migration + historical tag backfill

> **Read first:** root `CLAUDE.md` (auto-loaded). No other protocol doc is needed —
> every task below is fully specced with file paths from the current tree.
>
> **Session type:** execute. Definition of done per CLAUDE.md §4:
> `npm run typecheck && npm run lint && npm test` green, tests ship with each
> change, one logical change per commit, imperative scoped commit messages.
> No schema change (no migration), no new dependency, no native/Babel change —
> `npm run bundle:check` is not required this cycle. The only UI-adjacent touch
> is a fire-and-forget effect in `app-providers.tsx` (Phase 2); no visible UI
> changes.
>
> **Source of these requirements:** owner planning session 2026-08-15
> (PROGRESS.md Decision 6 revision + owner-approved backfill). Context: the
> legacy OFF search endpoint (`world.openfoodfacts.org/cgi/search.pl`) now
> returns HTTP 503 on unfiltered queries — name search is user-facing broken —
> and it returned each product's *native-language* name anyway. OFF's
> officially recommended replacement is Search-a-licious
> (`search.openfoodfacts.org`), live-verified 2026-08-15 to return all-English
> results with generic entries ranked at the top by default relevance.
> **Do not touch `docs/PROGRESS.md`, `docs/RESULTS.md`, `docs/ACCEPTANCE.md`,
> or `docs/E2E.md`** — the plan session closes those out.

---

## Phase 1 — migrate name search to Search-a-licious

### 1a. `src/features/barcode/api.ts`

- Replace `SEARCH_URL` with `https://search.openfoodfacts.org/search`.
- In `fetchOffSearchResults`, replace the params wholesale:
  - `q`: the query (plain text; Search-a-licious treats unrecognized words as
    full-text search).
  - `langs`: `'en'` — selects which language-specific name fields are searched
    and returned.
  - `page_size`: `'24'` (unchanged — the genericity re-ranker wants a wide pool).
  - `fields`: the existing list **plus `product_name_en`** (i.e.
    `code,product_name,product_name_en,brands,nutriments,serving_quantity,ingredients_text,allergens_tags,additives_tags,categories_tags`).
  - **Remove** `search_terms`, `search_simple`, `action`, `json`, and
    `sort_by`. The `sort_by=unique_scans_n` habit must NOT be ported: on
    Search-a-licious it ranks by *global* popularity, which resurfaces French
    products. Default sort is descending relevance — live-tested to rank
    generic English entries ("Fresh Banana", plain "Bananas") at the top.
    Leave a one-line comment in the code stating exactly that, so a future
    session doesn't "helpfully" re-add popularity sorting.
- **Deliberately no country filter** (`countries_tags`): live testing showed
  `langs=en` alone ranks generic entries best; a US-only filter would exclude
  the UK/international generic produce entries that are OFF's de-facto
  "generic food" rows. Note this in the function's doc comment.
- Update `USER_AGENT` to `TummyTracker/1.0 (michaellovesellen@gmail.com)` —
  OFF's terms now ask for a contact email in the User-Agent. (Applies to both
  the barcode lookup and search; it's one shared constant.)
- Barcode lookup (`fetchOffProduct`, `BASE_URL`) is otherwise **unchanged**.
- Documented OFF limits as of 2026-08: 10 search req/min/IP, 15 product req/min/IP,
  applied per end user for mobile apps. The existing UX already complies
  (search fires on commit, not per keystroke — `useOffSearch` gates on a
  committed query); do not add polling or retry storms. `retry: 1` is fine.

### 1b. `src/lib/openFoodFacts.ts`

- `mapOffSearchResponse`: read `root.hits` (Search-a-licious's array name)
  instead of `root.products`. Everything downstream (drop nameless entries,
  `genericityScore` re-rank, cap at 5) stays. The re-ranker's stable sort now
  tiebreaks on *relevance* order instead of most-scanned order — that's
  strictly better; update its doc comment to say so.
- `mapOffProductJson`: prefer the English name —
  `product_name_en` when it's a non-empty trimmed string, else `product_name`
  (same trimmed-non-empty rule). This helper also serves the barcode path, so
  scanned foreign products gain English names for free when OFF has a
  translation — intended, note it in the comment.
- `nutriments` sub-keys are identical on Search-a-licious (verified live:
  `energy-kcal_100g`, `fat_100g`, `carbohydrates_100g`, `proteins_100g`,
  `fiber_100g`, `sugars_100g`, `sodium_100g`/`salt_100g`) — no mapper changes
  beyond the name fallback.
- Update stale doc comments referencing `cgi/search.pl` / "Generic_Search"
  (file header of `api.ts`, `mapOffSearchResponse` docstring).

### 1c. Tests

- `src/features/barcode/__tests__/useOffSearch.test.ts` and
  `src/lib/__tests__/openFoodFacts*.test.ts` (wherever `mapOffSearchResponse`
  fixtures live): rename fixture root key `products` → `hits`; assert the
  request URL hits `search.openfoodfacts.org/search` with `q`/`langs` and
  **without** `sort_by`.
- New name-fallback cases: `product_name_en` present and different → English
  name wins (both search and barcode-lookup mappers); `product_name_en` absent
  or empty/whitespace → falls back to `product_name`; both empty → entry
  dropped from search results (existing rule).

**Commit:** `feat(barcode): migrate name search to Search-a-licious endpoint`

---

## Phase 2 — historical tag re-derive backfill (owner-approved 2026-08-15)

Entries saved before the 2026-08-15 ingredient-capture hardening lack
parenthetical sub-ingredient tags (the old `extractTags` deleted `(...)`
content). Re-derive tags for stored rows as an **additive-only union** —
existing tags are never removed or reordered, new ones are appended. This is
the same policy as the Phase-3 merge in `formModel.ts` (see its comment).

### 2a. Pure derivation — `src/lib/tagBackfill.ts` (new)

Pure, no I/O, unit-testable. Using `mergeTags`, `extractTags`, `parseTagsJson`,
`serializeTags` from `@/lib/ingredients`:

- `rederiveRowTags(tagsJson: string | null, ingredientsText: string | null): string | null`
  — returns the **new** serialized tags when the union
  `mergeTags(existing, extractTags({ ingredientsText, allergensTags: null, additivesTags: null }))`
  grew, else `null` (no update needed). Because the union is additive and
  order-preserving, "grew" is simply `merged.length > existing.length`.
- `planTagBackfill(entries, componentsByEntryId)` — takes food-type `LogEntry`
  rows (filter with `FOOD_TYPES` from `@/db/schema`; skip bm/symptom rows) and
  a map of each entry's `MealComponent` rows. Returns
  `{ entryUpdates: { id, tagsJson }[], componentUpdates: { id, tagsJson }[] }`:
  1. Each component row re-derives from its **own** `ingredientsText`.
  2. Each entry re-derives from its own `ingredientsText`, **then** unions in
     every tag of its (post-re-derive) component rows — multi-component
     parents saved before hardening gain any newly recovered sub-ingredient
     tags; the parent must remain a superset of its components' tags (the
     collation invariant).
  3. Rows whose union didn't grow produce no update. Running the plan twice
     must produce zero updates the second time (idempotent — assert in tests).

### 2b. Persistence — `src/db/repository.ts`

Add `applyTagBackfill(entryUpdates, componentUpdates): Promise<void>`: one
transaction, `set({ tagsJson })` per row by id. **Do not bump `updatedAt`** —
this is a repair of derived data, not a user edit; bumping would falsify the
edit history (comment this; it's why the function doesn't reuse
`updateLogEntry`). No-op fast-path when both arrays are empty.

### 2c. Run-once gate — `src/lib/prefs.ts` + runner

- Add `tagBackfillV1Done: boolean` to `AppPrefs`, default `false` in
  `DEFAULT_PREFS` (the `{ ...DEFAULT_PREFS, ...JSON.parse(text) }` load
  pattern makes the new field backward-compatible with existing pref files).
- New `src/db/tagBackfillRunner.ts`: `runTagBackfillOnce()` —
  `loadPrefs()`; return early if `tagBackfillV1Done`; else
  `listLogEntries()` + `listAllMealComponents()` → `planTagBackfill` →
  `applyTagBackfill` → `savePrefs({ ...prefs, tagBackfillV1Done: true })`.
  Set the flag **only after** a successful apply — on throw, swallow with
  `console.warn` and leave the flag unset so the next launch retries
  (idempotence makes retry safe).
- `src/components/app-providers.tsx`: inside `MigrationGate`, fire-and-forget
  after migrations succeed:
  `useEffect(() => { if (success) void runTagBackfillOnce(); }, [success]);`
  Do not gate rendering on it — the backfill is additive; stale-until-repaired
  reads are acceptable for one launch.

### 2d. Tests

`src/lib/__tests__/tagBackfill.test.ts` (pure-function tests carry the load):

- Pre-hardening row: `tagsJson` lacking parenthetical sub-ingredients +
  `ingredientsText` `"Tofu (water, soybeans, calcium sulfate)"` → update adds
  `soybeans`, `calcium sulfate` etc., existing tags first, order preserved.
- Additive-only: a tag whose word no longer appears in `ingredientsText`
  survives; no update produced when the text is a subset of existing tags.
- Idempotent: re-planning over updated rows yields zero updates.
- Multi-component parent: gains a tag recovered on a component; parent stays
  a superset of component tags.
- Skips: non-food types untouched; `null`/empty `ingredientsText` handled
  (component-union step still runs for parents).
- Runner: one test that a set `tagBackfillV1Done` flag short-circuits before
  any DB read (mock `@/lib/prefs` and the repository module).

**Commit:** `feat(db): additive tag re-derive backfill for pre-hardening entries`

---

## Phase 3 — constitution touch-up (root `CLAUDE.md` only)

§3 tech-stack table, Nutrition API row → `**Open Food Facts** (product lookup
`world.openfoodfacts.org` + search `search.openfoodfacts.org`, no key)`. Do not
edit `docs/CLAUDE.md` (historical spec — stays as-is per its §0 note).

**Commit:** `docs(claude): record Search-a-licious as the OFF search endpoint`

---

## Explicitly out of scope (do not do these)

- **USDA anything** (API fallback or bundled dataset) — Decision 6: re-test the
  generic-food gap after this migration before adding any second source.
- **Any visible UI change**, including result-list copy or layout.
- **Country filtering or popularity sorting** on search (see Phase 1 rationale).
- **Search-as-you-type** — OFF terms; keep commit-gated queries.
- **Schema changes/migrations** — the backfill mutates only `tagsJson` values.
- **Editing `docs/PROGRESS.md` / `docs/RESULTS.md`** — plan session's job.

## After the phases (execute-session closeout)

1. Full rungs green (`npm run typecheck && npm run lint && npm test`).
2. Summarize per phase; call out any spec deviation explicitly.
3. Note for the next test-plan session: the search endpoint change is
   runtime-visible — the next device session owes an on-device search-by-name
   smoke ("banana" → English, generic-first results) on top of the two
   targeted Maestro flows already owed from the hardening cycle
   (`ab-satfat-ingredients`, `01b-manual-entry`); the backfill needs a
   one-launch check that pre-existing entries gained tags (owner checklist).
