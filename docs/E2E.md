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
>
> **Every `launchApp` (including mid-flow relaunches) must be immediately
> followed by `runFlow: _helpers/reconnect-dev-client.yaml`** — the dev client
> never auto-reconnects to Metro on its own. See the "Dev-client never
> auto-reconnects" finding below for why and how it works; the helper's Metro
> port is hardcoded and needs updating per-session if Metro isn't on the port
> currently baked into it.

> **Build-variant split:** every flow now targets `com.tummytracker.app.dev`
> (the `development`-profile build) via its `appId`, and the reconnect helper
> deep-links through the `tummytracker-dev://` scheme — never
> `com.tummytracker.app`/`tummytracker://`, which is the owner's real journal
> app. This keeps `clearState` and every other destructive Maestro action
> permanently walled off from real data; the two apps install and coexist
> side by side. Metro sessions do **not** need `APP_VARIANT` set — the native
> app identity is baked into the installed build at build time, and the JS
> Metro serves is identity-agnostic.

---

## Coverage

> **2026-08-24 full run: 24/24 flows passed** (`flows/results.xml`) — first
> full suite on the dev variant (`com.tummytracker.app.dev`), including the new
> `c2-multi-symptom.yaml`; zero flow-bugs, zero app-bugs. See `docs/RESULTS.md`.
>
> **2026-08-16/17 test-execute run (second resume): 23/23 flows passed.** The
> app-bug that blocked the prior session (expo-router `Slot` dev-mode crash on
> array-style props) was fixed at `283d147` and is confirmed resolved. This
> session also found and fixed a **dev-client reconnect gap** (see the
> "Dev-client never auto-reconnects" finding below) plus three ordinary
> flow-bugs. Every status below reflects an actual passing `<testcase>` in
> `flows/results.xml` from this run — see `docs/RESULTS.md` for detail.

| ACCEPTANCE.md item | Flow file | Status |
|---|---|---|
| Phase 0 — app launches | `flows/00-launch.yaml` | ✅ Automated |
| 1b — manual entry (two-screen ComponentForm → meal/review), notes counter, SQLite persist | `flows/01b-manual-entry.yaml` | ✅ Automated (notes counter *wiring* only — the 500-char overflow clamp is Jest-covered, not re-driven on-device; see the reconnect/text-injection finding below; reworked + verified 2026-08-28: sentiment removed, no rating step on the meal-review screen anymore) |
| 1c — barcode scan (real product) | — | ❌ Camera required |
| 1c — manual fallback from scan screen | `flows/01c-barcode-fallback.yaml` | ✅ Automated |
| OFF search-by-name lookup | — | ❌ Manual (network, real product DB — same class as a real barcode scan) |
| 1d — day/week/month views, edit Notes | `flows/01d-browse-edit.yaml` | ✅ Automated (reworked + verified 2026-08-28: meal/snack sentiment no longer exists, so the edit target changed from "change its sentiment" to "edit its Notes field, save, reopen, verify the new text persisted") |
| 1d — day/week/month + collapse/expand calendar | `flows/journal-calendar.yaml` | ✅ Automated |
| 1e — reminder toggle, permission prompt | `flows/01e-reminders.yaml` | ⚠️ Partial (fires at scheduled time: manual) |
| 2 — log BM, filter, coexists with food | `flows/02-bm-tracking.yaml` | ✅ Automated |
| 3 — Insights renders findings, observation framing | `flows/03-insights.yaml` | ✅ Automated (reworked + verified 2026-08-28: asserts the renamed "Foods linked to rough outcomes" section and the outcomeSentence fragment instead of the old sentiment-era "Based on N logs." sample line, which no longer renders for food findings) |
| UX-1 — title doesn't wrap | — | ❌ Visual only |
| UX-2 — segmented control contrast | — | ❌ Visual/colour only |
| UX-3 — scan screen buttons visible | `flows/ux3-scan-screen.yaml` | ✅ Automated |
| F — serving size saves, 0 doesn't crash | `flows/f-serving-size.yaml` | ⚠️ Partial (rescaling: barcode required) |
| G — native date/time picker opens | `flows/g-datetime-picker.yaml` | ✅ Automated |
| H — recent foods quick-add | `flows/h-recent-foods.yaml` | ✅ Automated |
| I — export/import buttons, no crash | `flows/i-backup.yaml` · `flows/settings-smoke.yaml` | ⚠️ Partial (file content + import round-trip: manual) |
| A — saturated fat persists (manual path) | `flows/ab-satfat-ingredients.yaml` | ✅ Automated |
| B — ingredient capture persists on reopen | `flows/ab-satfat-ingredients.yaml` | ✅ Automated |
| Ingredient-capture hardening — additive-only tag policy | `flows/ab-satfat-ingredients.yaml` (extend) | ✅ Automated — proxied via the watchlist banner (no direct tag-list UI exists anywhere in the app) |
| C — symptom log, render, filter, edit reload | `flows/c-symptom-logging.yaml` | ✅ Automated |
| C2 — multi-symptom: two chips, one save → two journal entries, per-entry edit with shared severity | `flows/c2-multi-symptom.yaml` | ✅ Automated (authored + passed individually 2026-08-24, fresh-bundle-verified) |
| D — "Ingredients linked to rough outcomes" insight | `flows/d-ingredient-insights.yaml` | ✅ Automated (reworked + verified 2026-08-28: renamed section, cards now cite an outcome-rate sentence instead of an average sentiment) |
| E — summary counts (food · BM · symptoms · rough outcomes) | `flows/e-temporal-insights.yaml` | ✅ Automated (reworked + verified 2026-08-28: new 5-field summary line) |
| E — "Timing patterns" section | — | **Superseded 2026-08-28** — the section no longer exists (merged into the ingredient analysis; `analyzeIngredientOutcomes` *is* the timing analysis now, `src/features/analysis/insights.ts`). What was manual (a 24h windowed join couldn't be constructed deterministically in a `clearState` run) is now fully automated and deterministic — `flows/_helpers/seed-ingredient-reactions.yaml` / `seed-meals-for-insights.yaml` drive the native date/time picker to set exact, distinct-minute meal times instead of relying on real-clock timing, so the outcome join is no longer a race. See `flows/d-ingredient-insights.yaml` and `flows/m-finding-drilldown.yaml` for the coverage this folded into, and the new "driving the native date/time picker" finding below for the mechanism. |
| Nav — 5 bottom tabs reachable | `flows/nav-tabs.yaml` | ✅ Automated |
| Settings — offline toggle + sections render | `flows/settings-smoke.yaml` | ✅ Automated (offline-mode switch value is not assertable in Maestro → manual regardless) |
| Watchlist — add term, non-blocking flag on review + entry view | `flows/watchlist.yaml` | ✅ Automated — targets the **Insights** tab, not Settings (`WatchlistSection` renders in `src/app/(tabs)/insights.tsx`) |
| Goals tab — daily tally, missing-data disclosure, tally-row drill-down (expand/collapse, "no data" sub-rows, tap-through to edit screen), "Today" + long-date header | `flows/goals-tally.yaml` | ✅ Automated (verified 2026-08-21 on the dev variant, `com.tummytracker.app.dev`) |
| J — meal-component drill-down: servings edit re-aggregates totals, swipe-delete + editor Delete (confirms), section hides at 1 component, relaunch persistence | `flows/j-component-drilldown.yaml` | ✅ Automated (authored 2026-08-24; recorded green + confirmation re-run) |
| K — BM trends: Insights "Digestion" section (regularity line, weekly count bars, Bristol histogram) with 2 seeded BMs; chart a11y summaries asserted | `flows/k-bm-trends.yaml` | ✅ Automated (authored 2026-08-24; caught the missing-`accessible` a11y bug, gotcha #5) |
| L — intake charts: Insights "Intake" section (Calories + Fiber weekly avg/day) from one 210 kcal / 7 g-fiber meal; summaries asserted | `flows/l-intake-charts.yaml` | ✅ Automated (authored 2026-08-24; passed first try) |
| M — finding drill-down: tap "See all logs: onion" → detail summary, outcome marker, row → Edit entry | `flows/m-finding-drilldown.yaml` | ✅ Automated (authored 2026-08-24; reworked + verified 2026-08-28 for the outcome-based detail summary — the outcome count is now fully deterministic, not just "at least one" as gotcha #6 previously required, since each onion meal's time is set explicitly via the native picker rather than relying on same-minute form-save timing) |
| Goals — floor/cap thresholds, cap notice, removal | `flows/goal-editor.yaml` | ✅ Automated |
| Check-in persistence + 7-day horizon | `flows/checkin-persistence.yaml` | ✅ Automated |

**Finding — label gap:** The Insights screen has no `"Insights"` subtitle heading (unlike
Journal → `"Journal"` and Settings → `"Settings"`). `nav-tabs.yaml` uses `"Your journal so
far"` instead. The test-execute session should note whether adding a subtitle would be
worth a component edit in the next planning session.

**Finding — dev-client never auto-reconnects to Metro (2026-08-16/17, blocked
every flow before the fix):** Maestro's `launchApp` — with `clearState: true`
*or* plain — always drops the Expo dev client back to its built-in
"Development Build" connect screen (`exp://` field, "Connect" button). The
dev client does **not** remember or auto-reconnect to the last dev-server URL
across either kind of relaunch; this is true even for `stopApp` + plain
`launchApp` mid-flow (`01b-manual-entry.yaml`'s SQLite-persistence check,
`checkin-persistence.yaml`'s second launch). Left unhandled, every flow's
first post-launch assertion fails as "element not found" — indistinguishable
from a real app-bug crash unless you check the screenshot and see the connect
screen, not the app. Fix: `runFlow: _helpers/reconnect-dev-client.yaml`
immediately after **every** `launchApp` step, which:
1. Waits for "Development Build" (confirms the connect screen actually showed).
2. `openLink`s the explicit deep link `<scheme>://expo-development-client/?url=http://localhost:<metro-port>` — this reconnects regardless of prior state, since the URL is in the intent itself, not read from any remembered preference.
3. Handles two more wrinkles that show up after the link fires, both harmless no-ops when absent: a one-time "This is the developer menu" tooltip (`tapOn: "Continue", optional: true`) on the very first connection after a data wipe, and the dev-menu sheet (Reload / Go home / Tools) that re-opening the same link while already connecting can pop instead of landing directly on the app (`tapOn: "Close", optional: true` — **not** "Go home", which navigates the dev client itself back to the connect screen, and **not** the hardware Back key, which can exit the app entirely to whatever was behind it).
See `flows/_helpers/reconnect-dev-client.yaml` for the full step sequence (verified reliable across 3+ consecutive clearState/relaunch cycles) and `docs/RESULTS.md` for the diagnosis. **The Metro port is hardcoded in the helper** — update it once at the top of a session if Metro isn't on the port currently baked in there. Currently **8081** (2026-08-21 targeted Goals run — also the first run of the helper against the dev variant, `com.tummytracker.app.dev` / `tummytracker-dev://`, confirmed working end-to-end on the first try, no diagnosis needed).

**Finding — Maestro's text selector is a FULL regex match, not a substring
search:** `assertVisible: "food"` (or `scrollUntilVisible: element: text:
"food"`) only matches a node whose **entire** text equals (in the regex
sense) `"food"` — it does not find `"food"` as a substring inside a longer
node like `"3 entries · 2 food · 1 BM · 3 rated · avg sentiment 3.3"`
(confirmed live: identical failure whether reached via scroll, a plain
`assertVisible` with no scroll, or immediately after a fresh render — ruling
out timing). Every previously-passing bare-word assertion in this project's
flows happened to be the complete text of its own node (e.g. `"Scan
barcode"`), which is why this went unnoticed until `e-temporal-insights.yaml`
tried to assert a fragment of the Insights summary line. **Fix: wrap the
fragment in `.*` wildcards** — `assertVisible: ".*food.*"` — to match a
substring inside a longer string.

**Finding — very long `inputText` strings silently lose characters on this
device (env, not a flow or app bug):** typing 500+ chars via Maestro's
`inputText` (ADB text injection) into `01b-manual-entry.yaml`'s Notes field
landed at a different, always-incomplete character count on every attempt —
408, then 422, then 208 when split into unsettled chunks, then 408 again with
settled chunks. The repeated exact-408 result across two structurally
different techniques rules out a JS/React timing race (which would vary) and
points to a fixed IME/input-connection ceiling on the device itself, well
under the app's actual 500-char `maxLength`. **Do not try to reproduce the
500-char overflow clamp through the IME** — it's already unit-tested directly
(`src/lib/__tests__/validation.test.ts` `validateNotes`); have the flow type a
short, realistic string instead and assert the live counter reflects it
(`01b-manual-entry.yaml` now types a 67-char note and asserts `"67/500"`).

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

**Finding — Maestro flow-authoring gotchas, now fixed everywhere they
occurred:**
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
   cleared. (`h-recent-foods.yaml` hit the same keyboard-covers-content shape
   again 2026-08-17: after typing into the search field, the whole screen —
   search box and filtered rows both — sat underneath the keyboard until a
   `hideKeyboard` cleared it.)

   **Fixed 2026-08-28** (Milestone A3) via `react-native-keyboard-controller`
   behind the graceful seam in `src/lib/keyboard.ts` +
   `src/components/keyboard-aware-screen.tsx`: Home now wraps its content
   column in `KeyboardShiftView` so the keyboard pads the container instead of
   covering it, and Insights/Goals swapped their bare `ScrollView` for
   `FormScrollView` (keyboard-aware scrolling + `keyboardShouldPersistTaps`).
   On the **current (old) dev client** — built before this cycle —
   `getKeyboardController()` still returns null, so all three screens fall
   back to exactly today's behavior; the `hideKeyboard` workarounds above stay
   in the flows until the owner's next EAS build ships the native module, at
   which point a fresh test-execute session should re-check whether they're
   still needed.
3. A second row in a short list can sit just below the fold on a Pixel 5
   viewport even when the section header above it is already on-screen —
   `assertVisible` does not scroll, so a below-fold row silently "fails to be
   visible" while looking present in spirit. Always `scrollUntilVisible` the
   specific row/text you're about to assert, not just the section header
   above it (`h-recent-foods.yaml`'s second "Recent" row, "Pizza slice").
4. **Swiping (or tapping) a row that `scrollUntilVisible` left half-clipped at
   the bottom screen edge silently no-ops** — the gesture's start point lands
   in the Android gesture-nav dead zone and never reaches the target
   (`j-component-drilldown.yaml`'s swipe-to-delete, 2026-08-24: the swipe
   "COMPLETED" but the RNGH swipeable never opened; the failure screenshot
   showed the row hugging the bottom edge). Add `centerElement: true` to the
   `scrollUntilVisible` before any `swipe: from:` (and before tapping rows in
   long scrollables), and wrap the swipe in a `repeat: times: N / while:
   notVisible: <revealed action>` — a single swipe doesn't always drag far
   enough to latch a friction-2 `ReanimatedSwipeable` open even when centered.
5. **An `accessibilityLabel` on a plain (non-touchable) `View` is invisible to
   Maestro — and to TalkBack — unless the View also sets `accessible`**
   (`k-bm-trends.yaml`, 2026-08-24: both chart-summary assertions failed with
   the labels nowhere in the hierarchy; this was an app a11y bug, not a flow
   bug — fixed at `8872c4e` for the BM charts). Touchables (`Pressable` etc.)
   are accessible by default, which is why every earlier label-based selector
   worked. When a flow asserts a summary label on a container View, check the
   component sets `accessible`; the older charts (TrendBars, MiniHistogram,
   BarMeter) still have this gap — flagged as a follow-up task.
6. **`loggedAt` has MINUTE granularity — never assert a count that depends on
   sub-minute ordering** (`m-finding-drilldown.yaml`, 2026-08-24): the entry
   forms round time to the minute, so entries saved in the same minute share
   an identical timestamp, and strictly-after logic (e.g. the drill-down's
   followed-by-outcome flag) correctly skips same-instant pairs. Whether two
   back-to-back seeded saves straddle a minute boundary is run-dependent —
   assert the stable parts (totals, at-least-one marker), not exact
   order-dependent counts. **Partially superseded 2026-08-28:** the seed
   helpers now set exact, distinct-minute times via the native picker
   (`_helpers/trigger-times.js`), so flows built on those seeds MAY assert
   exact outcome counts; the rule still applies to any entry saved at "now".
7. **Maestro 2.x treats a barely-peeking element as "visible" — always
   `centerElement: true` on a `scrollUntilVisible` whose target (or whose
   target's sibling control) you're about to tap or assert-with-state**
   (2026-08-29, first full run on Maestro 2.9.0 after the old host's 1.x):
   `01e-reminders` and `checkin-persistence` both failed exactly where a
   heading had just crested the bottom edge while the actionable control
   below it (TimeField chip, check-in Switch) was still off-screen — the
   scroll stopped at first-pixel visibility, then the tap/assert targeted a
   clipped or absent node. Both fixed by `centerElement: true` (and
   `01e-reminders` additionally needed a scroll at all — the Doctor-report
   section added 2026-08-24 grew the Settings page past the fold *after*
   that flow's last green run). Related: gotcha #4's dead-zone rule.
8. **Time-of-day-dependent `runScript` seeds must clamp to today's midnight**
   (2026-08-29): the first full run crossed local midnight and
   `_helpers/trigger-times.js`'s minute-nudge pushed the computed time into
   *yesterday* — but the flows only set the TIME chip (date stays "today"),
   so the meals landed ~24h in the FUTURE, the outcome no longer followed
   anything, and `m-finding-drilldown` found no "See all logs: onion"
   button. Fixed by clamping the target to `startOfToday` (worst case in
   the first minutes after midnight: trigger minutes collapse toward 00:00,
   which no assertion depends on). Any future seed script computing times
   from `new Date()` must keep this property.

**Finding — wide blast radius from the 2026-08-28 sentiment removal (resolved
2026-08-28):** meal/snack sentiment was deleted in favor of outcome-based
correlation (`isOutcome` v2 — bad BM, BM feel ≤2, or symptom severity ≥3; see
`docs/PROGRESS.md` Decisions 4 & 7). Every flow or seed helper that rated a
meal, or asserted UI text derived from meal sentiment, was stale — all six
items below (plus their transitive dependents: `flows/03-insights.yaml` via
`seed-meals-for-insights.yaml`, and `flows/journal-calendar.yaml` /
`flows/h-recent-foods.yaml` / `flows/i-backup.yaml` / `flows/c-symptom-logging.yaml`
via `seed-two-meals.yaml`) were reworked and individually verified green on
the connected Pixel 5 this session. The seed helpers no longer rely on
same-minute form-save timing to produce (or avoid) an outcome match — they
now drive the native date/time picker to set exact, distinct-minute meal
times deterministically; see the new finding below on driving that picker.
The rework, for the record:
1. `flows/01b-manual-entry.yaml` — removed the stale sentiment tap on the
   meal-review screen (meal forms show no rating selector at all now).
2. `flows/01d-browse-edit.yaml` — repurposed from "open a past entry and edit
   its sentiment" (no longer possible for a meal/snack) to "edit its Notes
   field, save, reopen, verify the new text persisted."
3. `flows/_helpers/seed-two-meals.yaml`, `flows/_helpers/seed-meals-for-insights.yaml`,
   `flows/_helpers/seed-ingredient-reactions.yaml` — dropped the sentiment
   taps. `seed-two-meals.yaml` needed nothing else (its dependents only need
   two named entries to exist). The other two now seed symptom/BM entries
   that produce a rough outcome within 24h of the food — see the seed-design
   math in the new date/time-picker finding below.
4. `flows/m-finding-drilldown.yaml` — now asserts the new detail-screen
   summary (`{count, outcomes}`, "N logs · M followed by a rough outcome
   within 24 h") instead of the old "logs, rated, avg sentiment" line, with
   no per-row sentiment column.
5. `flows/e-temporal-insights.yaml` — the standalone "Timing patterns"
   section is gone (merged into the Ingredients analysis, same underlying
   engine); reworked to assert the new 5-field summary line
   (`{total} entries · {food} food · {bm} BM · {symptoms} symptoms ·
   {roughOutcomes} rough outcomes`).
6. `flows/d-ingredient-insights.yaml` — the section is renamed "Ingredients
   linked to rough outcomes" and cards now cite an outcome rate vs.
   baseline (`outcomeSentence`), not an average sentiment.

`flows/02-bm-tracking.yaml` is **unaffected** — bowel-movement logging and
its Bristol/feel-afterward rating are untouched by this cycle (a BM's "How
did it feel?" rating is a distinct, still-live field — see
`src/features/bm/BmForm.tsx` — unlike the deleted meal/snack sentiment).

**Finding — driving the native Android date/time picker to a specific value
(2026-08-28, new capability):** the outcome-based analyses need meals at
known, distinct times/dates — no longer satisfiable by letting several
form-saves land wherever the real clock happens to be (gotcha #6). Maestro
has no built-in "set this date" command, but the underlying native pickers
are drivable via their accessibility tree:
- **Time** (`DateTimePicker` in `mode="time"`, Android's clock-face
  `TimePickerDialog`): tap the picker's pencil/keyboard toggle,
  accessibility label **"Switch to text input mode for the time input."**
  (`android:id/toggle_mode`), to switch from the clock face to two `EditText`
  fields: `android:id/input_hour` and `android:id/input_minute` (select by
  `id:`, then `inputText`). The am/pm control is a `Spinner`
  (`android:id/am_pm_spinner`) — tap it to open the dropdown, then tap
  `"AM"` or `"PM"` (each is its own list item, full-text-match safe). Confirm
  with `tapOn: "OK"` (or `"Set"` — see the existing troubleshooting-table
  entry).
- **Date** (`DateTimePicker` in `mode="date"`, Android's `DatePickerDialog`):
  this dialog has **no text-input toggle** on this OS build — it's
  calendar-grid-only. Each day cell's `accessibilityText` is a full label
  like `"20 August 2026"` (always 2-digit day) — full-text-match tap that,
  then `"Previous month"` / `"Next month"` buttons to change months, then
  `tapOn: "OK"`.
- Neither the day-of-month nor the month/year is knowable at flow-authoring
  time, so hardcoding a literal date string only works for one calendar day.
  Both new seed helpers instead use a `runScript:` step (a small JS file
  under `flows/_helpers/`) that computes the needed value from `new Date()`
  at run time and writes it to Maestro's `output` object; later steps
  reference it as `${output.someKey}` in `tapOn`/`inputText` (confirmed
  working for both string interpolation and a `repeat: times: ${output.n}`
  loop, which correctly executes zero iterations when the count is 0).
  `flows/_helpers/trigger-times.js` computes up to 5 distinct minutes
  "a few hours ago, today" (sharing one hour + am/pm, so one spinner
  selection covers all of them) without crossing local midnight backward;
  `flows/_helpers/control-date.js` computes a "N days ago" day-cell label
  plus how many `"Previous month"` taps are needed to reach it, verified
  against both a same-month case (8 days back) and a month-crossing case (35
  days back, 1 "Previous month" tap) live on-device. Both scripts are
  reusable by any future flow that needs a deterministic relative
  time/date — see their header comments for the exact contract.

**Finding — a caught dynamic-import failure still surfaces a LogBox redbox
(2026-08-28, dev-build-only, not a functional bug):** the owed old-client
doctor-report spot-check confirmed `handleCreateReport`'s graceful fallback
works correctly on a build without the `expo-print` native module — the
`try/catch` around `await import('expo-print')` (`src/app/(tabs)/settings.tsx`
line 152) does run and does show the intended "Update required" alert.
**But** the failed dynamic import *also* triggers a React Native LogBox
"Uncaught Error: Cannot find native module 'ExpoPrint'" redbox on top of
that alert — confirmed via screenshot: dismissing the redbox (`tapOn:
"Dismiss"`) reveals the "Update required" alert was already showing
underneath the whole time. LogBox is a dev-build-only overlay (stripped from
release/production builds), so this is cosmetic dev-mode noise, not a
regression in the graceful-degradation contract — but any future flow that
exercises this path needs an `optional: true` dismiss of the redbox before
asserting on the alert, since the redbox otherwise sits on top and blocks
the alert's own tap targets.

See `docs/RESULTS.md` (2026-08-16/17) for the full diagnosis and the flows each
fix landed in.

**Manual items that stay on your desk:**
1. Real barcode scan on a physical product
2. Notification fires at the configured time
3. Visual contrast / theming in dark mode (UX-1, UX-2)
4. Export file content inspection
5. Import round-trip (file picker + full restore verify)
6. **(owed, Milestone A3, after the owner's next EAS build)** On-device
   keyboard QA for the 10 input screens (the 7 form screens + Home + Insights
   + Goals): focus the bottom-most field on each and confirm it stays visible
   above the keyboard, now that the dev client actually has the
   `react-native-keyboard-controller` native module instead of falling back.
7. **(owed, Milestone A3, same build)** Verify `ComponentForm`'s name-field
   `onBlur` OFF search still fires exactly once when tapping between fields —
   the keyboard-aware wrapper changes focus/blur timing on Android and this
   hasn't been re-driven on a build where KC is actually active.

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
- Leaves the manual items (see the list above) as `[ ]` with a note: "manual —
  see E2E.md"
- Writes `docs/RESULTS.md` — the human-readable run report (per-flow result,
  what was fixed, what stays manual, findings for the next planning session).
  See `docs/TEST_STRATEGY.md §4` for the template.

---

## Adding a flow for a new feature

1. Write `flows/<section>-<feature>.yaml` targeting the new screen's
   accessibility labels (verify labels in the component's `accessibilityLabel` props).
2. Put `runFlow: _helpers/reconnect-dev-client.yaml` immediately after every
   `launchApp` step (including any mid-flow relaunch) — see the "App state"
   note above.
3. Add a `runFlow` call to any seed helper if the feature needs prior data.
4. Add a row to the Coverage table above.
5. Add the flow to the relevant ACCEPTANCE.md section.
6. Run `npm run e2e:flow flows/<your-flow>.yaml` on the Pixel 5 to confirm it
   passes before committing.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `No connected devices` | `adb devices` shows nothing — check USB cable, re-enable USB debugging |
| `Flow failed: Element not found` | Accessibility label changed in code — check the component's `accessibilityLabel` prop and update the flow |
| `App not found: com.tummytracker.app.dev` | Dev build not installed — run `npx expo run:android` |
| `OK` button not found in date picker | Android version may label it `Set` — change `tapOn: "OK"` to `tapOn: "Set"` in `g-datetime-picker.yaml` |
| Insights flow fails at "Wheat Bread" | Analysis threshold not reached — add more seed entries in `_helpers/seed-meals-for-insights.yaml` |
| Camera permission not granted | Add `permissions: camera: allow` to the flow's `launchApp` block |
| **Flows all "pass" or all fail in a way that doesn't match the code** — e.g. a fix that shipped last cycle still shows the old bug on-device | **Bundle staleness — verify BEFORE trusting any run** (see `docs/RESULTS.md` 2026-08-16 for the full incident). `adb reverse` + `npx expo start --dev-client` only serves fresh JS if the *installed APK* was itself built with `developmentClient: true` (`eas.json` → `"development"` profile). A `"preview"`-profile install is release-configured and bundles its own JS at build time — it will **never** contact Metro, silently and without any error screen, no matter what you do from the host side (adb reverse, deep links, cold relaunch all look identical from the device's perspective). Confirm with `adb shell dumpsys package com.tummytracker.app.dev \| grep -i debuggable` — a real dev client shows a `DEBUGGABLE` flag; a preview/release build doesn't (and `adb shell run-as com.tummytracker.app.dev` will say "not debuggable"). A second confirmation: Metro's own terminal log should print a bundling line every time the app launches — if it's been silent through several `launchApp` cycles, you're on the embedded bundle. If confirmed stale, **stop and report** — do not run the suite; there's no host-side workaround, and re-flashing risks the on-device journal (CLAUDE.md §0 signing caveat), so it's the owner's call. |
| **Every flow fails immediately, "TummyTracker" title visible but nothing else, or `tab-*` testIDs never found** | Two different root causes have produced this exact symptom — check which one you're looking at before assuming either. **(a) Dev-mode-only render crash** (fixed at `283d147`, see `docs/RESULTS.md` 2026-08-16 "Root cause #1"): `expo-router`'s `Slot` throws when an `asChild`-wrapped child receives an array-literal `style` prop, only under `NODE_ENV !== 'production'`. Confirm via `adb logcat -d \| grep -i "DevLauncher\|Render Error"` or the device's redbox. **(b) Dev-client connect screen, not a crash at all** (see the "Dev-client never auto-reconnects" finding above): "TummyTracker" is the connect screen's OWN app-name header, not the app's Home heading — take a screenshot before diagnosing further. Fix is `runFlow: _helpers/reconnect-dev-client.yaml` after every `launchApp`, not an app-code change. |
| **A flow that types a long string into a field (e.g. 500+ chars) lands at an inconsistent, always-partial character count** | Not a flow-timing bug — this device's IME/input-connection has a hard ceiling around 400 chars for `inputText` injection (see the "very long `inputText` strings" finding above). Splitting into settled chunks does not raise the ceiling. Don't try to drive the overflow case through the IME; type a short representative string and assert the counter instead, and lean on a Jest unit test for the exact clamp behavior. |
| **`assertVisible`/`scrollUntilVisible` on a short word (e.g. `"food"`, `"rated"`) fails even though that exact word is visibly on-screen inside a longer sentence** | Maestro's text selector requires a FULL match against a node's entire text — see the "Maestro's text selector is a FULL regex match" finding above. Wrap the fragment: `".*food.*"`. |
| **Worktree Metro 404s every module, or `DevLauncher: ...UnableToResolveError` for `expo-router/entry`** | `node_modules` is missing or was installed *after* Metro started crawling. Run `ls node_modules` — if absent, `npm install` first. If present but Metro still 404s, a stale Metro instance (possibly one you can't kill, e.g. blocked by sandboxing) started before the install finished; start a *fresh* Metro on a new port instead of trusting the existing one. |

**Finding — Metro's file watcher can miss edits on this Windows host (2026-08-21):**
during the meal-component-delete review, a fix committed to `src/app/entry/[id].tsx`
while Metro was already running never reached the device — the dev client kept
running the pre-fix code across several `launchApp`/deep-link relaunches, even
though a fresh single-module request to Metro returned the fixed source (Metro's
long-lived bundle graph only updates on watcher events, and the node watcher
dropped the write). Symptom: device behaviour matches the *previous* commit
while the source on disk is current. **Rule: after any source change lands
while Metro is running (especially writes by a subagent or `git` checkout /
commit), restart Metro (`npx expo start --dev-client --port <port> --clear`)
before trusting a device run.** Metro's `/reload` endpoint is not available on
this version (HTTP 500) — a process restart is the reliable path.
