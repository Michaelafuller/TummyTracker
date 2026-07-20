# HANDOFF.md — Cycle: ingredient-capture hardening (meal-collation granularity audit)

> **Read first:** root `CLAUDE.md` (auto-loaded). No other protocol doc is needed —
> every task below is fully specced with file paths and line numbers from the
> current tree.
>
> **Session type:** execute. Definition of done per CLAUDE.md §4:
> `npm run typecheck && npm run lint && npm test` green, tests ship with each
> change, one logical change per commit, imperative scoped commit messages.
> No schema change (no migration), no UI change, no new dependency, no
> native/Babel change — `npm run bundle:check` is not required this cycle.
>
> **Source of these requirements:** owner planning session, 2026-07-19. The
> owner's question: *when multiple scanned items (tofu, eggs, cheese, beans) are
> collated into one meal, is the per-item ingredient granularity lost?* The
> ingredient→sentiment correlation is the heart of the app — an analysis must be
> able to indict "soy protein isolate", not just "tofu".

---

## Audit verdict (context — read once, then execute the phases)

**No analytic granularity is lost at collation.** The verified chain:

1. Scan → `mapOffProductJson` derives tags from the **full** OFF
   `ingredients_text` + `allergens_tags` + `additives_tags`
   (`src/lib/openFoodFacts.ts:93-97`), and `offProductToComponentFormState`
   seeds the component form with both the full ingredient text and the
   serialized tags (`src/lib/openFoodFacts.ts:275-288`).
2. Component confirm → `buildComponentDraft` keeps a non-empty `tagsJson`
   verbatim (`src/features/logging/componentFormModel.ts:103-111`).
3. Save → `createMealWithComponents` stores the parent `tagsJson` as
   `unionComponentTags` (every component's tags + each normalized component
   name) and persists each component row with its own full `ingredientsText` +
   `tagsJson` (`src/db/repository.ts:45-70`, `src/lib/mealAggregate.ts:50-69`).
4. Analysis (`insights.ts`, `temporal.ts`) reads the parent `tagsJson` only —
   so the full ingredient/allergen/additive set flows into correlation,
   including pair analysis.
5. Later edits (e.g. rating sentiment afterward) preserve stored tags:
   `logEntryToFormState` hydrates `tagsJson` and `buildLogEntry` reuses
   non-empty tags (`src/features/logging/formModel.ts:150-158`).
6. Recents quick-add copies `tagsJson` through (`src/app/(tabs)/index.tsx:29-42`),
   and backup v2 round-trips `mealComponent` rows.

The condensed "Tofu, Eggs, Cheese, Beans" the owner sees is **only** the
parent's display `ingredientsText` (`src/features/logging/mealReviewFormModel.ts:85`,
`src/db/repository.ts:52`). Analysis never reads `ingredientsText`. **Keep the
condensed display — it is owner-approved UX. Do not add any UI.**

However, the audit found three real capture gaps — none specific to collation,
all UI-invisible to fix. This cycle closes them and locks the collation
invariant with a regression test.

---

## Phase 1 — stop dropping parenthetical sub-ingredients in `extractTags`

**The one genuine granularity loss found, and it affects every entry.**
`src/lib/ingredients.ts:58` deletes parenthetical content wholesale:
`.replace(/\([^)]*\)/g, '')`. OFF ingredient lists lean on parentheses for
compound-ingredient breakdowns — `"Tofu (water, soybeans, calcium sulfate),
seasoning (onion powder, garlic)"` currently yields only `tofu, seasoning`,
throwing away exactly the sub-ingredient signal (soybeans, calcium sulfate,
onion powder) the owner cares about.

**Change** (in `extractTags`, `src/lib/ingredients.ts:55-63`): keep the
percentage strip, then treat brackets as *delimiters* instead of deleting their
content:

```ts
.replace(/\d+(\.\d+)?%/g, '')   // unchanged
.replace(/[()[\]]/g, ',')       // was: .replace(/\([^)]*\)/g, '')
```

Nested parens flatten correctly under this rule (every bracket becomes a comma;
empty/short tokens are already filtered by the `length >= 2` check, and the
existing `[^a-z0-9 -]` char strip still cleans stray punctuation). Update the
function's doc comment (lines 21-31): parenthetical content is now *captured as
separate tags*, not stripped.

**Tests** (`src/lib/__tests__/ingredients.test.ts`): existing assertions that
expect parenthetical content to be *dropped* must be deliberately inverted —
that behavior is the bug. Add cases: compound ingredient with sub-ingredients
(all captured as separate tags); nested parens; percentages inside parens still
stripped (`"cheese (milk 13%)"` → `cheese`, `milk`); stopwords inside parens
still filtered (`"(may contain traces of nuts)"` contributes `nuts` at most,
never `may`/`contain`/`traces`).

Note: tags are computed at capture time, so this improves **future** entries
only. Historical re-derivation is explicitly out of scope (see below).

**Commit:** `feat(ingredients): capture parenthetical sub-ingredients as tags`

---

## Phase 2 — single-component meals keep their full ingredient text

Since the 2026-07-02 cycle, *every* food entry goes through the meal builder
(Home's "+ Add manually" targets `/meal/component`; scan lands there too). For a
single-component meal, `buildMealEntry` sets the parent `ingredientsText` to the
component's **name** (`mealReviewFormModel.ts:85`) — so a scanned single item
shows "Tofu" in the edit screen's Ingredients field where the old single-item
flow showed the real ingredient list. (Tags are unaffected; this is a display /
data-fidelity regression on the parent row. The edit screen also doesn't render
component rows when `componentCount <= 1` — `src/app/entry/[id].tsx:43` — so the
full text is currently unreachable for these entries.)

Note the derivation is **duplicated**: `buildMealEntry`
(`mealReviewFormModel.ts:85`) and `createMealWithComponents`
(`repository.ts:52`) each compute the names-join independently. Consolidate:

- Add to `src/lib/mealAggregate.ts`:

  ```ts
  /**
   * Display ingredient text for the aggregate meal row. A single-component meal
   * keeps its component's full ingredient list (parity with the old single-item
   * flow); a multi-component meal condenses to the component names — the full
   * per-item lists live on the mealComponent rows, and analysis reads tagsJson,
   * never this field.
   */
  export function mealIngredientsText(
    components: readonly Pick<MealComponentDraft, 'name' | 'ingredientsText'>[],
  ): string | null {
    if (components.length === 0) return null;
    if (components.length === 1) {
      const only = components[0];
      return only.ingredientsText?.trim() ? only.ingredientsText : only.name;
    }
    const joined = components.map((c) => c.name).join(', ');
    return joined.length > 0 ? joined : null;
  }
  ```

- Use it in **both** call sites (`mealReviewFormModel.ts:85` and
  `repository.ts:52`), replacing the inline joins.

**Tests:** `src/lib/__tests__/mealAggregate.test.ts` (single component with
text → full text; single without text → name; multi → names join; empty → null)
and adjust `src/features/logging/__tests__/mealReviewFormModel.test.ts` if it
asserts the old single-component behavior.

**Commit:** `fix(logging): keep full ingredient text on single-component meals`

---

## Phase 3 — merge user-edited ingredient text into tags (never ignore it)

In both `buildLogEntry` (`formModel.ts:150-158`) and `buildComponentDraft`
(`componentFormModel.ts:103-111`), pre-computed tags **win outright**: when
`tagsJson` is non-empty, the ingredient text field is never re-tokenized. So if
the owner types "hot sauce" into the Ingredients field of a scanned item (or an
existing entry), it never becomes a tag — invisible to the correlation engine.

**Change:** in both places, merge instead of preferring one side —
`finalTags = existingTags ∪ extractTags(trimmedIngredients)`, existing tags
first (allergens/additives keep their lead position). Add a small helper to
`src/lib/ingredients.ts`:

```ts
/** Order-preserving union of tag arrays (first occurrence wins). */
export function mergeTags(...lists: readonly string[][]): string[]
```

and rewrite both `finalTagsJson` computations to use
`mergeTags(existingTags, extractTags({ ingredientsText: trimmedIngredients, allergensTags: null, additivesTags: null }))`
(when the text is empty, this degrades to the existing tags; when tags are
empty, to the text extraction — both current behaviors preserved). Deliberate
asymmetry, add a code comment: tag capture is **additive-only** — deleting a
word from the text does not remove its tag, because we can't tell a removed
ingredient from a shortened note, and false-negative capture is worse than a
stale tag.

For a grouped meal's edit screen this is safe: the text field holds component
names, whose normalized forms are already in the union (`unionComponentTags`
adds them), so merging adds nothing spurious.

**Tests:** `formModel.test.ts` + `componentFormModel.test.ts` — edited text
adds new tags while OFF tags survive; OFF-only and text-only paths unchanged;
tag order (existing first) asserted.

**Commit:** `feat(logging): merge edited ingredient text into existing tags`

---

## Phase 4 — regression test locking the collation invariant

Extend `src/features/analysis/__tests__/mealBuilderCompat.test.ts` with an
end-to-end tripwire over the *real* pipeline (no hand-rolled tagsJson): build
3–4 realistic OFF-style products (allergens_tags + additives_tags + multi-token
`ingredients_text` including parenthetical sub-ingredients), run each through
`mapOffResponse` → `offProductToComponentFormState` → `buildComponentDraft`,
collate with `buildMealEntry`, then assert:

1. **Every** tag derivable from every component (including the parenthetical
   sub-ingredients from Phase 1 and every allergen/additive) appears in the
   parent entry's `tagsJson` — i.e. nothing is smoothed out by collation.
2. Each component draft retains its full `ingredientsText`.
3. The parent `ingredientsText` stays the condensed names-join for the
   multi-component case (the owner-approved display contract).

Name the test so its intent is unmissable, e.g.
`'collating components into a meal never drops a component tag'`.

**Commit:** `test(analysis): lock meal-collation tag-granularity invariant`

---

## Explicitly out of scope (do not do these)

- **Historical tag re-derivation/backfill.** Phase 1 widens capture for new
  entries; recomputing tags for already-saved rows mutates user data and needs
  an owner decision first (an additive-only union re-derive would be safe and
  cheap — flagged for the next planning session, not this one).
- **Any UI change** — no per-component ingredient display on the edit screen,
  no new fields, no copy changes. The condensed meal display is the contract.
- **Meal-component editing after save** (already Tier 2 backlog).
- **OFF/USDA sourcing changes** (PROGRESS.md Decision 6 — don't re-open).

## After the phases (execute-session closeout)

1. Full rungs green (`npm run typecheck && npm run lint && npm test`).
2. Summarize: the audit verdict (granularity was already preserved through
   collation), what each phase hardened, and the additive-only tag policy.
3. Note for the next test-plan session: all changes are `lib/`/form-model
   level with no observable UI change — targeted Maestro re-run of
   `flows/ab-satfat-ingredients.yaml` + `flows/01b-manual-entry.yaml` on the
   next device session is sufficient; no new flows owed. Do not touch
   `docs/RESULTS.md`, `docs/ACCEPTANCE.md`, or `docs/E2E.md`.
