# OWED.md — everything the owner owes (device runs, manual checks, decisions)

> **Read first:** this is the single list of work deferred to the owner while
> the backlog is burned down (owner, 2026-09-30: "we'll tackle them once
> we've burned down the backlog"). **Add to it every cycle; never drop an
> item without the owner confirming it's done.** Run order matters: §1 on
> `main` *before* the merge, then §2, then §3 on the merged `main`.
> Device setup and flow-authoring rules: `docs/SESSION_HANDOFF.md` §4.

Status at a glance (2026-09-30):

- `main` = `f6e6593`, **3 commits ahead of `origin/main`** (`b2e3c66` flows for
  #16–#18, `39224e7` the #19 Cycle A plan, `f6e6593` `docs/RESUME_HERE.md`) —
  docs/flows only, not pushed. The merge won't be a fast-forward (main has
  `f6e6593`), but it can't conflict: RESUME_HERE.md is a new file — delete it
  in the merge.
- Branch `worktree-agent-a93006f35a36fc943` (worktree
  `.claude/worktrees/agent-a93006f35a36fc943`) = #19–#26 on top of
  `39224e7`, reviewed, **unmerged, unpushed**; adds migrations **0011**
  (`experiment`), **0012** (`day_factor`) and **0013** (`saved_meal`,
  `saved_meal_component`), **0014** (`medication.is_regular`) and backups
  **v5 → v8**.
- Device: Pixel 5, dev client = the 2026-08-29 EAS development build. All
  #13–#26 work is JS + migrations — **no new build needed**.
- Last device baseline: 34/34 Maestro on 2026-09-27. Last full Jest: 113 /
  1,168 on `main` (2026-09-27). The branch has only had targeted Jest since.

## 1. On `main`, before the merge — #13–#18

Flows (written while the phone was disconnected — expect small flow-side
fixes on the first run):

```
maestro test flows/t-day-check-in.yaml flows/u-backup-nudge.yaml flows/v-what-came-before.yaml flows/q-reuse-adjust.yaml flows/s-medication-entry.yaml flows/y-scan-no-camera.yaml flows/w-report-medications.yaml flows/x-atomic-saves.yaml --format junit --output flows/results-new.xml
```

Cheap regression guards worth adding to that run: `g-datetime-picker`,
`h-recent-foods`, `nav-tabs`.

Manual (by hand on the phone):

- [ ] **#13 day check-in:** Settings → Day check-in on, time 1–2 min ahead,
      background the app, tap **Rough day** in the shade → app opens, Home
      card shows "Rough day noted."; notification gone.
- [ ] **#14 automatic backups:** choose a folder (e.g. Documents/TummyTracker)
      → a `tummytracker-auto-*.json` appears; relaunch same day → no second
      file; move the phone's date +1 day → a new file (restore the date);
      with 8+ auto files the oldest auto one is pruned and other files are
      untouched; import an auto file via Settings → Import data.
- [ ] **#16 pickers:** every date/time picker — entry edit, meal review, BM,
      symptom, medication entry + inventory dates, Settings/Goals time chips —
      pick, cancel, pick again (moved off the deprecated `onChange`).
- [ ] **#16 camera denied:** "Enter manually" from Home Scan and from meal
      review's "Add item" (also `y-scan-no-camera`).
- [ ] **#17 PDF:** two meds (one custom unit, one inactive with an old dose)
      + one active with none → Create PDF, 30 days → Medications table ("N of
      30", "No doses logged in this range", amounts), dose rows in the Journal
      by time, no "missed"/"skipped" anywhere.

Then tell the orchestrator → it merges the branch into `main` (§2).

## 2. Merge (the orchestrator does this, on the owner's word)

- [ ] Merge `worktree-agent-a93006f35a36fc943` into `main` (a normal merge —
      `main` has `f6e6593` and maybe §1 flow fixes); delete
      `docs/RESUME_HERE.md`; re-run typecheck,
      lint, a **full `npm test`** (first full run since 113/1,168) and
      `bundle:check` on `main`; record in `docs/RESULTS.md`.
- [ ] Owner: **push** when happy.

## 3. On the merged `main` — #19–#26

Flows:

```
maestro test flows/z-experiment-start.yaml flows/zc-day-details.yaml flows/zd-my-meals.yaml flows/ze-faster-logging.yaml --format junit --output flows/results-19-26.xml
```

Verdict path (backdated fixture — covers #19, #20, #21 and #23 in one import):

```
node scripts/make-experiment-fixture.mjs
```

then run the `adb push` command it prints, then (`zb-` also checks the #24
chance lines — the lactose card should say "could easily be chance"; that
is the intended, honest result for this fixture):

```
maestro test flows/za-experiment-fixture-import.yaml flows/zb-experiment-verdict.yaml
```

`za-` drives the system file picker (best guess for the Pixel's
DocumentsUI — if it doesn't match, import the file by hand: Settings →
Import data → Downloads → `experiment-ready-backup.json`, then run only
`zb-`). Import the fixture **once** (log entries are re-minted on import).

Manual:

- [ ] **#19 reminders:** start an experiment; with notifications allowed,
      the 09:00 phase reminders (challenge days, first observation day, ready
      day) — tap one → opens the experiment. (Real dates; check whenever a
      phase boundary falls, or temporarily set the device clock.)
- [ ] **#19 PDF:** "Elimination experiments" table (term, dates, status,
      frozen verdict).
- [ ] **#26 reminders, by hand:** Settings → a breakfast reminder 1–2 min
      ahead → tap the notification → "Log breakfast" opens; tap a saved
      meal → review shows Breakfast selected; "Add an entry manually" from
      there → the review also has Breakfast. A reminder that was scheduled
      before this update should do the same (no reschedule needed).
- [ ] **#26 regular meds next day:** log with one tap, leave the app
      overnight → next morning the Meds tab shows the button again, no
      stale Undo.
- [ ] **#25 My meals, by hand:** the My meals list on Home with 4+ saved
      meals (it shows ~3 rows and scrolls inside itself — check it doesn't
      fight the Recent list's scrolling); "Save as my meal" with a name you
      already saved → Replace; an item's name on review → edit its
      ingredients → Save item; export a backup and import it on top (no
      duplicate saved meals).
- [ ] **#24 chance line, by eye:** on your real journal, every finding card
      has a "Chance check: …" line under its confidence chip, and Insights
      doesn't feel slower to open (the check re-runs the analysis ~30× per
      section; Node measured ~200–350 ms for a synthetic year — the Pixel 5
      may be a few times slower). If it lags, tell the orchestrator.
- [ ] **#22 dose line:** Jest-only (the fixture logs 1 serving everywhere) —
      optional by hand: log one food 4× at 1 serving and 4× at 2 servings with
      outcomes after the larger ones → card line "More than 1 serving: …".

## 4. Carried items (not from this burn-down)

- [ ] **iOS pass (GH #30)** — no iOS device/Mac here: #2 keyboard items
      (Done on a number pad, tap-outside on Home, drag-to-dismiss), iOS app
      icon, time-picker Done feel, plus every feature since (all Android-only
      verified).
- [ ] Light-mode walkthrough; camera scan loop; the manual items in
      `docs/E2E.md`.
- [ ] **Build variant (2026-08-21, unconfirmed):** has a preview/production
      build reclaimed the real `com.tummytracker.app` package for the owner's
      journal (dev client stays `…app.dev`)? Confirm or re-pin.

## 5. GitHub housekeeping (owner-only — the agent never moves cards)

- [ ] Close / move to Done: **#1, #2, #4–#11** (2026-09-26 session), **#12**,
      **#13–#18** (after §1), **#19–#26** (after §3), and #27+ as they ship.

## 6. Decisions the owner may want to revisit (made as plan defaults)

- Experiments: a "rough" check-in counts as a rough day for experiments
  only (the correlation engine ignores check-ins). Phase reminders fixed at
  09:00.
- Medications (#20) / factors (#23): rough day = logged outcome only; a
  factor-only day counts as "covered".
- Factors (#23): flagged = stress 4–5, poor sleep, any alcohol (that day and
  the next), "more" caffeine, period.
- Slower patterns (#21): a key that was only a hidden low-confidence 24 h
  signal can appear as a 48 h slower pattern.
- Faster logging (#26): time-of-day slots 05–11 breakfast, 11–16 lunch,
  16–22 dinner (none at night); a meal opened from a reminder's quick log
  takes that meal slot even if it was saved for another; "Took my regular
  meds" saves at once (no confirm) with Undo until you leave the screen.
- Saved meals (#25): names unique ignoring case (a clash asks Replace);
  backfill targets only past same-name meals with no ingredient tags and
  never overwrites existing ingredient text (a name-only meal's text is its
  item name, so it stays); restore keeps the device's template on a clash;
  My meals sorted A–Z.
- Chance check (#24): "this strong" = the card's tier or better; slides
  start 3 days from zero (a long rough streak overlapping a food eaten in
  a block still lines up at small slides, so the estimate errs high — the
  safe direction); needs ≥ 15 logged days; flag when the rounded expected
  count ≥ found; Insights only (not the PDF or the detail screen).
