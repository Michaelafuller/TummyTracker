# SESSION_HANDOFF.md — resume here (orchestrator / plan session)

> **Read first:** this file, then `docs/PROGRESS.md` (the ranked backlog) and
> `docs/RESULTS.md` (the current test baseline). `CLAUDE.md` is auto-loaded.
> Written 2026-09-27 at the end of a long Opus session (2026-09-26 → 27) so the
> next session can continue without the transcript. `docs/HANDOFF.md` is a
> *different* file: the execute-session spec for Sonnet — it currently holds the
> finished day check-in (GH #13) spec and gets overwritten by the next plan.
> **Updated 2026-09-27 (later session):** GH #13 shipped — see §1/§2.

## 1. Where things stand

- **`main` is pushed and clean** at `8004134` (plus this file's commit).
- **Since then, committed but NOT pushed (2026-09-27):** GH #13 day check-in —
  plan `f905ea1`, Sonnet's five commits `2e77757..42bef65`, three review fixes
  `dcf96c8..e22cdc3`, then docs + `flows/t-day-check-in.yaml`. Rungs,
  `bundle:check` and targeted Jest (14 suites / 179 tests) green. **Device
  check owed** (Android, Metro — no build): see PROGRESS Status.
- **Test baseline (2026-09-27, GitHub #12):** full Maestro **34/34** on the
  Pixel 5 + full Jest **95 suites / 887 tests**, typecheck, lint,
  `bundle:check` all green. **0 app regressions.** Details: `docs/RESULTS.md`.
  Nothing is owed from #12 — every flow is green on the current files.
- **Device:** the Pixel 5 is **disconnected** as of this handoff. The owner
  plans a **targeted** device run of the changed items when it's back — run
  only the flows that touch whatever changed (see §4 for setup).
- **Shipped in that session** (details in PROGRESS "Shipped last cycle"):
  GitHub #1 (re-log + Add item, servings stepper), Journal week-strip fix,
  Medications epic #4–#11 (two cycles), Settings gear + redrawn icon, #2
  keyboard dismissal, the #12 re-baseline + `hideKeyboard` retirement.

## 2. What's next

The ranked backlog is `docs/PROGRESS.md` → "📌 Pinned — next up" (#1–7) and
"Ranked backlog — continued" (#8–19). Each item names its GitHub issue.
**#1 (GH #12) and #2 (GH #13) are done** (#13 still owes its device check),
so the next item is:

- **#3 — Automatic backups + staleness nudge (GH #14).** Plan session first;
  note backup is now **v4** (adds `dayCheckIns`).
- Then #4 work backwards from a bad day (GH #15), #5 quick-win polish (GH #16), …

## 3. How the owner likes to work (confirmed across the session)

- **Opus plans and reviews; Sonnet executes.** Plan → write `docs/HANDOFF.md`
  (must open with a "Read first" line) → launch a Sonnet agent (Agent tool,
  `model: sonnet`) with the handoff + explicit limits → review its diff
  yourself → re-run the checks → device-test → commit review fixes.
  Small items can be done directly (as #2 keyboard was).
- **Standing limits to give Sonnet every time:** targeted Jest only (never the
  full suite unless the item *is* a full run); `(tabs)` test paths via
  `npx jest --runTestsByPath "<path>"` (plain path args silently skip them);
  no Maestro / EAS / `npx expo start`; no edits under `flows/`; no new deps or
  schema changes without owner approval; stage files **by path** (never
  `git add -A`); commit with the §-suggested split; **don't push**.
- **Review earns its keep:** each cycle's review found real bugs (restore
  bound-variable cap, stale doses after an edit, the dev-bubble gear
  collision). Check invariants, then device-test.
- **Tests:** targeted runs are the default; full runs only when the item
  calls for one (~75 min for 34 flows).
- **Git:** commit freely in logical, scoped commits (`Co-Authored-By` line per
  the session's attribution rule); **push only when the owner says so**.
- **GitHub board ("TummyTracker - Kanban", Project 1):** **never move cards.**
  A human moves them (Backlog → In progress → In review → Done). #1, #2,
  #4–#11 sit in *In review* for the owner; #12 is done in code but its card
  is the owner's to move.
- **Communication:** plain-English summaries; lead with the outcome; say
  exactly what was and wasn't verified (especially "Android only").

## 4. Environment notes (Windows host, Git Bash)

- **GitHub CLI:** installed at `C:\Program Files\GitHub CLI`, authenticated as
  Michaelafuller with `project` scope. In Git Bash:
  `export PATH="$PATH:/c/Program Files/GitHub CLI"`.
- **Maestro 2.10.0:** `export PATH="$PATH:$HOME/.maestro/bin"`.
- **Device setup (when reconnected):** `adb devices` (accept the USB-debugging
  prompt if "unauthorized") → `adb reverse tcp:8081 tcp:8081` →
  `adb shell dumpsys package com.tummytracker.app.dev | grep DEBUGGABLE`.
- **Metro:** run in the background:
  `npx expo start --dev-client --port 8081 --clear`, then prewarm:
  `curl "http://localhost:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&minify=false&app=com.tummytracker.app.dev"`.
  **Restart Metro after source edits** — its Windows file watcher can miss
  changes. The first flow after a restart can time out on load; just re-run.
- **Flow authoring rules (all in `docs/E2E.md`):**
  - Dismiss keyboards with `runFlow: _helpers/dismiss-keyboard.yaml`, **never
    `hideKeyboard`** (it's a Back press: can pop a screen or exit from a tab).
    On **Home** (no keyboard toolbar) tap empty space: `tapOn: point: "50%,22%"`.
  - Clear text with per-key `pressKey: Backspace`, not `eraseText` bursts.
  - Type into bottom multiline fields one character per `inputText`.
  - Scrolling to a field's *label*: add `centerElement: true` so the input is
    on screen too.
  - The reconnect helper switches off the dev-client tools bubble on fresh
    installs (it covers the Settings gear).
- **Scratch folder `.qa-shots/`** (gitignored): probe flows and scripts.
  ⚠ **Do not re-run `post_backlog_issues.py --post`** — the 19 issues
  (#12–#30) already exist; re-running would duplicate them.

## 5. Open owner decisions (don't act without an answer)

- Retire `src/app/entry/new.tsx` + `prefillStore.ts` (no callers left)?
- Build sequencing from 2026-08-21: has a preview/production build reclaimed
  the real `com.tummytracker.app` package? (Unconfirmed.)
- iOS verification of #2 (no iOS device/Mac in this environment).
- Closing the finished GitHub issues / moving cards — owner-only.

## 6. Known minor items (already in PROGRESS)

- Jest "worker failed to exit gracefully" warning — a test leaks a timer.
- 4 remaining `eraseText` bursts (`ab-satfat-ingredients`, `f-serving-size`,
  `j-component-drilldown`, `o-watchlist-edit`) — green, but the likeliest flake.
