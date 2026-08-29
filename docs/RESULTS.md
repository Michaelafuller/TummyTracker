# RESULTS.md — Maestro run 2026-08-29 (test-execute: sentiment-era flow rework + FULL regression, first run on the new host)

## Summary

- **Flows run: 28. Passed: 28. Failed: 0.** (`flows/results.xml`, full re-run,
  57m 46s wall time.) **This is the new clean baseline**, replacing 24/24 of
  2026-08-24 — the first full run against the 2026-08-28 keyboard +
  outcome-insights cycle, and the first on this host (new work laptop) and
  on **Maestro 2.9.0** (the old host ran 1.x — see root cause #2).
- **Scope: full** (twice — the first full pass went 25/28; all three failures
  were triaged as flow-bugs, fixed, individually re-verified, then the whole
  suite was re-run clean).
- **Rungs: green at HEAD** (74 suites / 648 tests) — flows + docs only this
  session (test sessions don't change features; `src/**` untouched).
- **Device + build:** Pixel 5 (`0A131FDD4006VE`), `com.tummytracker.app.dev`,
  `DEBUGGABLE` re-verified. **The installed client is still the 2026-08-21
  build** (`lastUpdateTime=2026-08-21`) — the owner's EAS `development` build
  has NOT landed yet, so `expo-print`/`expo-haptics`/
  `react-native-keyboard-controller` natives are absent and every graceful
  seam is on its fallback path. All 28 greens are valid for the fallback
  behavior; the keyboard QA checklist and the real-PDF flow stay owed to the
  new build.
- **Metro:** fresh `--clear` start on **8081** (new host — no orphaned-Metro
  debt; reconnect helper updated to 8081). Freshness confirmed by the
  bundling line (`Android Bundled 15809ms … (2565 modules)`) before any flow
  ran. Left running at session end.
- **Toolchain installed this session (new machine):** Maestro 2.9.0 to
  `~\.maestro` (owner-approved download), driven with the Microsoft JDK 17 at
  `C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot` (set `JAVA_HOME` —
  the PATH default is a JRE 1.8 that Maestro rejects). adb lives at
  `~\platform-tools` (pre-existing, not on PATH).

## Sentiment-era flow rework (the session's main deliverable, commit `5d24d9a`)

All six stale flows/helpers from the 2026-08-28 blast-radius list reworked and
individually verified, plus two dependents:

- **Seeds** (`seed-ingredient-reactions`, `seed-meals-for-insights`,
  `seed-two-meals`): sentiment taps removed. The first two now build the
  *temporal* structure the outcome engine needs — trigger meals with exact,
  distinct-minute times set via the native time picker, tag-carrying control
  meals dated 8 days back via the calendar picker (they must carry a tag or
  they don't count toward the base rate), and one severity-3 symptom logged
  at "now" as the outcome. Times/dates are computed at runtime by two new
  `runScript` helpers (`_helpers/trigger-times.js`, `_helpers/control-date.js`)
  — the native-picker driving technique is documented in `docs/E2E.md`.
- **`01b-manual-entry`**: sentiment step removed.
  **`01d-browse-edit`**: repurposed from sentiment editing to Notes editing
  (edit → save → reopen → assert), calendar-view coverage intact.
  **`03-insights` / `d-ingredient-insights`**: retargeted to "Foods/Ingredients
  linked to rough outcomes" + the outcome sentence.
  **`e-temporal-insights`**: new 5-part summary-line assertions; the standalone
  "Timing patterns" section is gone (merged into Ingredients).
  **`m-finding-drilldown`**: now asserts the exact
  "3 logs · 3 followed by a rough outcome within 24 h" (deterministic thanks
  to picker-set seed times — supersedes the gotcha-#6 workaround for
  seed-driven flows).

## Root causes (first full pass 25/28 → all flow-bugs, zero app regressions)

1. **Settings page growth pushed the reminder time chip below the fold** →
   class `flow-bug` → `01e-reminders`. The Doctor-report section shipped
   2026-08-24 *after* that day's full run (the Pixel had dropped off adb), so
   this was the flow's first run against the taller page; it tapped
   "breakfast reminder time" with no scroll. Fix: `scrollUntilVisible` +
   `centerElement: true` before the tap. Verified green.
2. **Maestro 2.9.0 counts a barely-peeking element as "visible"** → class
   `flow-bug` → `checkin-persistence` (and a contributor to #1). Scrolls that
   stopped the moment the "Daily check-in" heading crested the screen edge
   left the actual Switch below the fold under 2.9.0, where 1.x had scrolled
   further. Fix: `centerElement: true` on all three "Daily check-in"
   scrolls. Now **E2E.md gotcha #7** — center anything you're about to tap
   or assert-with-state.
3. **Midnight-crossing seed times** → class `flow-bug` → `m-finding-drilldown`.
   The full run crossed local midnight; `trigger-times.js`'s minute-nudge
   pushed the computed time into *yesterday*, but flows only set the TIME
   chip (date stays "today"), so the seeded meals landed ~24 h in the future
   and no finding rendered. Fix: clamp the target to today's 00:00 (worst
   case right after midnight: trigger minutes collapse toward 00:00, which no
   assertion depends on). Now **E2E.md gotcha #8**. Verified green.

## Per-flow

All 28 passed in the final run — timings in `flows/results.xml` and the run
log. Notables: `03-insights` 6m41s and `d-ingredient-insights` 5m09s (the
picker-driven seeds are slower than the old sentiment taps — the price of
deterministic temporal data), `m-finding-drilldown` 5m22s. Suite wall time
57m46s for 28 flows.

## Owed old-client checks (2026-08-24 debt) — CLEARED

- **Doctor-report guard**: Settings renders the "Doctor report" section;
  "Create PDF report" shows the Update-required alert on this old client.
  Done via scratch flow (not committed to the suite).
- **`settings-smoke` + `i-backup` re-runs**: both green, unmodified.

## Findings for the next planning session

- **Dev-only LogBox redbox on the caught `expo-print` import failure**
  (`src/app/(tabs)/settings.tsx:152`): the `try/catch` works — the
  Update-required alert fires as designed — but the failed dynamic import
  ALSO throws an unhandled "Cannot find native module 'ExpoPrint'" into
  LogBox, which draws a redbox over the alert on dev builds. Cosmetic,
  dev-only (LogBox is stripped in release), and it disappears once the new
  build ships the native — but if the pattern recurs for future
  gated natives, consider swallowing the module-level rejection explicitly.
  Not fixed here (test sessions don't change features).
- **The EAS `development` build is still the gating item** for: keyboard QA
  checklist (E2E.md manual items #6–7), the real PDF share-sheet flow
  (`n-doctor-report.yaml`, still unauthored — needs the native), haptics
  feel, and removing the ~45 `hideKeyboard` workarounds. The owner's
  `eas login` was blocked by corporate TLS interception — fix documented in
  ACCEPTANCE.md's build section (`NODE_OPTIONS=--use-system-ca` or
  `NODE_EXTRA_CA_CERTS`).
- Carried (unchanged): root-level React error boundary (📌 pinned) ·
  "Insights" subtitle heading · dev-mode mount warning repro · chart
  `accessible` gap on BarMeter (TrendBars/MiniHistogram were deleted
  2026-08-28, shrinking that follow-up to BarMeter only).

## ACCEPTANCE.md changes made

- 2026-08-28 release section: header updated (28/28 baseline); flipped
  `[ ]`→`[x]`: no-rating-selector-on-meal-forms (01b + 03-insights), BM
  "How did it feel?" + isOutcome wiring (02-bm-tracking + Jest + e-temporal),
  new Insights section set (03/d/e/k/l/watchlist collectively). Doctor-PDF
  row annotated with the old-client guard result; historical-rating row
  annotated with its Jest regression coverage. Keyboard rows stay `[ ]`
  (EAS build).
- Superseded 2026-08-28 annotations on 01b / 01d / D-section /
  finding-drilldown rows updated from "owed a rework" to "reworked +
  verified 2026-08-29".
