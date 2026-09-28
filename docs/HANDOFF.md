# HANDOFF.md — Execute session: Quick-win polish bundle, GitHub #16

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§4 rungs, §8
> conventions, §9 guardrails). Six small, independent items — one commit
> each. Touches `src/features/medications/MedicationEntryForm.tsx`,
> `src/app/meal/review.tsx` + `src/features/logging/mealReviewFormModel.ts`,
> `src/app/scan.tsx`, `src/components/date-time-field.tsx` +
> `src/components/time-field.tsx`, the Collapsible test mock, deletes
> `src/app/entry/new.tsx` + `src/features/logging/prefillStore.ts`, and
> `scripts/generate-icons.mjs`. Plus tests.
>
> **Pure JS/TS** — no new dependency, no schema change, no new permission,
> no native change, no EAS build. (`@react-native-community/datetimepicker`
> 9.1.0 is already installed and its package hasn't changed since the current
> dev client was built; `onValueChange`/`onDismiss` are JS-level props of it.)

**Planned 2026-09-27 (Opus plan session) — GitHub
Michaelafuller/TummyTracker#16.** Owner decisions (2026-09-27): **retire**
`entry/new` + `prefillStore`; the "restore app-icon SVG sources" item is
**re-scoped** — the current icons are the owner's own raster exports
(`65e7014`, `4b14f21`, `c0b26b5`), there is no vector source to restore, so
tidy the generator script instead (§6). The stale-meal-name rule was
owner-approved in the 2026-09-26 review.

---

## 0. Invariants — read twice

- **Never overwrite a name the user typed.** The meal name only follows the
  items while it still equals the auto-generated default.
- **The medication dose/unit snapshot rules are unchanged** (Cycle B): the
  form still pre-fills each line from the medication's default and never
  writes back to the medication. Only the *presentation* of the unit changes.
- **No behavior change from the date/time picker migration** — same values
  emitted, same dismiss/cancel handling, on both platforms.
- **Don't touch the app-icon PNGs** (`assets/images/icon.png`,
  `android-icon-*.png`, `splash-icon.png`, `notification-icon.png`). Running
  `generate-icons.mjs` must leave them byte-identical.
- Stage files by path — never `git add -A` / `git add .`.

## 1. Medication entry: unit as text + "Change unit"

`src/features/medications/MedicationEntryForm.tsx`, per selected line:

- **Collapsed (default when the line has a unit):** next to/under the Dose
  field, the unit as plain text (e.g. "mg"), plus a link-styled
  `Pressable` **"Change unit"** (`accessibilityRole="button"`,
  `accessibilityLabel="Change unit for <name>"`,
  `testID="change-unit-<medicationId>"`).
- **Expanded:** today's `SegmentedControl` of unit chips (+ "Other" and its
  free-text field, unchanged). Expanded when the user tapped "Change unit",
  **or** when the line's unit is empty (a medication with no default unit
  must still be completable), **or** while the line is in "Other" mode.
- Picking a fixed-unit chip collapses the line again (showing the new unit
  as text). Track expanded lines in a `Set<string>` of medication ids, like
  the existing `otherUnitIds`.
- Validation is unchanged (a selected line still needs a unit).

## 2. Meal review: keep the auto-generated name in sync

- Pure helper in `src/features/logging/mealReviewFormModel.ts`:
  ```ts
  /** The next name after the items change: follows the items only while the
   *  current name still equals the auto-default for the PREVIOUS items
   *  (trimmed comparison); anything the user typed is kept as-is. */
  export function syncAutoMealName(
    currentName: string,
    previous: readonly Pick<MealComponentDraft, 'name'>[],
    next: readonly Pick<MealComponentDraft, 'name'>[],
  ): string
  ```
  Empty current name counts as "auto" only when the previous default was
  also empty (a fresh builder); a user who cleared the field on purpose with
  items present keeps it empty.
- `src/app/meal/review.tsx`: the screen stays mounted across "Add item"
  (`meal/component.tsx` returns with `router.dismissTo('/meal/review')`), so
  keep the previous components in a `useRef` and, in an effect on
  `components`, `setState(prev => ({ ...prev, name: syncAutoMealName(prev.name,
  prevRef.current, components) }))`, then update the ref. Servings changes
  don't alter names, so the helper is naturally a no-op for them.
- Applies to re-logged meals too: a re-log whose saved name equals the
  default for its loaded items ("Rice + 1 more") follows edits ("Rice" after
  removing Beans); a re-log of a custom-named meal ("Sunday breakfast")
  never changes.

## 3. "Add item" without the camera

`src/app/scan.tsx`: the permission-not-granted state (`!permission.granted`)
gains a secondary button **"Enter manually"** under "Grant access" — same
`accessibilityLabel="Enter product manually"` and the same
`router.replace('/meal/component')` as the camera screen's escape hatch, so
both Home's scan path and meal review's "Add item" have a manual route
without granting the camera. Style it like a secondary button (border,
`backgroundElement`), not the primary fill.

## 4. Date/time picker: replace the deprecated `onChange`

`src/components/date-time-field.tsx` and `src/components/time-field.tsx` use
`DateTimePicker`'s deprecated `onChange(event, date)`. Read the installed
types (`node_modules/@react-native-community/datetimepicker/src/index.d.ts`)
and the Android/iOS picker sources, then move to `onValueChange(event, date)`
for a chosen value and `onDismiss()` for cancel/dismiss, preserving today's
behavior exactly (Android dialog closes after a pick or a cancel; iOS inline
behavior unchanged; whatever the current code does with `event.type ===
'dismissed'` / `'set'` maps 1:1). If `onValueChange`/`onDismiss` don't cover
a path the current code relies on, **stop and report** rather than keeping
`onChange` alongside.

## 5. Retire `entry/new` + `prefillStore`; shared Collapsible mock

- Delete `src/app/entry/new.tsx`, `src/features/logging/prefillStore.ts`,
  their tests if any, and the `entry/new` `Stack.Screen` in
  `src/app/_layout.tsx`. Grep first — **nothing else may reference them**
  (`componentPrefillStore` is a different, live module — keep it). Don't go
  hunting for further dead code.
- Move the `Collapsible` stand-in from `src/app/(tabs)/__tests__/meds.test.tsx`
  into a shared manual mock `src/components/ui/__mocks__/collapsible.tsx`
  (same behavior and explanatory comment), and have `meds.test.tsx` use it via
  a bare `jest.mock('@/components/ui/collapsible')`. Check that Jest resolves
  the manual mock through the `@/` alias; if it doesn't, put the stand-in in a
  shared test helper module and import it from the factory instead.

## 6. Icon generator: stop pretending to own the app icons

`scripts/generate-icons.mjs`: delete the `rasterize` calls whose sources were
removed (`icon.svg`, `icon-monochrome.svg` → `icon.png`,
`android-icon-foreground/monochrome.png`, `splash-icon.png`,
`notification-icon.png`) **and** the `_bg.svg` → `android-icon-background.png`
step (it would overwrite the owner's exported background). Replace them with
a short header comment: app/adaptive/splash/notification PNGs are hand-exported
by the owner (commits above) and are not generated here; this script only
produces tab icons. Delete `assets/icons/_bg.svg` only if nothing else uses
it. Then run `node scripts/generate-icons.mjs` and confirm `git status` shows
**no** changed PNGs (tab icons regenerate identically; if any tab PNG changes
anyway, `git checkout` it and mention it).

## 7. Tests (same change, CLAUDE.md §4)

- `mealReviewFormModel` tests for `syncAutoMealName`: auto name follows add /
  remove; typed name kept; whitespace-only difference still "auto"; cleared
  field with items stays empty; fresh builder (empty → first item) fills in.
- `review.test.tsx`: removing an item updates an auto name; a typed name
  survives removing an item; re-log prefill with a custom name never changes.
- `MedicationEntryForm` / medication entry screen tests: unit shown as text
  with "Change unit"; tapping it shows chips; picking a chip collapses and
  saves that unit; a medication with no default unit shows chips straight
  away; "Other" still works; saved payload unchanged otherwise.
- `scan` test: permission denied shows "Enter manually" → `router.replace('/meal/component')`.
- Date/time field tests: value change and dismiss paths via the new props
  (update the existing tests' event simulation accordingly).
- `meds.test.tsx` green with the shared mock.

## 8. Definition of done

- `npm run typecheck` && `npm run lint` clean; `npm run bundle:check` clean
  (route removed).
- **Targeted Jest only (owner instruction — never the full suite):** every
  test file you created, touched or whose subject you changed — including
  `review`, `component`, `scan`, the medication entry screens,
  `MedicationEntryForm`, `date-time-field`, `time-field` and every screen test
  that renders `DateTimeField`/`TimeField` (grep), `meds`, `settings`,
  `goals`, `_layout`. Paths under `(tabs)` or with `[id]` via
  `npx jest --runTestsByPath "<path>"`.
- Typed routes: `.expo/types/router.d.ts` (gitignored) only regenerates under
  `npx expo start`, which you may not run. If removing `entry/new` leaves it
  stale in a way that breaks `tsc`, edit that local file by hand to match and
  say so; never commit it.
- No `@ts-ignore`, no lint disables, no `any` without `// reason:`, no new
  deps, no schema change.
- Do NOT run Maestro, EAS, or `npx expo start` (Metro runs on 8081 — leave
  it). Do NOT edit `flows/`, `CLAUDE.md` or `docs/`. Keep LF line endings.
- Commits (stage by path), one per item:
  `feat(meds): show the dose unit as text with a Change unit option` ·
  `feat(meal): keep an auto-generated meal name in sync with its items` ·
  `feat(scan): offer manual entry without camera permission` ·
  `refactor(pickers): move off the deprecated DateTimePicker onChange` ·
  `chore: retire entry/new + prefillStore; share the Collapsible test mock` ·
  `chore(icons): generator only owns tab icons` —
  each ending `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
  Do NOT push.
- Execute summary: files per commit, hashes, rung + bundle:check results,
  targeted Jest counts, how the picker events mapped (old → new, per
  platform), deviations with reasons, review/device-test pointers.

## 9. After this (review + test session)

- Opus review; update `flows/q-reuse-adjust.yaml` (name now follows the
  items after Remove) and `flows/s-medication-entry.yaml` (unit chips now
  behind "Change unit"); grep `flows/` for other unit-chip or "Add entry"
  dependencies.
- Device: date/time pickers on every screen that has them (entry edit, meal
  review, BM, symptom, medication entry, Settings/Goals time chips) —
  pick, cancel, pick again; the camera-denied manual path.
