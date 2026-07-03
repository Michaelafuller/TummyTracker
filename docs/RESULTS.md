# RESULTS.md — Maestro run 2026-07-03 (full regression, 2026-07-02 cycle)

## Summary

- **Flows run: 19 · Passed: 18 · Failed: 1.**
- **Source:** owner-run `npm run e2e` (plain runner, console output). No
  `flows/results.xml` was produced this run — the plain `e2e` script does not pass
  `--format junit`; only `npm run e2e:ci` writes `results.xml`. The `results.xml`
  previously on disk was **stale** (the 2026-06-28 baseline) and was not this run's
  result.
- **Scope:** full regression — mandated because the 2026-07-02 cycle changed shared
  infra (light-mode theme tokens, the scan→entry flow, `EntryRow`, `DateTimeField`)
  plus several flow YAMLs.
- **Build:** fresh dev-client build of `claude/determined-bartik-13b8aa` on the
  Pixel 5 (`0A131FDD4006VE`). Rungs at HEAD: typecheck ✅ lint ✅ 301 Jest ✅
  `bundle:check` ✅.
- **Headline:** best result the suite has ever recorded (the prior "16/19" was never
  a single clean full run). **No failure is a regression introduced by this cycle** —
  see per-flow below.

## Root causes (the point of this file)

1. **`e-temporal-insights` — `assertVisible: "BM"` fails → class `flow-bug`
   (below-fold assertion).** The Insights summary renders as a *single* template
   literal — `insights.tsx:143`: `` `${…} entries · ${…} food · ${…} BM · ${…}
   rated…` `` — i.e. one accessible string node containing "BM" and "food". The BM
   entry does save and is counted (proven independently: `02-bm-tracking` passed this
   same run using the identical BM save + count assertions). The flow scrolls until
   the summary **header** `"Your journal so far"` is visible and asserts it (passes),
   then asserts `"BM"` — but "BM" lives in the summary **data line one row below the
   header**, which can sit just below the fold when the header-targeted scroll stops.
   `assertVisible` does not scroll. This is the TEST_STRATEGY §7 "scroll before
   asserting below-fold content" failure, not an app defect.
   **Fix applied (flow-only):** added a `scrollUntilVisible` on the data-line token
   `"rated"` before the `"BM"`/`"food"` asserts. **Needs a re-run to confirm.** If it
   still fails once the data line is on-screen, the fallback is an app-side `testID`
   on the summary `ThemedText` (the proven pattern from session 4's `EntryRow` testID
   fix) asserted by id — an app change, so it belongs to the next plan→execute pass,
   not a test session.

## Per-flow

| Flow | Result | Class | Note |
|------|--------|-------|------|
| `00-launch` | ✅ | — | |
| `01b-manual-entry` | ✅ | — | cold-start modal save + 500-char notes counter pass on a fresh build |
| `01c-barcode-fallback` | ✅ | — | manual-fallback path (scan now routes to `/meal/component`) |
| `01d-browse-edit` | ✅ | — | |
| `01e-reminders` | ✅ | — | native time-picker (`TimeField`) in Settings |
| `02-bm-tracking` | ✅ | — | count-based Journal assertions; BM save verified here |
| `03-insights` | ✅ | — | insights v2 layout renders findings + framing |
| `ab-satfat-ingredients` | ✅ | — | ingredient text persists (was Group C red at baseline) |
| `c-symptom-logging` | ✅ | — | `testID` entry-row navigation holds |
| `d-ingredient-insights` | ✅ | — | "Ingredients you react to" appears (baseline-relative; seed has the Rice control entry) |
| `e-temporal-insights` | ❌ | flow-bug | below-fold summary assertion; flow fix applied, re-run pending |
| `f-serving-size` | ✅ | — | |
| `g-datetime-picker` | ✅ | — | picker opens; iOS Done-button branch is manual (Android run here) |
| `h-recent-foods` | ✅ | — | searchable `RecentFoodPicker` (search → tap `id: recent-<slug>`) |
| `i-backup` | ✅ | — | export/import no-crash; backup v2 payload |
| `journal-calendar` | ✅ | — | |
| `nav-tabs` | ✅ | — | |
| `settings-smoke` | ✅ | — | |
| `ux3-scan-screen` | ✅ | — | |

## Findings for the next planning session

- **`e-temporal-insights` re-run.** After the flow fix, re-run
  `npm run e2e:flow flows/e-temporal-insights.yaml` on the Pixel 5. If green, the
  suite is 19/19; flip its ACCEPTANCE line. If still red, spec a one-line app change:
  `testID="insights-summary"` on the summary `ThemedText` (`insights.tsx:142-144`)
  and assert `id: "insights-summary"` in the flow. Cite the session-4 `EntryRow`
  testID fix as the precedent that worked.
- **Insights v2 sections are logic/RNTL-verified only.** The new Trend /
  Combinations / confidence-chip / chart rendering has no on-device Maestro coverage
  yet (a `clearState` seed can't deterministically produce a pair finding or a 24 h
  temporal window). "Timing patterns" stays `· manual` per E2E.md. Consider a
  targeted flow that seeds enough same-ingredient low-sentiment meals to force one
  ingredient card + its MiniHistogram, as a rendering smoke test.
- **Meal-builder multi-scan is camera-bound → stays `· manual`.** No flow authored;
  owner must exercise scan → add-next → finish → review → save on-device, and confirm
  migration 0006 applies over a real existing database.
- **Owner on-device visual checks still open:** iOS app icon (EAS build), iOS
  time-picker Done-button feel, light-mode palette look.

## ACCEPTANCE.md changes made

- Flipped the auto items verified this run (Phase 1b/1d/1e, Phase 2 BM, Phase 3
  insights, F/G/H/I, and the Flagship-trio A/B/C/D auto lines) to `[x]`; H reworded
  for the searchable picker.
- `e-temporal-insights`'s summary-count line note updated to "below-fold flow fix
  applied, re-run pending".
- Manual items (camera, notification timing, visual contrast, file-content, import
  round-trip) stay `[ ]`.

---

_Prior run history (2026-06-28 sessions 2–4) is preserved in git; it was trimmed
from this file when the 2026-07-03 full run superseded it as the current result._
