# HANDOFF.md — Execute session: re-log a past meal + add items to it (GitHub #1)

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§4 rungs, §8
> conventions, §9 guardrails). This cycle is **pure JS/TS** — no new
> dependency, no schema change, no native/config change, no EAS build. It
> touches `src/lib/mealAggregate.ts`, `src/features/logging/mealBuilderStore.ts`,
> `src/app/(tabs)/index.tsx`, `src/app/meal/review.tsx`,
> `src/app/meal/component.tsx`, and their tests.

**Planned 2026-09-26 (Opus plan session), owner-requested — GitHub issue
Michaelafuller/TummyTracker#1:**

> As a User, I want to be able to add new food items when selecting an
> existing meal item from my history, so that I can update similar, but not
> exact, meals for faster meal entry.
>
> Done when there is an "Add item" button that follows the existing
> add-food-item-to-a-meal process.

**Owner decisions (2026-09-26):**
1. **Copy, never edit.** Picking a past meal starts a *new* draft meal
   (date/time = now) pre-loaded with that meal's items. The original entry is
   never modified. (Edit-in-place of a saved meal stays on `entry/[id]`, out
   of scope.)
2. **Every Recent tap goes to the meal review screen** — single foods and
   multi-item meals alike. A single food becomes a one-item draft meal.
3. **After adding an item the user lands back on the review screen** with the
   new item listed and totals updated, then taps the existing "Save meal".

---

## 0. How it works today (so you don't re-derive it)

- **"History" = Home's Recent list** (`RecentFoodPicker`). `handleRecentTap`
  in `src/app/(tabs)/index.tsx` flattens the entry into the single-item
  `LogEntryForm` via `usePrefillStore` → `/entry/new`. A multi-item meal is
  squashed to one flat entry and **its components are lost** — this cycle
  fixes that as a side effect.
- **The existing add-food process is the meal builder:** `/scan` (or its
  "Enter manually" hatch) → `router.replace('/meal/component')` → "Add & scan
  next" (`replace('/scan')`) or "Finish meal" (`replace('/meal/review')`) →
  `/meal/review` → "Save meal" (`createMealWithComponents`, then
  `clearBuilder()` + `router.dismissAll()`).
- **`/meal/review` already does most of the story:** item list with a
  per-item **Remove**, live aggregate, cap/watchlist notices, and a save that
  always *creates* a new entry. Its name/type/slot/date/notes live in local
  `useState` seeded once by `defaultMealReviewState(components)`.
- **`useMealBuilderStore` is only cleared on save.** Abandoning the builder
  midway leaves stale components that leak into the next meal (latent bug —
  fixed here in §1.5 because seeding from history makes it worse).

## 1. Changes

### 1.1 `src/lib/mealAggregate.ts` — pure seed helper

```ts
/**
 * Turn a saved food entry into builder drafts for a "re-log with changes"
 * session. Uses the entry's saved component rows when there are any; a flat
 * entry (legacy / single-item, no component rows) becomes one draft built
 * from the entry's own fields with servings = 1 (logEntry nutrition is the
 * as-eaten total, so ×1 reproduces it exactly).
 */
export function entryToComponentDrafts(
  entry: LogEntry,
  components: readonly MealComponent[],
): MealComponentDraft[]
```

- Component rows → drop `id`, `entryId`, `createdAt`; keep everything else
  (servings, servingG, per-serving nutrition, `ingredientsText`, `tagsJson`),
  ordered by `sortOrder`.
- Flat entry → `name`, `barcode`, `servings: 1`, `servingG`, every
  `NUTRITION_FIELDS` value, `ingredientsText`, `tagsJson`, `sortOrder: 0`.
- Must round-trip: `aggregateComponents(entryToComponentDrafts(e, rows))`
  equals the entry's saved nutrition for both shapes (assert it in tests).

### 1.2 `src/features/logging/mealBuilderStore.ts` — load + review prefill

Add to the store:

```ts
reviewPrefill: Partial<MealReviewFormState> | null;
/** Replace the whole builder (never append) — used when seeding from history. */
load: (components: MealComponentDraft[], reviewPrefill: Partial<MealReviewFormState>) => void;
```

- `load` **replaces** `components` and sets `reviewPrefill`.
- `clear()` resets **both** `components: []` and `reviewPrefill: null`.
- Import `MealReviewFormState` as a type only (avoid a runtime cycle).

### 1.3 `src/app/(tabs)/index.tsx` — Recent tap seeds the builder

Replace `handleRecentTap`'s body:

1. `const rows = await getMealComponents(entry.id)` (already exported from
   `@/db/repository`; returns `[]` for flat entries).
2. `load(entryToComponentDrafts(entry, rows), { name: entry.name, type:
   entry.type, mealSlot: entry.mealSlot })` — **notes are not copied**
   (they describe that occasion), date/time is left to default to now.
3. `router.push('/meal/review')`.

Drop the now-unused `usePrefillStore` / `logEntryToFormState` / datetime
imports from this file. Leave `src/app/entry/new.tsx` and `prefillStore.ts`
in place (see §5 — owner decides on removal).

### 1.4 `src/app/meal/review.tsx` — "Add item" button + prefill

- Initial state: `{ ...defaultMealReviewState(components), ...reviewPrefill }`
  read once inside the existing `useState` initializer (read via
  `useMealBuilderStore.getState()` like `meal/component.tsx` reads its prefill).
- **"Add item" button** directly **below the "In this meal" list** (above
  the aggregate line): secondary style consistent with the screen,
  `accessibilityLabel="Add item to this meal"`, `testID="review-add-item"`,
  label "Add item". `onPress={() => router.push('/scan')}`.
  - `push`, **not** `replace`: the review screen stays mounted underneath,
    so any name/slot/notes edits the user already made survive the round
    trip, and hardware-back from the scanner returns to the draft instead of
    abandoning it.
- Everything else (Remove, aggregate, notices, Save) is unchanged — it
  already reacts to store changes.

### 1.5 `src/app/meal/component.tsx` — return to the existing review

- "Finish meal": `router.replace('/meal/review')` →
  **`router.dismissTo('/meal/review')`** (expo-router 56.2 exports it). If a
  review screen is already in the stack (the Add-item path) it pops back to
  that mounted instance; if not (the normal Home → Scan path) it replaces —
  identical to today's behavior, so existing flows are unaffected.
- "Add & scan next" keeps `router.replace('/scan')`.

### 1.6 Clean start for a new meal (latent-bug fix)

Home's "Scan barcode" and "Add an entry manually" CTAs start a *new* meal,
so they must call `useMealBuilderStore.getState().clear()` before
navigating. They are `<Link asChild>` today — add an `onPress` that clears
on the inner `Pressable` (Link still navigates), or convert to
`router.push` in a handler — whichever keeps the existing `testID`s /
labels / flattened styles intact (Maestro flows depend on them).

## 2. Out of scope (do not build)

- Changing an item's servings on the review screen (store's
  `updateComponent` exists but has no UI) — **candidate follow-up story**.
- Adding items to a saved entry in place from `entry/[id]` (owner chose copy
  semantics).
- Badging Home recents with watched ingredients (already a separate
  optional follow-on).

## 3. Tests (same change, CLAUDE.md §4)

- **`src/lib/__tests__/mealAggregate.test.ts`** — `entryToComponentDrafts`:
  multi-component entry → drafts in `sortOrder` with ids stripped; flat
  entry → one draft, `servings: 1`, all nutrition/tags/ingredients carried;
  entry with `componentCount` set but zero rows → falls back to the flat
  draft; round-trip `aggregateComponents(...)` equals the entry's nutrition
  for both shapes.
- **`src/features/logging/__tests__/mealBuilderStore.test.ts`** — `load`
  replaces (not appends) pre-existing components; `clear` resets
  `reviewPrefill` too.
- **`src/app/(tabs)/__tests__/index.test.tsx`** — tapping a recent row
  calls `getMealComponents(entry.id)`, loads the store with the expected
  drafts + prefill (name/type/slot, no notes), and pushes `/meal/review`;
  Scan / manual CTAs clear a pre-populated builder. Add `getMealComponents`
  to the existing `@/db/repository` mock.
- **`src/app/meal/__tests__/review.test.tsx`** — `reviewPrefill` populates
  the name field (and slot); "Add item to this meal" pushes `/scan` (add
  `push` to the router mock); saving a loaded draft calls
  `createMealWithComponents` once with all components (original + added) —
  i.e. it creates, never updates.
- **`src/app/meal/__tests__/component.test.tsx`** — "Finish meal" now calls
  `dismissTo('/meal/review')` (update the router mock + the existing test at
  line ~65).

## 4. Definition of done

- `npm run typecheck` && `npm run lint` && `npm test` green — run all three.
  (`bundle:check` not required: no deps/config/Babel change.)
- No `// @ts-ignore`, no lint disables, no schema change, no new dependency.
- Every new interactive element has an `accessibilityLabel` (§8).
- Do NOT run EAS, Metro, or Maestro.
- Commits (imperative, scoped), suggested split:
  `feat(logging): seed meal builder from a history entry` (lib helper +
  store + tests) ·
  `feat(logging): re-log recents through meal review with an Add item button`
  (index, review, component + tests) ·
  `fix(logging): clear stale meal-builder state when starting a new meal`.
- Execute summary: files, commits, rung results (suite/test counts),
  deviations with reasons.

## 5. After this (review pass + test session + owner decisions)

- **Opus review** of the diff; re-run the three rungs.
- **Test session (on-device, Metro-served — no new build needed):**
  - **Update `flows/h-recent-foods.yaml`** — after tapping `recent-oatmeal`
    it now lands on meal review ("In this meal" / "Save meal", not "Save
    entry"). Extend it: tap `review-add-item` → "Enter manually" → fill a
    name (e.g. "Banana") → "Finish meal" → assert back on review with both
    "Oatmeal" and "Banana" listed → "Save meal" → Journal shows the new
    entry and the original Oatmeal entry is still present and unchanged.
  - Scratch-check hardware-back from the scanner during Add item returns to
    the draft with the name edit intact.
  - **Full regression** — every flow that taps "Finish meal" now goes
    through `dismissTo` (behavior should be identical; prove it).
- **Owner decisions owed:**
  - `src/app/entry/new.tsx` + `prefillStore.ts` lose their only entry point
    (Recent tap). Delete them in a follow-up cleanup, or keep for a future
    use?
  - Pin "adjust servings on the review screen" as the next story?
