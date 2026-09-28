# HANDOFF.md — Execute session: Elimination experiment, Cycle B, GitHub #19

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§0: synchronous
> repository transactions; the day check-in notification pattern; the
> experiment rules; the real-SQLite test harness). **You are on the Cycle A
> branch (`worktree-agent-a93006f35a36fc943`) in its worktree** — Cycle A is
> reviewed but not merged to `main` yet (the owner's device run uses `main`).
> Commit here; never touch the main checkout.
>
> **Pure JS/TS** — no new dependency, **no schema change**, no new permission
> (notifications are pre-approved), no native change, no EAS build.

**Planned 2026-09-28 (Opus plan session) — GitHub
Michaelafuller/TummyTracker#19, Cycle B.** Owner: "proceed with Cycle B" on
the split agreed 2026-09-27: phase-change notifications, past-experiment
history, experiments in the PDF, polish. Plan-session defaults (flag in the
summary; owner may override): reminders fire at **09:00 local**; starting an
experiment **requests notification permission** (it's a direct user action)
but the experiment starts either way.

---

## 0. Invariants — read twice

- **A notification is never a record.** Tapping one opens the app; it never
  logs a dose/food, never marks a challenge day eaten, never finishes an
  experiment.
- **Own slot, own cancel.** Experiment notifications use
  `data.slot = 'experiment-phase'`; cancel/refresh filter on that slot only
  (reminders, Goals check-in and day check-in are untouched — same test as
  #13's `dayCheckInService`).
- **Refreshes are serialized** (the #13 review bug: overlapping
  cancel-then-schedule doubled the horizon). Reuse the same queue pattern as
  `refreshDayCheckIn`.
- **Scheduling never requests permission** — only `startExperiment`'s screen
  does, once, at the moment the user starts.
- **Frozen verdicts stay frozen** — history and the PDF read `verdictJson`
  for completed experiments; they never re-evaluate a finished one.
- **The engine does not change** (`src/features/experiments/engine.ts`
  verdict rules, `src/features/analysis/*`).
- Every user-authored string in the PDF goes through `escapeHtml`.
- Stage files by path; no `await` inside a `db.transaction` callback.

## 1. Phase notifications — `src/features/experiments/experimentNotifications.ts`

Pure model (`experimentNotificationsModel.ts`, no expo import):

```ts
export const EXPERIMENT_SLOT = 'experiment-phase';
export const REMINDER_HOUR = 9;
export interface PlannedNotification { fireAt: Date; title: string; body: string; kind: 'challenge' | 'observation' | 'ready'; dayKey: string }
/** Every reminder for this experiment's schedule, at 09:00 local on:
 *  each challenge day ("Challenge day 2 of 3: eat <term> once today and log it"),
 *  the first observation day ("Back to avoiding <term> — keep logging for 3 more days"),
 *  and the day after the last observation day ("Your <term> experiment is ready — see the verdict").
 *  Only fire times strictly after `now` are returned. */
export function plannedExperimentNotifications(exp: ExperimentLike, now: number): PlannedNotification[]
```

Service (mirrors `src/features/checkin/dayCheckInService.ts`):

- `refreshExperimentNotifications()` — serialized; cancel every scheduled
  notification with our slot; if there's an active experiment, schedule each
  planned one (`SchedulableTriggerInputTypes.DATE`, `CHANNEL_ID`),
  `data: { slot, experimentId, kind, dayKey }`. No active experiment → just
  the cancel. Never requests permission; if permission isn't granted,
  scheduling simply no-ops (check `getPermissionsAsync().granted` first).
- Call it: in `MigrationGate`'s success effect (next to the other refreshes);
  after `startExperiment`, `abandonExperiment`, `finishExperiment` (from the
  screens — fire-and-forget); after a backup import (Settings).
- Start screen: after a successful start, call
  `ensureNotificationPermission()`; if declined, the experiment screen shows
  a `textSecondary` hint "Turn on notifications to get a reminder when each
  phase starts." (only while active and permission isn't granted).
- **Tap handling:** extend the Home-mounted response handling (see
  `useDayCheckInResponses`) with a sibling hook `useExperimentNotificationResponses()`:
  a default-action tap on one of ours → `router.push('/experiment/<id>')`
  once per notification id, then `clearLastNotificationResponse()`. A tap
  for an experiment that no longer exists or isn't active → do nothing.
  Must not interfere with the day check-in hook (both read the same "last
  response"; each ignores the other's slot).

## 2. History

- `src/app/experiment/history.tsx` (title "Experiments"): every experiment,
  newest first — term, date range (`formatDayRange(startDate, lastDay)`),
  status line: completed → frozen verdict headline + confidence
  ("Likely a trigger · medium"); abandoned → "Ended early"; active →
  `phaseStatusLine`. Tap → `/experiment/<id>`. Empty state "No experiments yet."
- Insights → Watchlist item: under the stats line, the **latest finished**
  experiment for that term, if any: "Last experiment: Likely a trigger ·
  medium (Oct 17)" → opens it. Keep the Cycle A "Start experiment" /
  "Experiment running" links as they are.
- Insights → a "Past experiments" link (`accessibilityLabel="See past
  experiments"`) under the Watchlist section, shown when ≥ 1 experiment exists.
- Hook: `useExperiments()` (all, newest first) in `useExperiments.ts`.

## 3. PDF report — `src/lib/report.ts`

- `buildReportHtml(entries, now, rangeDays, medications?, experiments?)` —
  optional 5th param, same pattern as #17 (omitted → output unchanged).
- **Experiments section** (after Medications, before Journal), only when
  experiments were passed and at least one **overlaps the report range**
  (its schedule from `startDate` to `lastDay` intersects the window) or is
  active:
  - One sentence first: "Elimination experiments the user ran. Verdicts are
    observations from their own logs, not diagnoses."
  - Table: **Tested** (term) · **Dates** ("Sep 28 – Oct 17") · **Status**
    (Completed / Ended early / In progress — <phase>) · **Result**
    (completed: headline + confidence + `verdictRatesSentence`; otherwise "—").
  - Completed rows read the frozen `verdictJson` only.
- `settings.tsx` report handler passes `listAllExperiments()`.

## 4. Device-test fixture — `scripts/make-experiment-fixture.mjs`

A dependency-free Node script (ESM, like `generate-icons.mjs`) that writes a
**backup v5 JSON** to a path given as its first argument (default
`.qa-shots/experiment-ready-backup.json`, gitignored). Dates are computed
**relative to the day it runs**, so the owner can generate it just before a
device run:

- A **completed-able** experiment on `lactose`, `status: 'active'`,
  `startDate` = 21 days ago, 14/3/3 protocol → phase `ready` today.
- Log entries producing a clear **likely-trigger** verdict: baseline days each
  with a lactose-tagged meal (`tagsJson: ["lactose"]`) and a bad-Bristol BM on
  10 of 14; elimination days each with a non-lactose meal, no outcomes;
  challenge days with a lactose meal + a bad BM on 2 of 3; observation days
  with a meal + a bad BM on each.
- Stable ids prefixed `fixture-` so a re-import skips duplicates.
- A Jest test imports the script's pure builder (export it as a function the
  script's CLI wrapper calls) and asserts: the JSON parses with
  `parseBackupJson`, and `evaluateExperiment` on the parsed data with today's
  key returns `kind: 'likely-trigger'`.
- The script prints the exact `adb push` command for the owner to run (it
  does not run adb itself).

## 5. Polish

- Home row when the experiment is `ready`: "Lactose experiment · Verdict
  ready" (if Cycle A doesn't already) — check and leave it if it does.
- Anything else you notice: list it in the summary, don't do it.

## 6. Tests (same change)

- Model: fire times for every phase boundary (incl. DST-crossing), none in
  the past, copy strings, empty for a finished schedule.
- Service (mock expo-notifications like `dayCheckInService.test.ts`): cancels
  only its slot; schedules the planned set with `data`; overlapping refreshes
  schedule once (stateful fake — copy #13's serialization test); no active
  experiment → cancel only; permission not granted → no schedule calls.
- Response hook: tap on ours pushes the route once and clears; other slots
  ignored; inactive/missing experiment ignored.
- History screen, watchlist "Last experiment" line, "Past experiments" link.
- Report: section present/absent rules, overlap rule, frozen verdict used
  even when entries would now evaluate differently, escaping of the term.
- Fixture builder test (§4).
- Settings: report passes experiments; import triggers a notification refresh.

## 7. Definition of done

- `npm run typecheck`, `npm run lint` (0 warnings), `npm run bundle:check`.
- **Targeted Jest only (never the full suite):** every test file you created
  or touched + `report`, `backup`, `settings`, `index`, `insights`,
  `dayCheckInService`, `useDayCheckInResponses`, all
  `src/features/experiments/__tests__/*`, `src/app/experiment/__tests__/*`.
  `(tabs)`/`[id]`/settings paths via `npx jest --runTestsByPath "<path>"`.
- No `@ts-ignore`, no lint disables, no `any` without `// reason:`, no new
  deps, no schema change, no new permission.
- Do NOT run Maestro, EAS, `npx expo start` or `adb`. Do NOT edit `flows/`,
  `CLAUDE.md` or `docs/`. Keep LF line endings. Don't push, don't merge.
- Commits (stage by path), suggested split:
  `feat(experiments): phase reminder notifications + tap-to-open` ·
  `feat(experiments): experiment history and last result on the watchlist` ·
  `feat(report): experiments section in the doctor PDF` ·
  `test(e2e): backdated experiment fixture generator for device checks` —
  each ending `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Execute summary: files per commit, hashes, rung results, targeted Jest
  counts, the planned-notification list for a sample experiment (pasted from
  a test), deviations with reasons, polish items noticed, review pointers.

## 8. After this (review + test session)

- Opus review; CLAUDE.md §0 note (experiment notifications), PROGRESS.
- Flow (Opus): generate the fixture → `adb push` → Settings → Import →
  pick the file → Home row "Verdict ready" → experiment screen verdict
  "Likely a trigger" → Finish → history shows it → watchlist "Last experiment".
- Merge Cycle A + B to `main` after the owner's #13–#18 device run.
