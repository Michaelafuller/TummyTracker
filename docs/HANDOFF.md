# HANDOFF.md — Execute session: meal-component drill-down (edit after save)

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§4 rungs = definition
> of done, §8 conventions). This cycle touches `src/app/entry/`, `src/app/_layout.tsx`,
> `src/features/logging/`, `src/lib/mealAggregate.ts`, `src/db/repository.ts`.
> No new dependency, no schema change, no migration. Pure JS/TS cycle — no build,
> no device work; Maestro flows are a later test session's job.

**Planned 2026-08-21 (Fable plan session).** One cycle, one feature, plus two
small test hardenings from the same session's serving-size discovery.

---

## 0. Context — what the plan session verified (do not re-derive)

The discovery question this cycle answered: *does the servings multiplier
correctly scale nutrition (1 serving = 1 fat → 2 servings = 2 fat)?* **Yes —
verified, no fix needed.** The contract, so you don't break it while editing:

- `mealComponent` nutrition fields are **per ONE serving**; `servings` is the
  multiplier (`src/db/schema.ts` ~63–99, comment is explicit).
- `aggregateComponents` (`src/lib/mealAggregate.ts:27`) sums `value × servings`
  per field; null only when every component lacks the field. Unit-tested incl.
  servings=2, 0.5, rounding (`src/lib/__tests__/mealAggregate.test.ts`).
- Save path: `buildMealEntry` (`src/features/logging/mealReviewFormModel.ts:91`)
  and `createMealWithComponents` (`src/db/repository.ts:57`) both write the
  aggregate onto the parent `logEntry` row. Everything downstream (daily tally,
  goal caps, insights, watchlist) reads that entry-level aggregate — the
  multiply is baked in once, at aggregation.
- Display rows multiply the same way: review screen (`src/app/meal/review.tsx:132`)
  and entry view (`src/app/entry/[id].tsx:147`) show `calories × servings`.
- OFF prefill fills the nutrition grid with per-serving values (per-100g base ×
  servingG/100). Changing **servingG** rescales the grid from `nutritionBase`;
  changing **servings** deliberately does not touch the grid (per-serving
  semantics; the multiply happens at aggregate). This is correct — don't
  "fix" it.

Known wrinkle, **out of scope, do not change**: a single-component meal saved
with servings≠1 stores `servingG` for one serving but nutrition for N servings
on the entry row, and hides its component row (`componentCount > 1` gate). Noted
for a future cycle.

## 1. The feature — tap a component row to view/edit it, with re-aggregation

**Owner ask:** drill into a saved meal's components to see each component's
nutrition — a quick tap on the row opening the component's update screen. This
implements the Tier-2 backlog row "Meal-component editing after save".

Today `src/app/entry/[id].tsx` renders grouped-meal components as read-only rows
(name · N× serving · kcal). v1 saved components immutably. This cycle makes each
row tappable → a new screen showing the full `ComponentForm` prefilled with that
component (the whole nutrition grid is the "see the nutritional information"
part) → Save updates the `mealComponent` row **and re-aggregates the parent
entry** so totals/tags stay consistent.

### 1.1 Pure logic first (`src/lib/mealAggregate.ts`)

Add a pure helper so the re-aggregation contract is Jest-testable without a DB:

```ts
/** Patch for the parent entry after its components changed: fresh nutrition
 *  aggregate + additive tag merge (a removed word never deletes a tag). */
export function reaggregateEntryPatch(
  components: readonly ComponentLike&Tags[],   // saved MealComponent rows
  existingEntryTagsJson: string | null,
): { nutrition: NutritionValues; tagsJson: string | null }
```

- `nutrition` = `aggregateComponents(components)` — recomputed **fresh** (an
  edit that lowers fat must lower the total; nutrition is not additive-only).
- `tagsJson` = `mergeTags(parseTagsJson(existingEntryTagsJson),
  unionComponentTags(components))`, serialized; null when empty. Additive-only
  is the project's tag policy (2026-08-15 ingredient-hardening) — renaming a
  component must never strip a previously captured tag from the entry.
- Entry `name`, `ingredientsText`, `servingG`, `barcode`, `sentiment`,
  `loggedAt`, `componentCount`: **untouched** (user-editable / meal-level;
  clobbering a user's own edits is worse than a stale derived string).

Use exact existing types rather than the sketch above (`MealComponent` is
already re-exported from `mealAggregate.ts`).

### 1.2 Form-state round-trip (`src/features/logging/componentFormModel.ts`)

Add `mealComponentToFormState(row: MealComponent): Partial<ComponentFormState>`
mirroring `logEntryToFormState` conventions (`formModel.ts:~94`): numbers →
strings (`''` when null), `nutritionBase: null` with the same comment as the
entry edit path (per-100g base isn't persisted, so servingG rescaling is
unavailable when editing — typing a new servingG must NOT rescale the grid
here, which `handleServingChange` already guarantees when `nutritionBase` is
null), `tagsJson` passed through so `buildComponentDraft`'s additive merge
keeps OFF tags.

### 1.3 Repository (`src/db/repository.ts`)

- `getMealComponent(id: string): Promise<MealComponent | undefined>`.
- `updateMealComponentAndReaggregate(componentId, draft: MealComponentDraft):
  Promise<void>` — one transaction:
  1. Update the component row from the draft, **keeping its existing
     `sortOrder`** (pass the row's own sortOrder into `buildComponentDraft` at
     the call site) and `createdAt`/`id`/`entryId`.
  2. Re-read all components for the entry (post-update), compute
     `reaggregateEntryPatch(components, entry.tagsJson)`.
  3. Update the entry row with the patch's nutrition fields + tagsJson +
     `updatedAt: Date.now()`.

### 1.4 New route `src/app/entry/component/[componentId].tsx`

- Register in `src/app/_layout.tsx`: `<Stack.Screen
  name="entry/component/[componentId]" options={{ title: 'Edit component' }} />`
  (plain push like `entry/[id]`, not modal — it's an edit drill-down).
- Screen shape mirrors `entry/[id].tsx`: load via `getMealComponent`
  (undefined=loading spinner, null=not-found state), then render
  `ComponentForm` inside the same `KeyboardAvoidingView`/`ScrollView` chrome
  with `initial={mealComponentToFormState(row)}`,
  `sortOrder={row.sortOrder}`, `submitLabel="Save changes"`, `onSubmit` →
  `updateMealComponentAndReaggregate(row.id, draft)` → `router.back()`. No
  secondary action, no delete (component removal is deliberately out of scope
  this cycle).
- `ComponentForm` gets a disabled/submitting guard only if trivial — its
  current API lacks a `submitting` prop; do NOT redesign it. An in-screen
  `submitting` state that ignores re-entry (like `handleSubmit` in
  `entry/[id].tsx`) is enough.

### 1.5 Entry view wiring (`src/app/entry/[id].tsx`)

- Wrap each component row in a `Pressable` (`accessibilityRole="button"`,
  `accessibilityLabel={`Edit ${component.name}`}`, `testID` per row) →
  `router.push(\`/entry/component/${component.id}\`)`. Add a small "›"
  affordance (ThemedText, textSecondary) so it reads as tappable.
- **Refresh on return** — the screen currently loads entry + components once.
  After editing a component, back-navigation must show fresh data (both the
  component row and the re-aggregated nutrition inside `LogEntryForm`):
  - Re-fetch entry (and thus components, via the existing effect chain) on
    focus: `useFocusEffect` from `expo-router` (already a dependency; import
    `useCallback` wrapper per its API).
  - `LogEntryForm`/`BmForm`/`SymptomForm` seed state from `initial` once —
    remount on data change with `key={String(entry.updatedAt)}` so the
    re-aggregated totals actually appear.
  - Keep the `componentCount > 1` gate exactly as is.

### 1.6 Tests (same change, per CLAUDE.md §4)

Follow existing patterns — RNTL v14 is async (`await render`, destructure
queries from the awaited result; never the global `screen`).

- `mealAggregate.test.ts`: `reaggregateEntryPatch` — fresh-recompute lowers
  totals after an edit; additive tag merge keeps a tag the edited component no
  longer carries; multiply still applied (`servings: 2` → doubled
  contribution).
- `componentFormModel.test.ts`: `mealComponentToFormState` round-trip — row →
  state → `buildComponentDraft` reproduces the row's values (name, servings,
  servingG, nutrition, tags preserved additively).
- New screen test `src/app/entry/component/__tests__/[componentId].test.tsx`
  modeled on `src/app/meal/__tests__/component.test.tsx` +
  `src/app/entry/__tests__/[id].test.tsx` (mock `expo-router` +
  `@/db/repository` the same way): renders prefilled name/servings, editing
  servings + save calls `updateMealComponentAndReaggregate` with the new
  draft and navigates back.
- `[id].test.tsx`: component rows navigate on press (assert `router.push`
  with the component id).

### 1.7 Discovery hardenings (small, same cycle)

1. `mealReviewFormModel.test.ts`: if not already covered, one test that
   `buildMealEntry` writes multiplied aggregates onto the entry
   (component `fatG: 1, servings: 2` → `entry.fatG` includes 2).
2. `review.test.tsx` / existing display tests: only if trivially cheap, assert
   the row string shows `calories × servings` (e.g. 100 kcal × 2 → "200 kcal").
   Skip if the existing tests already pin this.

## 2. Definition of done

- `npm run typecheck` && `npm run lint` && `npm test` — all green, run them.
- No `// @ts-ignore`, no lint disables, no new dependency, no schema change.
- Commits: small, imperative, scoped — suggested split:
  1. `feat(logging): add reaggregateEntryPatch + mealComponentToFormState`
  2. `feat(logging): editable meal components after save with re-aggregation`
  3. `test(logging): serving-multiply hardening from discovery`
  (or 2 commits if the hardenings fold naturally into 1/2's test files).
- End with a brief execute summary (what shipped, file list, rung status,
  anything punted) — the review pass reads it.

## 3. For the later test-plan session (do not do now)

On-device coverage owed once this ships: extend or sibling a flow next to
`flows/01d-browse-edit.yaml` — build a 2-component meal, open the entry, tap a
component row, change servings 1→2, save, assert the entry's aggregate line
reflects the doubled kcal and persists across relaunch. ACCEPTANCE.md rows to
add accordingly.
