# RESULTS.md — Maestro run 2026-08-16 (test-backfill: two releases + regression) — BLOCKED

## Summary

- **Flows run: 0 of the mandated suite reached a trustworthy pass/fail.** Phase 1
  (verify existing flows) and Phase 2 (author new flows) are complete. Phase 3
  (device runs) is **blocked by environment**, not by app or flow defects — see
  Root cause #1. No `flows/results.xml` was produced; running `maestro test
  flows/ --format junit` against this device right now would write a file full of
  misleading reds (and false greens) that do not reflect `main`.
- **Scope:** was going to be full regression (mandated — the 2026-08-16 theme pass
  touches shared infra). Never reached that stage.
- **Rungs: green.** `npm run typecheck` ✅ `npm run lint` ✅ (full `npm test` not
  re-run this session — no `lib`/`app` code changed, only `flows/*.yaml`).
  `bundle:check` not run (no EAS build pending from this session).
- **Device + build:** Pixel 5 (`0A131FDD4006VE`), package `com.tummytracker.app`,
  **installed build is an EAS `preview` APK from 2026-08-15 19:36** (`dumpsys
  package` `lastUpdateTime`), i.e. it predates this cycle's four fixes (check-in
  persistence, dictation-safe inputs, light-theme pass, splash/notification
  colors) by one full release. See Root cause #1 for why this matters and cannot
  be worked around from this session.

## Root causes (the point of this file)

1. **The installed APK cannot load JS from Metro — it is a `preview` build, not a
   `development` build → class `expected-manual` (environment, owner action
   required), not `flow-bug` or `app-regression`.**

   `docs/HANDOFF.md` and `docs/E2E.md` both describe the installed app as "the
   dev client" and instruct `adb reverse tcp:8081 tcp:8081` + `npx expo start
   --dev-client` to serve fresh JS to it. That workflow requires the installed
   APK to have been built with `developmentClient: true`. **`eas.json` only sets
   that flag on the `"development"` profile — the `"preview"` profile (the one
   HANDOFF.md itself says produced the currently-installed build, "the owner's
   last EAS preview build") does not.** A `preview` build is release-configured:
   it bundles its own JS at build time and runs fully offline by design (this is
   even documented in `ACCEPTANCE.md`'s own build section: `eas build --profile
   preview` → "standalone APK, runs offline"). It has no dev-support wiring to
   ever contact a packager, regardless of `adb reverse`, deep links, or anything
   else done from the host side.

   **Verified, not assumed** (three independent confirmations, so this isn't a
   flow bug in disguise):
   - `adb shell dumpsys package com.tummytracker.app` — the app's flags list
     (`HAS_CODE ALLOW_CLEAR_USER_DATA ALLOW_BACKUP`) has no `DEBUGGABLE` flag,
     and `adb shell run-as com.tummytracker.app` returns `run-as: package not
     debuggable` — both are definitive markers of a release-style build.
   - Metro's own log (`npx expo start --dev-client`, running the whole session)
     never printed a single bundle-request line, across dozens of `launchApp`
     cycles, a deep link to `exp+tummytracker://expo-development-client/?url=…`,
     and a cold force-stop + relaunch via that same deep link. A dev client
     that's actually talking to Metro logs a bundling line per launch; none
     appeared.
   - **Direct behavioral proof:** the Goals-tab check-in toggle — this cycle's
     headline fix (`061b2bf fix(goals): persist check-in enabled state and
     schedule a 7-day horizon`) — could not be turned on with zero floor goals
     set, even via a **raw `adb shell input tap` at the Switch's exact
     `uiautomator`-reported center coordinate** (ruling out any Maestro selector
     issue). That's precisely the pre-fix symptom the commit describes.
   - `eas.json`'s `"preview"` profile has no `developmentClient` key at all,
     confirming the profile-level root cause.

   **What I did NOT do about it:** rebuild, reinstall, or run any `eas`/`expo
   run:android` command — CLAUDE.md §0 forbids this session from invoking EAS or
   assuming a device, and a signature-mismatched reinstall risks wiping the
   on-device journal. This is squarely an owner action.

   **What the owner needs to do** (either unblocks the next test-execute
   session):
   - Build and install an EAS `"development"` profile APK (has
     `developmentClient: true`) over the current one — same signing key, so this
     should be a safe in-place update, but back up via Settings → Export data
     first per CLAUDE.md's signing caveat, just in case. Then `adb reverse
     tcp:8081 tcp:8081` + `npx expo start --dev-client` will actually work.
     *or*
   - Cut a fresh `"preview"` build with 2026-08-16 HEAD baked in (this is the
     cadence CLAUDE.md already describes for JS-only cycles when quota allows) —
     no Metro dependency needed, but every cycle after this one needs a new
     preview build, which is slower than the dev-client loop.

2. **Two classes of Maestro flow-authoring bug found and fixed while diagnosing
   #1 — real, `flow-bug`, already corrected in the YAML** (found via
   `uiautomator dump` + isolated repro flows, confirmed against the *old*
   preview bundle, and expected to hold against any bundle since they're about
   static UI structure that hasn't changed since 2026-08-15):

   - **Nutrition-grid fields are un-tappable right after `scrollUntilVisible`
     targets their own label.** Every field built from `NUTRITION_LABELS`
     (Calories, Fat (g), Sat. fat (g), Carbs (g), Protein (g), Fiber (g), Sugar
     (g), Sodium (mg)) renders via `FormField label={NUTRITION_LABELS[field]}`
     wrapping a `ThemedTextInput accessibilityLabel={NUTRITION_LABELS[field]}`
     — **the exact same string** is both the field's own label text and its
     accessibility label. `scrollUntilVisible` for that string is satisfied the
     moment the *short label* pokes onto screen — the *input box* below it can
     still be entirely off-screen (confirmed via `uiautomator dump`: the
     EditText node for `content-desc="Protein (g)"` was simply absent from the
     hierarchy at that scroll position). The follow-up `tapOn` then hits
     nothing useful — no crash, no error, just a silently-dropped tap, and
     whatever field was previously focused keeps eating subsequent
     `inputText` calls. **Fix:** scroll to a landmark *below* the target row
     (the next row's label, or the action button) before tapping, giving the
     field margin. Applied in `f-serving-size.yaml`, `ab-satfat-ingredients.yaml`,
     `goals-tally.yaml`, `goal-editor.yaml`.
   - **Missing `hideKeyboard` before a same-screen "Add"/"Save" button silently
     no-ops the tap.** `watchlist.yaml`'s and `ab-satfat-ingredients.yaml`'s
     "Add to watchlist" flow typed a term then tapped "Add" with the keyboard
     still open; the tap landed nowhere useful and the item was never added —
     masked by a false-positive `assertVisible` that matched the term text
     still sitting, unsent, in the input box. Fixed by adding `hideKeyboard`
     before the button tap, and tightening the follow-up assertion so it can
     only match the *added item card*, not the leftover input text.
   - **Expand-then-tap goal-editor rows need a settle point.** Tapping a Goals
     row to expand its inline editor, then immediately tapping a direction chip
     inside it, occasionally re-collapsed the row instead (the chip's
     coordinate resolved before the expand relayout finished). Added
     `waitForAnimationToEnd` + a `scrollUntilVisible` on the editor's Save
     button between the expand tap and the chip tap.

   These fixes were validated by construction (isolated repro flows narrowing
   each bug to one root cause, `uiautomator dump` inspection of the actual view
   hierarchy) and by two full end-to-end flow runs against the old bundle
   (`goal-editor.yaml`, `01d-browse-edit.yaml` via the rewritten
   `seed-two-meals.yaml` helper) that only exercise 2026-08-15-and-earlier
   features — both passed clean after the fixes. They should hold once a real
   dev client is available, since none of them depend on 2026-08-16 JS.

## What stays manual / blocked

Everything in the mandated Phase 3 run is blocked pending a real dev client.
Once unblocked, re-run in this order (per the original `docs/HANDOFF.md`):
targeted (`checkin-persistence`, `watchlist`, `goals-tally`, `goal-editor`,
`ab-satfat-ingredients`, `e-temporal-insights`, `01b-manual-entry`), then the
full suite with `npm run e2e:ci`.

## Findings for the next planning session

- **Ship the environment fix first.** No amount of flow authoring closes this
  gap — the next test-execute session needs a `development`-profile dev client
  installed before it opens `docs/HANDOFF.md`.
- **`docs/HANDOFF.md` phase-2.1 said "Settings → add a watch term" — that's
  wrong.** `WatchlistSection` renders on the **Insights** tab
  (`src/app/(tabs)/insights.tsx:156`), not Settings. `flows/watchlist.yaml` and
  the extension in `flows/ab-satfat-ingredients.yaml` target Insights
  correctly; flag this drift so future HANDOFFs describing this feature say
  Insights.
- **Consider a `testID` on the Switch-based toggles** (check-in, offline mode)
  if a future cycle needs their checked-state asserted reliably — the
  `accessibilityLabel`-collides-with-a-plain-heading-Text pattern
  (`"Daily check-in"` on both the section heading and the Switch) makes the
  `checked:` selector combinator unreliable for disambiguation in this specific
  case (confirmed: neither `index:` nor `checked:` reliably isolated the Switch
  in manual `uiautomator`-coordinate testing). This is a nice-to-have, not a
  blocker — `checkin-persistence.yaml` is authored against source and should be
  re-verified once a dev client works, and adjusted then if the ambiguity is
  still an issue on fresh JS.
- **`docs/E2E.md`'s "still stale" list is now resolved** (Phase 1 of this
  session): `ab-satfat-ingredients.yaml`, `f-serving-size.yaml`,
  `g-datetime-picker.yaml`, and the three seed helpers
  (`seed-two-meals.yaml`, `seed-meals-for-insights.yaml`,
  `seed-ingredient-reactions.yaml`) are all rewritten for the two-screen
  ComponentForm → review chain. See E2E.md's refreshed coverage table.

## ACCEPTANCE.md changes made

**None.** No flow reached a trustworthy device pass/fail this session, so no
`[ ]` → `[x]` flips were made anywhere, including for the flows that happened
to pass against the stale bundle (`goal-editor.yaml`,
`ab-satfat-ingredients.yaml`'s persistence half, `01d-browse-edit.yaml`) —
those results reflect 2026-08-15 JS, not the `main` HEAD this handoff specced,
so they don't meet the "Verified" bar (`docs/TEST_STRATEGY.md` §5:
"Authored ≠ verified... only a test-execute session with the device attached
flips ⏳ Authored → ✅ Verified, and only from a green `results.xml`
testcase" — a stale-bundle green doesn't qualify).

---

_Prior run history (2026-07-03 full regression, 18/19) is preserved in git; it
was trimmed from this file when this session's (blocked) run superseded it as
the current result. The 2026-07-03 numbers remain the last trustworthy full
baseline until the environment is fixed and a new full run completes._
