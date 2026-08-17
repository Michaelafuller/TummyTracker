# HANDOFF.md — Test-backfill: flows for two releases + full regression run

> **Read first:** root `CLAUDE.md` (auto-loaded) + **`docs/E2E.md`** (the flow
> protocol: run commands, coverage table, troubleshooting). This is a
> **test-execute** handoff (step 4 of the loop in `docs/TEST_STRATEGY.md`).
>
> **Device:** the Pixel 5 over USB. Verify first: `adb devices` must list one
> `device` (not `unauthorized`). Everything under test is pure JS since the
> owner's last EAS preview build, so the installed dev client works —
> `adb reverse tcp:8081 tcp:8081`, then `npx expo start --dev-client` (run it
> in the background) and open the dev client on the phone. **Never run `eas`
> or install/uninstall the app** (signing mismatch wipes the on-device
> journal — CLAUDE.md §0).
>
> **Scope:** two releases have shipped since the last Maestro run
> (2026-07-03, 18/19): the 2026-08-15 five-cycle release and the 2026-08-16
> release (check-in persistence fix, dictation-safe inputs, theme pass,
> splash). ACCEPTANCE.md was restructured for both on 2026-08-16 — the new
> sections name every flow this handoff specs.

---

## Phase 1 — Verify existing flows against the changed UI (before authoring)

The theme pass extracted `PrimaryButton` (`src/components/primary-button.tsx`)
and recolored CTAs/chips, and `ThemedTextInput`
(`src/components/form-fields.tsx`) now remounts on programmatic value changes.
Flows assert text/testIDs, not colors, so breakage is unlikely — but verify,
don't assume:

- Grep every `tapOn:`/`assertVisible:` target string in `flows/*.yaml` and
  `flows/_helpers/*.yaml` against the current components' visible text and
  `accessibilityLabel`s. Fix any drift in the YAML.
- `docs/E2E.md`'s coverage table is stale (still shows ⏳ for flows the
  2026-07-03 run passed, and a "still stale" list that was fixed before that
  run) — refresh it as part of closeout.

## Phase 2 — Author the new flows

Read the target components for exact labels/testIDs before writing YAML
(E2E.md "Adding a flow" §). All flows start `launchApp` with
`clearState: true` unless noted. Add each to the E2E.md coverage table and
tick its ACCEPTANCE.md line only after a green device run.

1. **`flows/watchlist.yaml`** — Settings → add a watch term
   (`src/features/watchlist/WatchlistSection.tsx`); log a meal via the manual
   two-screen chain (`ComponentForm` → review) whose ingredients contain the
   term; assert the non-blocking flag text on review
   (`src/app/meal/review.tsx`), save succeeds, open the saved entry and
   assert the flag on the entry view (`src/app/entry/[id].tsx`); assert the
   clean-streak line in Settings.
2. **`flows/goals-tally.yaml`** — Goals tab (`src/app/(tabs)/goals.tsx`):
   assert the tab renders the tally; log a meal with calories; assert the
   tally updated and the missing-data disclosure line for a nutrient the
   entry lacked (`src/lib/dailyTally.ts` naming).
3. **`flows/goal-editor.yaml`** — Goals tab: set a floor goal
   (`src/features/goals/GoalsSection.tsx` — direction chips, threshold
   input, Save); assert progress renders; set a low cap goal, log a meal
   crossing it, assert the cap notice on review AND that the save landed in
   the journal; remove the goal, assert the row is gone.
4. **`flows/checkin-persistence.yaml`** — THE regression flow for the
   2026-08-16 bug fix. With a floor goal set, enable the check-in toggle
   (`src/features/goals/CheckInSection.tsx`; it requests notification
   permission — see E2E.md troubleshooting for `permissions` in
   `launchApp`). Then **relaunch WITHOUT `clearState`** (second `launchApp`
   block, `clearState` omitted/false — the whole point is persistence) and
   assert the toggle is still ON. Also: with zero floor goals, enable —
   assert the toggle holds and the "add a floor goal" hint shows.
5. **`flows/ab-satfat-ingredients.yaml` (extend)** — add the additive-tag
   step from ACCEPTANCE ("edit ingredients to remove a word, reopen, tags
   unchanged") only if tag visibility makes it assertable on-device;
   otherwise leave it Jest-covered and note that in the coverage table.

## Phase 3 — Run

1. Targeted first (fast feedback, per-flow `npm run e2e:flow …`): the five
   new/extended flows above, plus the owed re-runs —
   `e-temporal-insights` (below-fold fix applied 2026-07-03, re-run
   pending; if green the suite is 19/19, flip its ACCEPTANCE line; if still
   red, the fallback is specced in RESULTS.md — an app-side testID, which
   belongs to the next plan session, not this one),
   `ab-satfat-ingredients`, `01b-manual-entry`.
2. Then the **full suite** (mandated — the theme pass touched shared infra):
   `maestro test flows/ --format junit --output flows/results.xml`
   (this is `npm run e2e:ci`; the plain `e2e` script does NOT write
   results.xml — RESULTS.md 2026-07-03 learned this the hard way).

## Phase 4 — Closeout (per E2E.md protocol)

- Read `flows/results.xml`; flip `[ ]` → `[x]` in ACCEPTANCE.md for passing
  flows (both new sections and any older pending lines they cover, e.g.
  Phase 1b/1c "pending device run" notes); failure notes for reds.
- Overwrite `docs/RESULTS.md` with this run's report (template:
  TEST_STRATEGY §4): per-flow table, root-cause classes for any red
  (app-bug / flow-bug / env), what stays manual, findings for the next plan
  session.
- Refresh the E2E.md coverage table (Phase 1 above).
- Commit flow changes + doc updates separately, scoped
  (`test(e2e): …` / `docs(results): …`), rungs green (YAML changes don't
  touch them, but run anyway before claiming done).

**Manual items that stay on the owner's desk** (do NOT attempt): dictation
(iOS + Android voice typing), light/dark visual walkthrough, live check-in
timing test, splash/notification/icon checks after the next EAS build,
network-dependent OFF search checks, migration spot-checks on the real DB.
