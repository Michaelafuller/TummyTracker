# RESULTS.md — Maestro run 2026-08-24 (test-execute: c2 authoring + FULL regression, first full run on the dev variant)

## Summary

- **Flows run: 24. Passed: 24. Failed: 0.** (`flows/results.xml`: `tests="24"
  failures="0"`, total wall time 40m 21s.) **This is the new clean baseline**,
  replacing the 23/23 of 2026-08-16/17 — it adds `c2-multi-symptom.yaml` and is
  the **first full-suite run against the dev variant**
  (`com.tummytracker.app.dev`), closing the shared-infra debt from the
  2026-08-21 variant split (appId/scheme had moved under every flow; only 5 had
  been re-run until now).
- **Scope: full** — `npm run e2e:ci` over `flows/`, plus individual authoring
  verification of the new `c2-multi-symptom.yaml` beforehand (also passed,
  48s in the recorded run).
- **Rungs: green at HEAD** (63 suites / 551 tests) — unchanged this session;
  only `flows/` + docs touched (test sessions don't change features).
- **Device + build:** Pixel 5 (`0A131FDD4006VE`), `com.tummytracker.app.dev`
  re-verified `DEBUGGABLE` before the run. The owner's real journal app was
  never launched, cleared, or installed over.
- **Metro:** cold host (post-reboot; adb daemon started fresh) — Metro started
  for this worktree with `npx expo start --dev-client --port 8081 --clear`
  (clean cache → fresh watcher, per the 2026-08-21 watcher finding), `adb
  reverse tcp:8081 tcp:8081`. Freshness confirmed by a real bundling line
  (`Android Bundled 8731ms … (2494 modules)`) on the first launch. **Left
  running on port 8081 at session end.**

## New flow — `flows/c2-multi-symptom.yaml` (passed first try, no fixes needed)

Covers the 2026-08-24 multi-symptom feature end-to-end on a real SQLite
round-trip: tap **two** symptom chips (Nausea + Bloating) + Severity 3, save
**once** → Journal shows two distinct rows (`entry-row-nausea`,
`entry-row-bloating`) → opening the Nausea row reloads its edit screen with
the shared "Severity 3: Significant". No seeds needed (two entries fit above
the fold in clearState). The companion single-tap flow
(`c-symptom-logging.yaml`) also passed unmodified — one tap still selects on
the multi-select picker, as designed.

## Root causes

None. **Zero flow-bugs and zero app-bugs this run** — every flow passed on its
first recorded attempt, including the 19 flows that had never run against the
dev variant's appId/scheme, and `h-recent-foods.yaml`'s owed re-run on the
2026-08-21 Home nested-scroll layout.

## Per-flow

All 24 passed — timings from the recorded run: 00-launch 17s ·
01b-manual-entry 2m4s · 01c-barcode-fallback 34s · 01d-browse-edit 2m4s ·
01e-reminders 30s · 02-bm-tracking 2m11s · 03-insights 4m5s ·
ab-satfat-ingredients 2m18s · c-symptom-logging 2m14s · **c2-multi-symptom
48s (new)** · checkin-persistence 2m7s · d-ingredient-insights 3m7s ·
e-temporal-insights 1m42s · f-serving-size 1m49s · g-datetime-picker 1m16s ·
goal-editor 2m46s · goals-tally 1m37s · h-recent-foods 2m4s · i-backup 1m42s ·
journal-calendar 1m57s · nav-tabs 37s · settings-smoke 31s · ux3-scan-screen
29s · watchlist 1m32s.

## Addendum — same-day targeted run: `j-component-drilldown.yaml` authored (2026-08-24, later session)

**1/1 passed (recorded, `flows/results-j.xml`) + one confirmation re-run, also
green.** The last unauthored owed flow now exists and covers the whole
meal-component surface in one pass: build a 3-component meal (Rice 200 / Beans
100 / Corn 50 kcal) through the builder's scan-fallback loop → drill into Rice,
servings 1→2, save → row re-aggregates to "Rice · 2× serving · 400 kcal" (parent
tally 550) → swipe-delete Beans (confirm) → editor-Delete Corn (confirm) →
"In this meal" hides at one remaining component, parent Calories 400 → relaunch
→ 400 + hidden section persist. The `'last'`-component refusal is unreachable
from UI (the section hides at 1) and stays Jest-covered.

Two **flow-bugs** found and fixed during authoring (no app bugs):

1. **Wrong journal-row selector assumption.** A multi-component meal's name
   prefills via `defaultMealName` to `"Rice + 2 more"` (first + N more), not
   the joined component names — so the row testID is `entry-row-rice-2-more`.
2. **Swipe start point in the gesture-nav dead zone.** `scrollUntilVisible`
   stopped with the Beans row half-clipped at the bottom screen edge; the
   swipe "completed" without ever reaching the RNGH swipeable (failed 2 of 3
   early runs — the first pass had luckier scroll positioning). Fixed with
   `centerElement: true` + a bounded swipe-repeat; now E2E.md flow-authoring
   gotcha #4. Two consecutive green runs post-fix.

ACCEPTANCE flip: "Meal-component drill-down" → drill-down row `[ ]` → `[x]`
(row text extended to name the delete coverage). **No owed flows remain.**

## Addendum 2 — BM-trends cycle flow (`k-bm-trends.yaml`, 2026-08-24 evening)

**1/1 passed (recorded, `flows/results-k.xml`)** after one review-pass
remediation. Seeds two BMs (Type 4 typical, Type 6 loose) → Insights
"Digestion" section: asserts the exact regularity line ("≈0.1 BMs/day … 1
typical · 0 hard (1–2) · 1 loose (6–7)."), the CountBars a11y summary
(".*2 BMs \\(1 irregular\\).*"), and the fully deterministic BristolHistogram
summary. Screenshot confirmed the stacked bad-portion rendering and both
histogram bars.

**App bug found on-device (class: app-bug, a11y): chart summaries were not
real accessibility nodes.** Both summary assertions failed with the labels
absent from the hierarchy — a plain `View`'s `accessibilityLabel` needs
`accessible` on Android; without it the summaries were inert for TalkBack
too. Fixed at `8872c4e` (the two new charts); the flow re-run passing is
itself proof the fix landed (the assertion only passes with the new code).
The same gap exists in TrendBars/MiniHistogram/BarMeter — spun off as a
follow-up task. Now E2E.md flow-authoring gotcha #5.

**Infra note:** the session's Metro on 8081 became an unkillable orphan
(taskkill Access-denied even unsandboxed) after a host-side stop; per
E2E.md's stale-Metro rule a fresh Metro was started on **8082** and the
reconnect helper's port updated (its documented per-session procedure).
Metro left running on 8082 at session end.

## Addendum 3 — intake-charts cycle flow (`l-intake-charts.yaml`, 2026-08-24 night)

**1/1 passed first try (recorded, `flows/results-l.xml`), fresh-bundle
verified.** Seeds one meal (Toast, Calories 210, Fiber 7) → Insights "Intake"
section: asserts the Calories/Fiber headings and both chart a11y summaries
with deterministic averages ("about 30 kcal per day", "about 1 g per day").
No flow-bugs, no app bugs — the gotcha #4 (scroll landmark below nutrition
fields) and gotcha #5 (`accessible` on chart containers) lessons were baked
into the flow and the HANDOFF respectively, and both paid off.

**Infra:** the unkillable-orphan Metro pattern repeated on 8082 (taskkill
Access-denied even unsandboxed) — this host does not release Metro child
processes; each restart takes the next port (8081, 8082 now both stuck until
a reboot). Fresh Metro on **8083**, helper port updated. Metro left running
on 8083 at session end.

## Addendum 4 — finding-drill-down cycle flow (`m-finding-drilldown.yaml`, 2026-08-24 late)

**1/1 passed on the second run (recorded, `flows/results-m.xml`),
fresh-bundle verified.** Onion seed → tap "See all logs: onion" → detail
screen: 3 rows with dates/sentiment, ≥1 "Rough outcome within 24 h" marker,
row tap-through to Edit entry. One **flow-bug** (no app bugs): the first run
asserted "2 followed by a rough outcome" assuming second-granularity
timestamps, but the entry forms round `loggedAt` to the **minute** — dishes
saved in the same minute share an identical timestamp and the strictly-after
outcome rule correctly skips them, so the exact count is run-dependent. Fixed
by asserting the stable summary parts + at-least-one marker; now E2E.md
gotcha #6. The screenshot doubled as visual confirmation the screen renders
exactly as specced (header = tag, summary, markers, chevron rows).

**Review remediation (before the flow):** tag drill-down matching gated to
food entries (`9478e90`) — parity with how insights/temporal count a tag
finding's occurrences. Rungs after: 69 suites / 612 tests.

**Infra:** orphaned-Metro pattern again; fresh Metro on **8084** (helper
updated; 8081–8083 all held until a host reboot). Left running at session
end.

## Findings for the next planning session

- No app bugs found. The multi-symptom fan-out (one save → one row per
  symptom, shared time/severity/notes) behaves as specced on-device.
- ~~`flows/j-component-drilldown.yaml` remains the only unauthored owed flow~~
  **Authored + verified same day — see the Addendum above. The flow backlog is
  fully clear**; the next full `e2e:ci` run will sweep 25 flows.
- Carried from before (unchanged): root-level React error boundary ·
  "Insights" subtitle heading · the dev-mode "state update on a component that
  hasn't mounted yet" warning (repro with LogBox open still owed).
- Remaining manual/owner rows: `clearState` wipes only `.dev` (owner opens the
  real app after this session and confirms entries intact) · preview-build
  reclaim of `com.tummytracker.app` · the E2E.md manual list (camera,
  notification timing, dark-mode visuals, export content, import round-trip).

## ACCEPTANCE.md changes made

- "Post-MVP · 2026-08-24 release" → "Multi-symptom logging in one instance" →
  all 3 rows `[ ]` → `[x]` (c2 flow, c single-tap regression, Jest
  deselect/empty-selection coverage).
- "Post-MVP · 2026-08-21 release" → "Build-variant split" → "Full Maestro
  suite passes against the dev variant" `[ ]` → `[x]`; "Home tab" →
  `h-recent-foods.yaml` nested-scroll re-run `[ ]` → `[x]`.
- Left `[ ]`: `clearState`-scope + preview-reclaim (manual/owner),
  `j-component-drilldown.yaml` (unauthored), Home visual row (manual).
