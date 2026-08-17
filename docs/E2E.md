# E2E.md — Maestro acceptance test protocol

The three rungs (`typecheck`, `lint`, `test`) verify code correctness but never
run the app. Maestro drives a real Android build against the app's actual
accessibility tree — it is the automated layer of ACCEPTANCE.md.

---

## Prerequisites (one-time setup)

```bash
# 1. Install the Maestro CLI (standalone binary, not npm)
curl -Ls "https://get.maestro.mobile.dev" | bash
# Restart your shell after install, then confirm:
maestro --version

# 2. Enable USB Debugging on the Pixel 5
#    Settings → About phone → tap Build number 7× → Developer options → USB Debugging ON

# 3. Connect the Pixel 5 via USB and confirm adb sees it
adb devices
# Expected: one device listed as "device" (not "unauthorized")

# 4. Build and install the dev client (once, or after a native dependency change)
npx expo run:android
# This compiles a debug APK and installs it on the connected device.
# After the first install you can use "Start" + JS bundle reload for most changes.
```

> **No emulator required.** Maestro targets whatever `adb devices` lists —
> your Pixel 5 over USB works exactly the same as an emulator.

---

## Running the tests

```bash
# Run all flows (Session 3 standard command)
npm run e2e

# Run one flow (during development / debugging)
npm run e2e:flow flows/01b-manual-entry.yaml

# Run with JUnit XML output for machine-readable results
maestro test flows/ --format junit --output flows/results.xml
```

> **App state:** every flow that matters calls `launchApp: clearState: true`
> at the top, so flows are independent and can run in any order.

---

## Coverage

> **2026-08-16 test-execute run (resumed session):** the dev-client blocker
> from the prior session is fixed (real `development`-profile build installed,
> Metro serves fine), but the first real dev-mode run immediately hit a fatal
> app-bug that blanks the entire app on launch (expo-router `Slot` throws on
> array-style props passed to `asChild` children — 5 call sites in
> `src/app/(tabs)/index.tsx` and `src/features/logging/EntryRow.tsx`; see
> `docs/RESULTS.md`). **All 23/23 flows failed for this one root cause** — the
> statuses below are NOT re-verified this run; ✅/⏳ marks reflect the
> 2026-07-03 baseline and earlier authoring sessions, not this run. Nothing
> below should be trusted as currently passing until the app-bug is fixed and
> a clean full run completes.

| ACCEPTANCE.md item | Flow file | Status |
|---|---|---|
| Phase 0 — app launches | `flows/00-launch.yaml` | ✅ Automated |
| 1b — manual entry (now via meal-builder), notes limit, SQLite persist | `flows/01b-manual-entry.yaml` | ⏳ Authored (rewritten 2026-07-03 for the two-screen ComponentForm → meal/review flow; pending device run) |
| 1c — barcode scan (real product) | — | ❌ Camera required |
| 1c — manual fallback from scan screen | `flows/01c-barcode-fallback.yaml` | ⏳ Authored (stale "Entry name" assertion fixed → "Component name" 2026-07-03; pending device run) |
| OFF search-by-name lookup | — | ❌ Manual (network, real product DB — same class as a real barcode scan) |
| 1d — day/week/month views, edit sentiment | `flows/01d-browse-edit.yaml` | ✅ Automated |
| 1e — reminder toggle, permission prompt | `flows/01e-reminders.yaml` | ⚠️ Partial (fires at scheduled time: manual) |
| 2 — log BM, filter, coexists with food | `flows/02-bm-tracking.yaml` | ✅ Automated |
| 3 — Insights renders findings, observation framing | `flows/03-insights.yaml` | ✅ Automated |
| UX-1 — title doesn't wrap | — | ❌ Visual only |
| UX-2 — segmented control contrast | — | ❌ Visual/colour only |
| UX-3 — scan screen buttons visible | `flows/ux3-scan-screen.yaml` | ✅ Automated |
| F — serving size saves, 0 doesn't crash | `flows/f-serving-size.yaml` | ⚠️ Partial (rescaling: barcode required) |
| G — native date/time picker opens | `flows/g-datetime-picker.yaml` | ✅ Automated |
| H — recent foods quick-add | `flows/h-recent-foods.yaml` | ✅ Automated |
| I — export/import buttons, no crash | `flows/i-backup.yaml` | ⚠️ Partial (file content + import round-trip: manual) |

### Backfill flows — authored, run 2026-08-16, all failed on the app-bug (not the flows)

These flows were authored in the Maestro backfill session and **run** in the
2026-08-16 resumed test-execute session — all failed, but for a single shared
root cause (the Home-screen render crash, see `docs/RESULTS.md`), not because
any individual flow's YAML is wrong. Status flips to ✅ once a future
test-execute session re-runs `npm run e2e:ci` against a build with that app-bug
fixed and `flows/results.xml` confirms a pass.

| ACCEPTANCE.md item | Flow file | Status |
|---|---|---|
| A — saturated fat persists (manual path) | `flows/ab-satfat-ingredients.yaml` | ❌ Failed 2026-08-16 (app-bug blocker, not a flow defect — see RESULTS.md) |
| B — ingredient capture persists on reopen | `flows/ab-satfat-ingredients.yaml` | ❌ Failed 2026-08-16 (same) |
| Ingredient-capture hardening — additive-only tag policy | `flows/ab-satfat-ingredients.yaml` (extend) | ❌ Failed 2026-08-16 (same) — proxied via the watchlist banner (no direct tag-list UI exists anywhere in the app) |
| C — symptom log, render, filter, edit reload | `flows/c-symptom-logging.yaml` | ❌ Failed 2026-08-16 (same) |
| D — "Ingredients you react to" insight | `flows/d-ingredient-insights.yaml` | ❌ Failed 2026-08-16 (same; manual ingredients ARE tagged — confirmed in formModel.ts) |
| E — summary counts (food · BM · rated) | `flows/e-temporal-insights.yaml` | ❌ Failed 2026-08-16 (same; ⚠️ "Timing patterns" is timing-dependent → manual regardless) |
| E — "Timing patterns" section | — | ❌ Manual (24h windowed join can't be constructed deterministically in clearState) |
| 1d — day/week/month + collapse/expand calendar | `flows/journal-calendar.yaml` | ❌ Failed 2026-08-16 (same) |
| Nav — 5 bottom tabs reachable | `flows/nav-tabs.yaml` | ❌ Failed 2026-08-16 (same; fixed 2026-08-16 — was stale at 4 tabs, missing the Goals tab added in the 2026-08-15 release) |
| Settings — offline toggle + sections render | `flows/settings-smoke.yaml` | ❌ Failed 2026-08-16 (same; offline-mode switch value is not assertable in Maestro → manual regardless) |
| Watchlist — add term, non-blocking flag on review + entry view | `flows/watchlist.yaml` | ❌ Failed 2026-08-16 (same) — targets the **Insights** tab, not Settings (HANDOFF.md's phase-2.1 description was wrong; `WatchlistSection` renders in `src/app/(tabs)/insights.tsx`) |
| Goals tab — daily tally, missing-data disclosure | `flows/goals-tally.yaml` | ❌ Failed 2026-08-16 (app-bug blocker, not a flow defect — see RESULTS.md) |
| Goals — floor/cap thresholds, cap notice, removal | `flows/goal-editor.yaml` | ❌ Failed 2026-08-16 (same) |
| Check-in persistence + 7-day horizon | `flows/checkin-persistence.yaml` | ❌ Failed 2026-08-16 (same) — this is the first session where it could even attempt to run (dev-client blocker resolved), but it never got past the Home-screen crash |

**Finding — label gap:** The Insights screen has no `"Insights"` subtitle heading (unlike
Journal → `"Journal"` and Settings → `"Settings"`). `nav-tabs.yaml` uses `"Your journal so
far"` instead. The test-execute session should note whether adding a subtitle would be
worth a component edit in the next planning session.

**Finding — wide blast radius from the 2026-07-03 manual-entry retarget
(resolved 2026-08-16):** Home's "Add an entry manually" opens `/meal/component`
instead of `/entry/new` (HANDOFF "OFF search-by-name lookup" cycle). Every flow
that taps that button lands on `ComponentForm` (fields: "Component name",
"Ingredients", "Serving size in grams", the nutrition grid, "Add & scan
next"/"Finish meal") instead of the old single-screen `LogEntryForm` ("Entry
name", meal slot, sentiment, notes, "Save entry" all on one screen). As of the
2026-08-16 test-backfill session, **every flow is rewritten for the two-screen
chain** — `flows/ab-satfat-ingredients.yaml`, `flows/f-serving-size.yaml`,
`flows/g-datetime-picker.yaml`, and the seed helpers
`flows/_helpers/seed-two-meals.yaml`, `flows/_helpers/seed-meals-for-insights.yaml`,
`flows/_helpers/seed-ingredient-reactions.yaml` (the last three are `runFlow`
dependencies of other flows, so this closes their staleness transitively too).
`flows/h-recent-foods.yaml` was never affected — it re-logs via the Home
"Recent" tap, which still targets `entry/new`/`LogEntryForm` unchanged.

**Finding — two Maestro flow-authoring gotchas, now fixed everywhere they
occurred (2026-08-16):**
1. Every nutrition-grid field (Calories, Fat (g), Sat. fat (g), …) has its
   `FormField` label text and its `ThemedTextInput accessibilityLabel` set to
   the exact same string. `scrollUntilVisible` on that string is satisfied by
   the short label alone — the input box below it can still be fully
   off-screen and untappable, so the following `tapOn`/`inputText` silently
   lands nowhere (confirmed via `uiautomator dump`: the EditText node was
   simply absent from the hierarchy at that scroll position). **Always scroll
   to a landmark at least one row below** the nutrition field you're about to
   fill (the next row's label, or the screen's action button), not the field's
   own label.
2. Typing into a text field and then immediately `tapOn`-ing a same-screen
   button (e.g. "Add to watchlist") without a `hideKeyboard` in between can
   silently no-op the tap — the button ends up covered/mis-hit while the
   keyboard is still up. **Always `hideKeyboard` before tapping a button that
   follows text entry.** Watch for the matching false-positive: an
   `assertVisible` on the term you just typed can still pass because the text
   is sitting unsent in the input box — assert on something that only exists
   once the action actually succeeded (e.g. the resulting list item's own
   distinguishing text) once the input field would otherwise have been
   cleared.

See `docs/RESULTS.md` (2026-08-16) for the full diagnosis and the flows each
fix landed in.

**Manual items that stay on your desk:**
1. Real barcode scan on a physical product
2. Notification fires at the configured time
3. Visual contrast / theming in dark mode (UX-1, UX-2)
4. Export file content inspection
5. Import round-trip (file picker + full restore verify)

---

## Test-execute protocol (how Claude updates ACCEPTANCE.md)

> This is **step 4** of the development loop (see `docs/TEST_STRATEGY.md`). After a
> feature is built (step 2) and its flows are authored (step 4a), the test-execute
> session (step 4b) runs:

```bash
# 1. Install the fresh JS bundle (no native rebuild needed for JS-only changes)
npx expo start --dev-client
# On Pixel 5: open the dev client app, load the bundle over USB tunnel:
adb reverse tcp:8081 tcp:8081

# 2. Run all flows
maestro test flows/ --format junit --output flows/results.xml

# 3. Claude reads results.xml and updates ACCEPTANCE.md
```

Claude reads `flows/results.xml`. Each `<testcase name="...">` maps to one
flow file. A `<failure>` element means the flow failed. Claude then:

- Flips `[ ]` → `[x]` in ACCEPTANCE.md for each passing flow
- Adds a failure note (with the flow step that failed) for each failing flow
- Leaves the 5 manual items as `[ ]` with a note: "manual — see E2E.md"
- Writes `docs/RESULTS.md` — the human-readable run report (per-flow result,
  what was fixed, what stays manual, findings for the next planning session).
  See `docs/TEST_STRATEGY.md §4` for the template.

---

## Adding a flow for a new feature

1. Write `flows/<section>-<feature>.yaml` targeting the new screen's
   accessibility labels (verify labels in the component's `accessibilityLabel` props).
2. Add a `runFlow` call to any seed helper if the feature needs prior data.
3. Add a row to the Coverage table above.
4. Add the flow to the relevant ACCEPTANCE.md section.
5. Run `npm run e2e:flow flows/<your-flow>.yaml` on the Pixel 5 to confirm it
   passes before committing.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `No connected devices` | `adb devices` shows nothing — check USB cable, re-enable USB debugging |
| `Flow failed: Element not found` | Accessibility label changed in code — check the component's `accessibilityLabel` prop and update the flow |
| `App not found: com.tummytracker.app` | Dev build not installed — run `npx expo run:android` |
| `OK` button not found in date picker | Android version may label it `Set` — change `tapOn: "OK"` to `tapOn: "Set"` in `g-datetime-picker.yaml` |
| Insights flow fails at "Wheat Bread" | Analysis threshold not reached — add more seed entries in `_helpers/seed-meals-for-insights.yaml` |
| Camera permission not granted | Add `permissions: camera: allow` to the flow's `launchApp` block |
| **Flows all "pass" or all fail in a way that doesn't match the code** — e.g. a fix that shipped last cycle still shows the old bug on-device | **Bundle staleness — verify BEFORE trusting any run** (see `docs/RESULTS.md` 2026-08-16 for the full incident). `adb reverse` + `npx expo start --dev-client` only serves fresh JS if the *installed APK* was itself built with `developmentClient: true` (`eas.json` → `"development"` profile). A `"preview"`-profile install is release-configured and bundles its own JS at build time — it will **never** contact Metro, silently and without any error screen, no matter what you do from the host side (adb reverse, deep links, cold relaunch all look identical from the device's perspective). Confirm with `adb shell dumpsys package com.tummytracker.app \| grep -i debuggable` — a real dev client shows a `DEBUGGABLE` flag; a preview/release build doesn't (and `adb shell run-as com.tummytracker.app` will say "not debuggable"). A second confirmation: Metro's own terminal log should print a bundling line every time the app launches — if it's been silent through several `launchApp` cycles, you're on the embedded bundle. If confirmed stale, **stop and report** — do not run the suite; there's no host-side workaround, and re-flashing risks the on-device journal (CLAUDE.md §0 signing caveat), so it's the owner's call. |
| **Every flow fails immediately, "TummyTracker" title visible but nothing else, or `tab-*` testIDs never found** | **A real dev-mode-only render crash, not a flow or environment problem — see `docs/RESULTS.md` 2026-08-16 "Root cause #1".** `expo-router`'s `Slot` throws when an `asChild`-wrapped child receives an array-literal `style` prop (`style={[a, b]}`), but *only* when `NODE_ENV !== 'production'` — i.e. only under a real Metro dev-mode bundle, never in an EAS preview/production build. This blanks the whole app (no error boundary), so every flow fails at its first post-launch assertion regardless of what it's testing. Confirm via `adb logcat -d \| grep -i "DevLauncher\|Render Error"` right after a fresh launch, or just look at the device screen for the redbox. Do not treat this as N independent flow failures — check `grep -rn "asChild" src` for array-style children first; if found, this is the cause and the fix belongs in the next Execute session (flatten the style arrays), not in the flow YAML. |
| **Worktree Metro 404s every module, or `DevLauncher: ...UnableToResolveError` for `expo-router/entry`** | `node_modules` is missing or was installed *after* Metro started crawling. Run `ls node_modules` — if absent, `npm install` first. If present but Metro still 404s, a stale Metro instance (possibly one you can't kill, e.g. blocked by sandboxing) started before the install finished; start a *fresh* Metro on a new port instead of trusting the existing one. |
