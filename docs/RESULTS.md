# RESULTS.md — Maestro run 2026-08-21 (test-execute: targeted Goals + smoke, first dev-variant run)

## Summary

- **Flows run: 5. Passed: 5. Failed: 0.** (One flow-bug hit and fixed
  in-session during individual authoring/verification before the recorded
  run — see Root causes below. The recorded `flows/results.xml` run is a
  clean 5/5.)
- **Scope: targeted** — Goals flows + launch smoke on the newly-split dev
  variant, per `docs/HANDOFF.md`. Flows: `00-launch`, `goals-tally`,
  `goal-editor`, `checkin-persistence`, `nav-tabs`. **The full regression
  (`npm run e2e:ci`) is still owed** — deferred to a later session, after the
  owner's iOS deployment, per HANDOFF's explicit scope note.
- **Rungs: green.** `npm run typecheck` ✅ `npm run lint` ✅ `npm test` ✅.
  No app source was touched this session (test sessions don't change
  features) — only `flows/*.yaml` and these three docs.
- **Device + build:** Pixel 5 (`0A131FDD4006VE`), package
  `com.tummytracker.app.dev` (the `development`-profile dev client,
  `DEBUGGABLE` confirmed by the plan session). `com.tummytracker.app` (the
  owner's real journal) was never launched, cleared, or installed over.
- **Metro:** started fresh for this worktree on **port 8081** (this worktree
  had no `node_modules` — `npm install` was run first, ~1100 packages, 42s —
  then `npx expo start --dev-client --port 8081`, `adb reverse tcp:8081
  tcp:8081`). Left running at the end of this session on port 8081.
- **`flows/results.xml` written:** 5 testcases, 0 failures, total flow time
  462s (`maestro test flows/ --include-tags goals,smoke --format junit
  --output flows/results.xml`).

## The reconnect helper vs. the dev variant (first-ever run)

This was the first Maestro run of any kind against `com.tummytracker.app.dev`
and its `tummytracker-dev://` deep link. **It worked on the first try, no
diagnosis steps needed.** `npm run e2e:flow flows/00-launch.yaml` — run
immediately after editing the helper's hardcoded port (8084 → 8081) and
before authoring anything else, per HANDOFF §1.1 — passed clean:
`Development Build` → `openLink tummytracker-dev://expo-development-client/
?url=http%3A%2F%2Flocalhost%3A8081` → `TummyTracker` home screen, all in one
shot. Metro's log confirmed freshness with a real bundling line (`Android
Bundled 9597ms node_modules\expo-router\entry.js (2406 modules)`) on that
same launch, so this is a genuine fresh-JS run, not a stale-embedded-bundle
false positive. The variant split (`app.config.ts`'s inlined
`resolveAppIdentity`, `com.tummytracker.app.dev` appId, `tummytracker-dev://`
scheme) is confirmed working end-to-end on-device.

`maestro test flows/ --include-tags smoke` was also verified once (HANDOFF
§1.2) — it correctly scoped to the single `smoke`-tagged flow (`00-launch`,
1/1 passed in 18s) rather than sweeping the whole untagged `flows/`
directory, so `--include-tags` works as expected on Maestro 2.6.1 for this
project's directory layout (including the `_helpers/` subfolder, which holds
no top-level flow files and caused no issue).

## Root causes (the point of this file)

### 1. `goals-tally.yaml` drill-to-entry assertion — below-fold. Class: `flow-bug`. FIXED.

The new drill-down coverage's last step (`tapOn: "Open Tally Test Meal"` →
`assertVisible: "Save changes"`) failed on the first authored attempt. The
debug screenshot showed the edit-entry screen had opened correctly — header
"Edit entry", "Tally Test Meal" populated in Name, sentiment emoji row,
Notes counter all present — but `Save changes` (the `LogEntryForm`
`submitLabel`, `src/app/entry/[id].tsx:143`) sits inside the same
`ScrollView` further down the form, off-screen at the point the assertion
ran. This is the same below-fold shape already documented in `E2E.md`'s
flow-authoring gotchas (§ "Always scroll to a landmark..."), just at a new
call site. Read `src/app/entry/[id].tsx` before classifying — confirmed the
button exists and renders unconditionally once `entry` loads; nothing in the
component is broken. **Fix:** added `scrollUntilVisible: element: text: "Save
changes", direction: DOWN` before the assertion. Re-run passed clean.

No other failures occurred — `goal-editor.yaml` and `checkin-persistence.yaml`
(unmodified this session, aside from the shared reconnect-helper port edit)
both passed on their first individual run against the new tally
header/row structure, confirming the Goals-screen "Today" + long-date header
change (HANDOFF §0) didn't regress goal thresholds, the cap-notice review
flow, or check-in persistence. `nav-tabs.yaml`'s Goals-tab assertion
(`"Goals"`, now sourced from `GoalsSection`'s heading rather than the page
header) also passed first try — comment updated to reflect the new source,
assertion text unchanged since both the old page header and the new
`GoalsSection` heading render the literal string `"Goals"`.

## Per-flow

| Flow | Result | Class | Root cause # |
|------|--------|-------|--------------|
| `00-launch` | PASS (18s) | — | — |
| `goals-tally` | PASS (99s) — 1 fix during authoring | flow-bug | 1 |
| `goal-editor` | PASS (172s) | — | — |
| `checkin-persistence` | PASS (133s) | — | — |
| `nav-tabs` | PASS (40s) | — | — |

## Findings for the next planning session

- No app bugs found. The Goals-tab drill-down feature (`src/app/(tabs)/goals.tsx`
  — expand/collapse per-nutrient rows via `tally-row-<field>`, sub-rows via
  `tally-item-<entryId>` with `"Open <name>"` labels, "no data" disclosure,
  tap-through to `/entry/<id>`) behaves exactly as specced against a real
  device and a real SQLite round-trip.
- The variant split is now verified on-device, closing the last open risk
  named in `ACCEPTANCE.md`'s "Build-variant split" section for the automated
  half of that checklist (see ACCEPTANCE.md changes below). The remaining
  rows there (`clearState` only wiping `.dev`, full suite, preview-build
  reclaim) are manual/full-run items already correctly scoped as such.
- **Full regression is still owed** — targeted scope only ran 5 of ~24 flows.
  Every other flow file still has appId/scheme baked in from before the
  variant split and has never been run against `.dev`; per the shared-infra
  rule (`TEST_STRATEGY.md §6`) this should happen before the next EAS build
  or as the dedicated full-run session HANDOFF already anticipates.
- `flows/j-component-drilldown.yaml` (meal-component drill-down) and the
  Home-layout re-run of `flows/h-recent-foods.yaml` remain unauthored/owed
  per `ACCEPTANCE.md`'s "Meal-component drill-down" and "Home tab" sections —
  out of scope for this targeted session, noted here so the next full-run
  session doesn't lose track.

## ACCEPTANCE.md changes made

- Flipped, from the green `flows/results.xml` testcases above:
  - "Post-MVP · 2026-08-21 release" → "Build-variant split" →
    `_helpers/reconnect-dev-client.yaml` reconnects the dev-variant client...
    `[ ]` → `[x]`.
  - "Post-MVP · 2026-08-21 release" → "Goals tab — tally drill-down, 'Today'
    header, long date" → all 5 rows `[ ]` → `[x]` (header/long-date,
    expand/collapse, "no data" disclosure, tap-through to edit screen, and
    goal-editor/check-in/nav-tabs still passing on the new structure).
- Every other row (full-suite, `clearState` scope, preview-build reclaim,
  component drill-down, Home layout) left `[ ]` — not covered by this
  targeted run.
