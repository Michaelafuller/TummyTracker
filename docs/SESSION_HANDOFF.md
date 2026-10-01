# SESSION_HANDOFF.md — resume here (orchestrator / plan session)

> **Read first:** this file, then `docs/OWED.md` (everything the owner owes —
> keep it current) and `docs/PROGRESS.md` (the ranked backlog). `CLAUDE.md`
> is auto-loaded — its §0 holds every design decision made below.
> `docs/HANDOFF.md` is a *different* file: the execute-session spec for
> Sonnet; it holds the last cycle's spec (#23) and is overwritten each plan.
> Written 2026-09-30 at the end of the 2026-09-27 → 30 session.

## 1. Where things stand — read carefully

- **Two places hold the code:**
  - `main` (the main checkout, `C:\Users\E146796\projects\TummyTracker`) =
    `f6e6593`, through **#18**, **3 docs/flow commits ahead of `origin/main`**
    (not pushed). This is what the owner's pending device run (#13–#18)
    expects — **don't change app code on `main` until that run is done.**
  - **Branch `worktree-agent-a93006f35a36fc943`** in the git worktree
    `C:\Users\E146796\projects\TummyTracker\.claude\worktrees\agent-a93006f35a36fc943`
    (its `node_modules` is a junction to the main checkout's) =
    **#19 (A + B), #20, #21, #22, #23, #24**, all reviewed, unmerged, unpushed.
    Migrations 0011 + 0012; backups v6. **This is where the burn-down
    continues** — and where the newest `docs/` live (main's copies are
    stale; `docs/RESUME_HERE.md` on `main` points here).
- **Owner's instruction (2026-09-30):** keep burning down the backlog on the
  branch; **defer all device work** to `docs/OWED.md` and tackle it once the
  backlog is done. Don't lose any owed item.
- **Verification state:** every cycle on the branch passed typecheck, lint
  (0 warnings), `bundle:check` and **targeted** Jest. No full `npm test` on
  the branch yet — do one at the merge (OWED §2).

## 2. What's next

Backlog: `docs/PROGRESS.md` → "Ranked backlog — continued" (GitHub #24–#30).
Done so far this burn-down: #13–#24. **Next: #14 — saved recipes / "my
meals" with ingredients (GH #25)**, then #15 faster logging
(GH #26), #16 optional app lock (GH #27 — ⚠ likely a new dependency,
`expo-local-authentication`: owner approval + CVE check), #17 medication
adherence view (GH #28), #18 medication reminders (GH #29), #19 iOS pass
(GH #30 — owner-only, no Mac here; goes to OWED.md).

When the backlog is done: walk the owner through `docs/OWED.md` in order
(§1 on `main` → merge → §3 on merged `main`), fixing flow-side issues as
they come up.

## 3. The loop (owner-confirmed: "same as before")

1. **Plan (Opus):** read the issue (`gh issue view <n>`) + the code it
   touches; for anything with real design choices, **bounce ideas off the
   owner** — a short sketch of the approach and its trap, then
   `AskUserQuestion` with 2–4 options each, recommendation first. Schema
   changes and new dependencies always need an explicit owner answer
   (CLAUDE.md §9). Then write `docs/HANDOFF.md` (opens with "Read first",
   records the owner's decisions and any plan-session judgment calls to flag)
   and commit it on the branch.
2. **Execute (Sonnet):** `Agent` with `model: sonnet`, background, **no
   isolation flag** (it works in the existing worktree), with the standing
   prompt below.
3. **Review (Opus):** read the diff (engine logic and invariants first); re-run
   typecheck, lint, bundle:check and the targeted suites yourself; for every
   fix, write a test and **prove it fails on the pre-fix code** (swap the old
   file in from git, run, swap back). Reviews found real bugs in most cycles.
4. **Close out:** extend the device fixture (`scripts/make-experiment-fixture.mjs`
   + its Jest test) or add a flow so the feature has a device check; update
   CLAUDE.md §0 (and §6 for schema), PROGRESS (Shipped + backlog row), this
   file, and **`docs/OWED.md`**; commit. Report to the owner in plain English:
   outcome first, what review found, exactly what was and wasn't verified.

**Standing Sonnet prompt essentials:** work only in the worktree path, never
the main checkout; confirm clean `git status` + expected `git log -1` first;
read `docs/HANDOFF.md`; targeted Jest only (never the full suite), with
`(tabs)`, `[id]` and `settings.test.tsx` paths via
`npx jest --runTestsByPath "<path>"`; typecheck + lint (0 warnings) +
bundle:check clean; no Maestro / EAS / `expo start` / `adb`; don't edit
`flows/`, `CLAUDE.md`, `docs/`; no deps / schema / permissions beyond the
spec (stop and report); no `@ts-ignore` / eslint-disable / bare `any`;
UTF-8 + LF when writing files by script; stage by path; commit each piece as
soon as its tests pass (`Co-Authored-By: Claude Sonnet 5
<noreply@anthropic.com>`); don't push or merge; reply with the HANDOFF's
execute summary.

**If an execute session dies** (it happened once — a network error): check
`git log`/`git status` in the worktree; nothing partial → relaunch the same
prompt with "a previous attempt died; start fresh at <hash>".

## 4. Working agreements

- **Git:** commit freely in logical, scoped commits (`Co-Authored-By: Claude
  Opus 5.5 <noreply@anthropic.com>` for the orchestrator); **push only when
  the owner says so**; merge the branch only on the owner's word (OWED §2).
- **GitHub board ("TummyTracker - Kanban", Project 1): never move cards or
  close issues** — the owner does (listed in OWED §5).
- **Communication:** plain English, outcome first; say exactly what was and
  wasn't verified (targeted vs full Jest, Android-only, device vs Jest).
- **Engine invariants that recur:** existing numbers never change unless the
  item is about them; missing data is never a confirmed negative; wording
  never claims causation or safety; day math by local calendar day; repository
  transactions synchronous.

## 5. Environment notes (Windows host, Git Bash)

- **GitHub CLI:** `C:\Program Files\GitHub CLI`, authenticated as
  Michaelafuller with `project` scope. In Git Bash:
  `export PATH="$PATH:/c/Program Files/GitHub CLI"`.
- **Maestro 2.10.0:** `export PATH="$PATH:$HOME/.maestro/bin"`.
- **Device setup:** `adb devices` (accept the USB-debugging prompt if
  "unauthorized") → `adb reverse tcp:8081 tcp:8081` →
  `adb shell dumpsys package com.tummytracker.app.dev | grep DEBUGGABLE`.
- **Metro:** `npx expo start --dev-client --port 8081 --clear` (background),
  then prewarm:
  `curl "http://localhost:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&minify=false&app=com.tummytracker.app.dev"`.
  Restart Metro after source edits (the Windows watcher can miss changes);
  the first flow after a restart can time out — just re-run.
- **Typed routes:** `.expo/types/router.d.ts` (gitignored) only regenerates
  under `expo start`; a new route may need a local hand-patch for `tsc` on a
  machine that hasn't run Metro since. Never commit it.
- **Flow rules (`docs/E2E.md`):** dismiss keyboards with
  `_helpers/dismiss-keyboard.yaml`, never `hideKeyboard`; on Home tap empty
  space `point: "50%,22%"`; clear text with per-key `Backspace`; type bottom
  multiline fields one character per `inputText`; `centerElement: true` when
  scrolling to a field label; give a control a `testID` when its label text
  repeats (e.g. a switch and its caption).
  **Regex escapes inside double-quoted YAML need a double backslash**
  (`"Protein \\(g\\)"`); a single one (`\.`, `\(`, `\?`) is an invalid YAML
  escape and the whole flow fails to load. Check a new flow with
  `node -e "require('js-yaml').loadAll(require('fs').readFileSync('<flow>','utf8'))"`.
- **Scratch `.qa-shots/`** (gitignored). ⚠ Never re-run
  `post_backlog_issues.py --post` — issues #12–#30 already exist.

## 6. Known minor items

- Jest "worker failed to exit gracefully" — a test leaks a timer.
- 4 `eraseText` bursts left in flows (`ab-satfat-ingredients`,
  `f-serving-size`, `j-component-drilldown`, `o-watchlist-edit`).
- `npx eslint .` (not `npm run lint`) reports `no-undef` for `output` in
  `flows/_helpers/control-date.js` / `trigger-times.js` (Maestro globals).
