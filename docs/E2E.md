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

| ACCEPTANCE.md item | Flow file | Status |
|---|---|---|
| Phase 0 — app launches | `flows/00-launch.yaml` | ✅ Automated |
| 1b — manual entry, notes limit, SQLite persist | `flows/01b-manual-entry.yaml` | ✅ Automated |
| 1c — barcode scan (real product) | — | ❌ Camera required |
| 1c — manual fallback from scan screen | `flows/01c-barcode-fallback.yaml` | ✅ Automated |
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

### Backfill flows — authored; pending test-execute run on Pixel 5

These flows were authored in the Maestro backfill session. Status flips to ✅
once the test-execute session runs `npm run e2e` and `flows/results.xml` confirms
they pass. See `docs/RESULTS.md` (written by the test-execute session).

| ACCEPTANCE.md item | Flow file | Status |
|---|---|---|
| A — saturated fat persists (manual path) | `flows/ab-satfat-ingredients.yaml` | ⏳ Authored |
| B — ingredient capture persists on reopen | `flows/ab-satfat-ingredients.yaml` | ⏳ Authored |
| C — symptom log, render, filter, edit reload | `flows/c-symptom-logging.yaml` | ⏳ Authored |
| D — "Ingredients you react to" insight | `flows/d-ingredient-insights.yaml` | ⏳ Authored (manual ingredients ARE tagged — confirmed in formModel.ts) |
| E — summary counts (food · BM · rated) | `flows/e-temporal-insights.yaml` | ⏳ Authored (⚠️ partial; "Timing patterns" is timing-dependent → manual) |
| E — "Timing patterns" section | — | ❌ Manual (24h windowed join can't be constructed deterministically in clearState) |
| 1d — day/week/month + collapse/expand calendar | `flows/journal-calendar.yaml` | ⏳ Authored |
| Nav — 4 bottom tabs reachable | `flows/nav-tabs.yaml` | ⏳ Authored |
| Settings — offline toggle + sections render | `flows/settings-smoke.yaml` | ⏳ Authored (smoke; offline-mode switch value is not assertable in Maestro → manual) |

**Finding — label gap:** The Insights screen has no `"Insights"` subtitle heading (unlike
Journal → `"Journal"` and Settings → `"Settings"`). `nav-tabs.yaml` uses `"Your journal so
far"` instead. The test-execute session should note whether adding a subtitle would be
worth a component edit in the next planning session.

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
  See `docs/TEST_STRATEGY.md §3` for the template.

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
