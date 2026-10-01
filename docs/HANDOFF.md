# HANDOFF.md — Execute session: Saved meals ("My meals") with ingredients, GitHub #25

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§0: synchronous
> transactions, the #13/#23 restore rules — this cycle mirrors them). **You
> are on the burn-down branch (`worktree-agent-a93006f35a36fc943`) in its
> worktree** — #19–#24 are reviewed but unmerged; this cycle stacks on them.
> Never touch the main checkout.
>
> **JS/TS + one additive migration (owner-approved 2026-09-30)** — no
> dependency, no permission, no native change, no EAS build.

**Planned 2026-09-30 (Opus plan session, owner-reviewed) — GitHub
Michaelafuller/TummyTracker#25.** Done-when (issue): "I can create, edit and
re-log a saved meal with an ingredient list." Owner decisions (2026-09-30):

1. **Two new tables** — `saved_meal` + `saved_meal_component` (mirrors
   `meal_component`), additive migration **0013**, backups **v7**. A
   template never is, or links to, a log entry.
2. **Created from meal review** ("Save as my meal"), **listed on Home** above
   Recent ("My meals"), **edited/deleted from that list**.
3. **Tapping a saved meal opens the prefilled review** (time = now) — exactly
   like tapping a Recent row. Editing a template never changes past meals.
4. **Opt-in backfill, per meal:** after saving a template that has
   ingredient tags, offer to add them to past meals with the same name that
   have none. Explicit choice only; additive tags only.

Plan-session judgments (flag them in your summary; owner may override):
- **Names are unique, case-insensitively** (`nameKey` = trimmed lowercase).
  "Save as my meal" with a name that exists asks **Replace** / Cancel.
- **Backfill target** = food entries (meal/snack) whose trimmed lowercase
  name equals the template's `nameKey` **and** whose own `tagsJson` parses
  empty. Their `tagsJson` becomes the template's tag union, and their
  `ingredientsText` is set from the template **only if it is null/empty**.
  Components of those past entries are never touched. Tags already present
  anywhere → the entry is not a target (never merged into).
- **Per-item edit on the review screen** (tap an item's name → the existing
  item form, prefilled; "Save item" replaces it). Needed to edit a template's
  ingredients; logging a meal gets it too.
- **Restore:** a backup's saved meal is skipped when its id **or** its
  `nameKey` already exists on the device (device wins, like check-ins).
- My meals sort **A–Z** (no usage tracking — there is no link to entries).

---

## 0. Invariants — read twice

- **No existing number changes on its own.** Saving, editing, deleting or
  re-logging a template never touches log entries. The **only** path that
  changes history is the backfill, and only after the user taps "Add" in
  its confirmation.
- **Copy, never link.** Re-log copies the template's items into the builder
  (like Recent); the saved meal row and the new entry share nothing.
- **Synchronous repository transactions** (CLAUDE.md §0): template
  create/replace/delete and the backfill each run in ONE `db.transaction`
  with only `.run()/.all()/.get()` inside; ids and timestamps computed first.
- Tags are derived exactly as today (`unionComponentTags`, the item form's
  `extractTags`); never invent a new parser.
- Every interactive element gets an `accessibilityLabel`; give rows a
  `testID` (Maestro will drive them).
- Stage by path; LF; no `@ts-ignore` / lint disables / bare `any`.

## 1. Schema + migration 0013 — `src/db/schema.ts`

```ts
export const savedMeal = sqliteTable('saved_meal', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Trimmed, lowercased name — unique; the backfill and Replace match on it. */
  nameKey: text('name_key').notNull().unique(),
  type: text('type', { enum: FOOD_TYPES }).notNull(),   // match how logEntry.type is declared
  mealSlot: text('meal_slot', { enum: MEAL_SLOTS }),    // nullable
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const savedMealComponent = sqliteTable(
  'saved_meal_component',
  {
    id: text('id').primaryKey(),
    savedMealId: text('saved_meal_id').notNull(),
    // ...every other column of meal_component, same names/types/defaults
    // (name, barcode, servings, servingG, the nutrition reals, ingredientsText,
    // tagsJson, sortOrder, createdAt)
  },
  (table) => [index('saved_meal_component_saved_meal_id_idx').on(table.savedMealId)],
);
```

Match how `logEntry`/`mealComponent` declare enums and defaults (read them
first). `npm run db:generate` → `0013_*.sql` + meta + `migrations.js`; paste
the SQL in your summary. It must be CREATE TABLE / CREATE INDEX only.
Migration harness test like the previous ones (`src/db/__tests__/`).

Commit: `feat(db): saved_meal tables + additive migration 0013`.

## 2. Pure helpers — `src/lib/savedMeals.ts`

- `savedMealNameKey(name: string): string` — trim + lowercase.
- `savedMealToDrafts(components: SavedMealComponent[]): MealComponentDraft[]`
  — sorted by `sortOrder`, dropping `id`/`savedMealId`/`createdAt`.
- `backfillTargets(entries: LogEntry[], nameKey: string): LogEntry[]` — the
  rule above (food types only; name match by `savedMealNameKey(entry.name)`;
  `parseTagsJson(entry.tagsJson).length === 0`).
- `validateSavedMealName(name)` → error string or null (required, ≤ the same
  max length the meal name uses, if any).

Unit tests for each (case/whitespace matching, snacks included, BMs/symptoms
excluded, an entry with any tag excluded, empty template tags → no targets
needed — the UI never offers).

## 3. Repository — `src/db/repository.ts`

- `listSavedMeals(): Promise<{ meal: SavedMeal; components: SavedMealComponent[] }[]>` — A–Z by name.
- `findSavedMealByNameKey(nameKey)`.
- `saveSavedMeal(input: { id?: string; name; type; mealSlot; components: MealComponentDraft[] }): Promise<SavedMeal>`
  — create when no `id`; with `id`, replace that template's fields and ALL
  its components (delete + insert) in one transaction. If another template
  already holds the `nameKey`, the caller must have asked to Replace: in that
  case pass `replaceId` (that template's id) and the function overwrites it
  instead (same transaction). Never two rows with one `nameKey`.
- `deleteSavedMeal(id)` — the meal and its components, one transaction.
- `backfillSavedMealTags(nameKey, tags: string[], ingredientsText: string | null): Promise<number>`
  — reads the targets (`backfillTargets` over the food entries), then in ONE
  transaction sets `tagsJson` (+ `ingredientsText` when the entry's is
  null/empty) and `updatedAt` on each; returns the count. Recomputes targets
  inside the call, never trusts a stale count from the UI.
- A live hook `useSavedMeals()` in the style of the existing live hooks
  (`useDayFactors` etc.).

Real-SQLite repository tests (`src/db/__tests__/`, see CLAUDE.md §0): create,
replace by id, replace by name clash, delete removes components, backfill
updates only targets and leaves tagged/other-name/non-food rows byte-identical,
backfill count, and an atomicity test like `repository.atomicity.test.ts`
(force a failure mid-transaction → nothing written).

## 4. Backup v7 — `src/lib/backup.ts` + export/import call sites

- `BackupFile.savedMeals?` and `savedMealComponents?` ("Absent before v7");
  `entriesToJson` gains both params (defaults `[]`), version 7.
- `parseBackupJson` normalises them like the other arrays; v1–v6 files
  import with none.
- Restore: skip a saved meal whose `id` or `nameKey` exists on the device
  (and skip its components); insert the rest with their components. Mirror
  the day-factor restore's batching.
- Tests: v7 round trip, v6 file imports with zero saved meals, a clash by
  name keeps the device's row and its components.

Commit: `feat(meals): saved-meal repository, live hook, backup v7`.

## 5. Screens

### 5a. Builder mode — `src/features/logging/mealBuilderStore.ts`

Add `editingSavedMealId: string | null` (default null). `load(...)` and
`clear()` reset it to null; a new `loadSavedMealForEdit(id, components,
prefill)` sets components + prefill + the id. Every existing caller keeps
today's behaviour.

### 5b. Review screen — `src/app/meal/review.tsx`

- **Logging mode** (`editingSavedMealId === null`, today's screen) gains a
  secondary **"Save as my meal"** button above "Save meal"
  (`accessibilityLabel="Save as my meal"`, `testID="review-save-as-my-meal"`),
  enabled when there's ≥ 1 item and the name validates. It saves the items
  (with their current servings), name, type and slot — **not** date/time or
  notes — and stays on the screen (a brief confirmation, e.g. the button
  label turns to "Saved to My meals"). Name clash → `Alert` "Replace
  '<name>' in My meals?" [Cancel] [Replace]. Then the backfill offer (5d).
- **Template mode** (`editingSavedMealId` set): title/heading "Edit my
  meal"; hide date/time, notes, the goal-cap notice; the primary button is
  **"Save changes"** (`testID="review-save-changes"`) → `saveSavedMeal({ id, … })`
  (rename into another template's name → the same Replace alert), then the
  backfill offer, then `clearBuilder()` + `router.back()`. A **"Delete my
  meal"** button (`testID="review-delete-my-meal"`, danger) with a confirm
  Alert → `deleteSavedMeal` → clear → back. The watched-ingredient notice
  stays (useful context).
- **Per-item edit (both modes):** each item row's name becomes a Pressable
  (`accessibilityLabel="Edit <name>"`, `testID="component-<i>-edit"`) →
  `router.push({ pathname: '/meal/component', params: { edit: String(i) } })`.
  Servings stepper and Remove unchanged.

### 5c. Item form — `src/app/meal/component.tsx`

With an `edit` param: `ComponentForm initial` = that draft (map draft →
form state the same way the existing saved-component edit screen does —
reuse its mapper, don't write a second one), `submitLabel="Save item"`, no
secondary; submit → `updateComponent(index, draft)` (keep its `sortOrder`)
→ `router.back()`. Without the param, today's behaviour exactly.

### 5d. Backfill offer (after any template save that has ≥ 1 tag)

Count `backfillTargets` (from the live entries); if > 0, `Alert`:
title "Add ingredients to past meals?", body "Add these ingredients to N
past '<name>' meals that don't have any? This updates your Insights."
[Not now] [Add]. Add → `backfillSavedMealTags` → a short confirmation.
No offer when the count is 0 or the template has no tags.

### 5e. Home — `src/app/(tabs)/index.tsx`

A **"My meals"** section above Recent, only when ≥ 1 saved meal: one row per
meal (A–Z) — the name (+ "N items"), the whole row a Pressable
(`accessibilityLabel="Log <name>"`, `testID="my-meal-<slug>"`) that behaves
like `handleRecentTap` (same in-flight guard; `load(savedMealToDrafts(...),
{ name, type, mealSlot })` → `/meal/review`, time defaults to now), and an
**"Edit"** link (`accessibilityLabel="Edit <name>"`, `testID="my-meal-<slug>-edit"`)
→ `loadSavedMealForEdit` → `/meal/review`. Keep it compact; if the list is
long it must not push Recent off-screen — cap the visible rows (e.g. 5) with
the rest reachable by scrolling inside the section, your call, say what you
chose.

Tests (component, `--runTestsByPath` for `(tabs)` paths): Home section
hidden with none / listed A–Z / tap loads the builder and navigates / Edit
loads template mode; review: Save as my meal (new, clash → Replace,
Cancel), template mode hides date/notes and Save changes / Delete work,
per-item edit replaces the item, backfill Alert appears only with targets
and only Add writes; component screen edit mode.

Commit: `feat(meals): My meals on Home, save/edit/delete from review, per-item edit, backfill offer`.

## 6. Definition of done

- `npm run typecheck`, `npm run lint` (0 warnings), `npm run bundle:check`.
- **Targeted Jest only (never the full suite):** files you created/touched,
  all `src/db/__tests__/*`, `src/lib/__tests__/{backup,savedMeals,mealAggregate}*`,
  `src/features/logging/__tests__/*`, `src/app/meal/__tests__/*`, Home
  (`npx jest --runTestsByPath "src/app/(tabs)/__tests__/index.test.tsx"`),
  settings (`--runTestsByPath` for `settings.test.tsx`) if export/import
  call sites changed there, plus `src/features/analysis/__tests__/*`
  (must pass unmodified — nothing there should change).
- No `@ts-ignore`, no lint disables, no `any` without `// reason:`, no deps,
  no schema change beyond §1. Don't run Maestro/EAS/`expo start`/adb; don't
  edit `flows/`, `CLAUDE.md`, `docs/`; don't push or merge.
- Commits (stage by path), each as soon as its tests pass:
  `feat(db): saved_meal tables + additive migration 0013` ·
  `feat(meals): saved-meal repository, live hook, backup v7` ·
  `feat(meals): My meals on Home, save/edit/delete from review, per-item edit, backfill offer`
  (split the last if it gets large — e.g. per-item edit first) — each ending
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- **Execute summary:** files per commit + hashes; the generated SQL
  verbatim; rung results; targeted Jest counts; a worked backfill example
  pasted from a test (entries before → targets → after); every existing test
  touched and why; deviations; review pointers (template mode vs logging
  mode leaks, the Replace path, the backfill target rule).
