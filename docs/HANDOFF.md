# HANDOFF.md — Execute session: Home fits 5 Recent rows · meal-component delete (swipe + button)

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§4 rungs, §8
> conventions, §9 guardrails). Part A touches `src/app/(tabs)/index.tsx` (+
> `flows/00-launch.yaml` labels). Part B touches `src/app/_layout.tsx`,
> `src/app/entry/[id].tsx`, `src/app/entry/component/[componentId].tsx`,
> `src/features/logging/ComponentForm.tsx`, `src/db/repository.ts`,
> `jest.config.js`, and tests. **No new dependency** — `react-native-gesture-handler`
> (~2.31) and `react-native-reanimated` (4.3) are already direct deps and are in
> the installed dev build. **`expo-haptics` is NOT installed and must NOT be
> added this cycle** (a native module absent from the dev build crashes the
> Metro-loaded client); haptics are scheduled for the next native-build cycle.
> A Metro server on port 8081 serves this worktree to the owner's Pixel — do
> not start/stop it or run Maestro; the review pass verifies on device.

**Planned 2026-08-21 (Fable plan session), owner-requested.** Two independent
parts — commit separately (A, then B in 2–3 commits).

---

## Part A — Home: fit ≥4 Recent rows, target 5 (Pixel 5)

### A.0 Measured budget (uiautomator, real px at 2.75 px/dp, post-`63a7336`)

Rows `ScrollView` = **385px**; a row is 107px + 22px gap → 3 rows. Need **494px
for 4**, **623px for 5**. Hero = title 158 + gap 44 + 2-line subtitle 122;
buttons 161px each with 44px gaps; section gap 66.

### A.1 Changes (`src/app/(tabs)/index.tsx`) — all four, they add up to ≈ +376px

1. **"Log bowel movement" + "Log symptom" side by side** in one row
   (`flexDirection: 'row', gap: Spacing.three`, each `flex: 1`). Visible
   labels shorten so they don't wrap at half width: `💩 Bowel movement` and
   `🤢 Symptom`. **Keep the `accessibilityLabel`s exactly** `"Log a bowel
   movement"` / `"Log a symptom"` — three Maestro flows tap by those. Keep
   `StyleSheet.flatten` on `<Link asChild>` children (dev-mode array-style
   crash, see the existing comment). (+205px)
2. **Subtitle to one line**: `Log what you eat and spot the patterns.` (39
   chars fits one line at `small`; the current 68-char line wraps to two).
   Keep `textAlign: 'center'`. (+61px)
3. **Buttons slightly shorter**: `paddingVertical` `Spacing.three` →
   `Spacing.two + Spacing.one` (12dp) on both `cta` and `secondaryCta`. (+66px)
4. **Section gap**: `content.gap` `Spacing.four` → `Spacing.three` (16dp).
   (+44px)

Don't touch `RecentFoodPicker`, the frozen layout, `limit={50}`, or the
bottom inset (fixed in `63a7336`).

### A.2 Flow label follow-through (mechanical)

`flows/00-launch.yaml:11-12` assert the full visible button texts
(`"💩 Log bowel movement"`, `"🤢 Log symptom"`, full-regex match) — update those
two lines to the new visible labels. Nothing else in `flows/` references the
visible text (the other flows use the accessibility labels, unchanged).

### A.3 Test

Existing `RecentFoodPicker.test.tsx` is untouched. Add no Home test unless one
exists (there is none).

## Part B — Meal-component delete (swipe on the list + Delete button on the edit screen)

### B.0 Context (verified)

- `src/app/entry/[id].tsx` lists a grouped meal's components (gate
  `componentCount > 1`) as `Pressable` rows → `/entry/component/<id>`; it
  re-fetches on focus (`useFocusEffect`) and remounts its form on
  `entry.updatedAt`.
- `src/app/entry/component/[componentId].tsx` renders `ComponentForm`
  (`submitLabel="Save changes"`) and calls `updateMealComponentAndReaggregate`.
- `ComponentForm`'s actions block (~line 250) renders an optional secondary
  `Pressable` + `PrimaryButton`. `reaggregateEntryPatch` (pure,
  `src/lib/mealAggregate.ts`) is the re-aggregation contract: nutrition
  recomputed fresh, tags merged additively.
- `react-native-reanimated` is already used (`animated-icon.tsx`,
  `collapsible.tsx`) and its tests pass under `jest-expo`; RNGH is not yet
  used anywhere and `expo-router` does **not** wrap the root in
  `GestureHandlerRootView` (only its stack's own gesture view).
- `jest.config.js` has no `setupFiles`; `react-native-gesture-handler/jestSetup.js`
  exists.

### B.1 Repository — `deleteMealComponentAndReaggregate(componentId): Promise<'deleted' | 'last' | 'missing'>`

One transaction: read the component (→ `'missing'` if absent); read its
siblings; if it is the **only** component of the entry return `'last'` and
change nothing (a meal must keep ≥1 component — the user deletes the whole
entry instead); otherwise delete the row, re-read the remaining components,
apply `reaggregateEntryPatch(remaining, entry.tagsJson)` to the parent
(nutrition fresh; tags stay additive — a deleted component's tags remain on
the entry by the project's additive-only policy, document this in the
docstring), set `componentCount = remaining.length`, bump `updatedAt`, return
`'deleted'`. Entry `name`/`ingredientsText` untouched (user-owned). Note in
the docstring: when `remaining.length === 1` the entry screen's `> 1` gate
hides the list — the entry then behaves as a single-item entry editable at
entry level (deliberate; the single-component wrinkle is a known follow-up).

### B.2 Root wrapper — `src/app/_layout.tsx`

Wrap the rendered tree in `<GestureHandlerRootView style={{ flex: 1 }}>`
(outermost, around `ThemeProvider`). Required for RNGH gestures anywhere.

### B.3 Swipe-to-delete on the entry screen — `src/app/entry/[id].tsx`

- Wrap each component row in `ReanimatedSwipeable` (import from
  `react-native-gesture-handler/ReanimatedSwipeable`), `renderRightActions`
  → a danger-colored action (`Pressable`, `accessibilityRole="button"`,
  `accessibilityLabel={`Delete ${component.name}`}`,
  `testID={`component-delete-${component.id}`}`, label "Delete", background
  `theme.danger`, full row height, ~88dp wide, `overshootRight={false}`,
  `friction={2}`). The row itself stays a `Pressable` that navigates.
- On press: `Alert.alert('Remove from this meal?', `${name} will be removed
  and the meal's totals recalculated.`, [Cancel, Remove(destructive)])`. On
  confirm: `await deleteMealComponentAndReaggregate(id)`; if `'last'` →
  `Alert.alert('Keep at least one item', 'A meal needs one item — delete the
  whole entry instead.')`; on `'deleted'` → re-run the same loader the focus
  effect uses (extract `loadEntry()` into a `useCallback` used by both the
  focus effect and the post-delete refresh) so the row disappears and the
  re-aggregated totals show (the `updatedAt` key remount already handles the
  form).
- Theme: `theme.danger` exists (used for the watch banner).

### B.4 Delete button on the component edit screen

- `ComponentForm` gains `onDelete?: () => void | Promise<void>` and
  `deleteLabel?: string` (default `'Delete'`). When `onDelete` is provided,
  the actions block renders a **row** `[Delete] [Save changes]` with
  `justifyContent: 'space-between'`, both buttons `flex: 1`, `gap:
  Spacing.three`: Delete is an outline button with `borderColor:
  theme.danger` and danger-colored label, `accessibilityRole="button"`,
  `accessibilityLabel={deleteLabel}`, `testID="component-delete"`; Save stays
  the `PrimaryButton`. Without `onDelete` the block renders exactly as today
  (the builder's "Add & scan next" / "Finish meal" path must not change).
- `src/app/entry/component/[componentId].tsx`: pass `onDelete` → same
  confirm `Alert` → `deleteMealComponentAndReaggregate(component.id)` →
  `'deleted'` → `router.back()`; `'last'` → the keep-one alert. Guard with the
  existing `submitting` state.

### B.5 Tests

- `jest.config.js`: add `setupFiles: ['./node_modules/react-native-gesture-handler/jestSetup.js']`
  (keep the existing preset/mappers). If `ReanimatedSwipeable` still fails to
  render under Jest after that, mock `react-native-gesture-handler/ReanimatedSwipeable`
  **in the affected test file** with a component that renders `children` and
  `renderRightActions()` side by side — never disable a rule or skip a test.
- `[id].test.tsx`: pressing `component-delete-<id>` → `Alert.alert` (mock
  `Alert.alert` to invoke the destructive button) → repository called with
  the id → entry + components re-fetched. A `'last'` result shows the keep-one
  alert and does not refetch.
- `[componentId].test.tsx`: Delete button present only on the edit screen,
  confirm → repository → `router.back()`; `'last'` → alert, no back.
- `ComponentForm.test.tsx`: no Delete button without `onDelete`; with it,
  both buttons render and Delete calls the handler.
- A pure test is owed if you add any pure helper; `reaggregateEntryPatch` is
  already covered.

### B.6 Not this cycle (owner-approved dependency, needs a native build)

`expo-haptics` — `Haptics.impactAsync(ImpactFeedbackStyle.Medium)` when the
swipe action reveals / on delete, `notificationAsync(Success)` on save. Add it
in the next native-build cycle (together with the pending iOS build), then
wire it here. Do not import it now.

## 2. Definition of done

- `npm run typecheck` && `npm run lint` && `npm test` green — run them.
- No `// @ts-ignore`, no lint disables, **no new dependency**.
- Commits (imperative, scoped): `feat(home): fit five Recent rows — side-by-side
  log buttons, one-line tagline, tighter spacing` · `feat(logging): delete a
  saved meal component with re-aggregation (repository + root gesture view)` ·
  `feat(logging): swipe-to-delete on the entry screen + Delete next to Save on
  the component editor`.
- Execute summary: per-commit contents, file list, rung counts, any Jest
  mocking needed for the swipeable, deviations.

## 3. After this (review pass + test sessions)

Fable re-measures Home on the Pixel (target: rows `ScrollView` ≥ 623px) and
exercises a swipe-delete on a seeded 2-component meal. Test session: extend
`flows/01d-browse-edit.yaml` or the planned `j-component-drilldown.yaml` with
`swipe` on `component-row-<id>` → tap `"Delete <name>"` → confirm → row gone
and totals updated; plus the component-screen Delete path; `00-launch.yaml`
labels re-verified.
