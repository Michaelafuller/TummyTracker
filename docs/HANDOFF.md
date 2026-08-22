# HANDOFF.md — Test-execute session: Goals flows on the new dev variant (targeted)

> **Read first:** `CLAUDE.md` (auto-loaded) + **`docs/E2E.md`** (the run protocol,
> the coverage table you must update, and the three findings that shaped every
> flow: dev-client reconnect, full-regex text matching, keyboard-covers-list).
> Then `docs/TEST_STRATEGY.md §4` for the `RESULTS.md` template and failure
> classes. Device is attached and the owner has installed the **dev-variant**
> build — this is the first Maestro run ever against `com.tummytracker.app.dev`.

**Planned 2026-08-21 (Fable test-plan session).** Scope is **targeted**, not
full: the Goals flows plus the launch smoke. The full regression (owed by the
shared-infra rule — appId/scheme changed under every flow) and the
component-drill-down / Home-layout flows are a **later** session, after the
owner's iOS deployment. Do not run `npm run e2e` / `e2e:ci` over the whole
`flows/` directory this session.

---

## 0. Verified state (plan session, over USB, 2026-08-21)

- `adb devices` → Pixel `0A131FDD4006VE`. `pm list packages` shows **both**
  `com.tummytracker.app` (the owner's real journal — **never touch it**) and
  `com.tummytracker.app.dev` (flags `DEBUGGABLE` — a real dev client that loads
  JS from Metro). `clearState` on the `.dev` appId is therefore safe.
- **No Metro is running and no `adb reverse` is set.** Ports 8080–8089 are
  free. Maestro 2.6.1 on PATH.
- `flows/_helpers/reconnect-dev-client.yaml` deep-links with the dev scheme
  (`tummytracker-dev://…`) but still hardcodes **port 8084** from the last
  session — you will change it (§1.1).
- App-side facts the new assertions depend on (`src/app/(tabs)/goals.tsx`):
  header `"Today"` + `formatLongDate(now)` (`"August 21, 2026"` style); each
  tally row is a `Pressable` with `testID="tally-row-<field>"` (`calories`,
  `fatG`, …) and `accessibilityState.expanded`; the expanded panel lists
  sub-rows with `testID="tally-item-<entryId>"` and
  `accessibilityLabel="Open <name>"`, amount text like `"500"` (calories,
  unitless) / `"30g"`, time like `"3:07 PM"`, and `"no data"` for entries
  missing the nutrient. Maestro's text selector matches accessibility labels
  too, so `assertVisible: "Open Tally Test Meal"` is the stable way to find a
  sub-row (bare `"500"` now also matches the row total — avoid relying on it
  inside the panel).

## 1. Steps

### 1.1 Infra — Metro + reconnect helper (do first, before any flow)

1. Start Metro for **this worktree** on port **8081** in the background and
   keep its log: `npx expo start --dev-client --port 8081` (no `APP_VARIANT`
   needed — identity is baked into the installed build; served JS is
   identity-agnostic). Then `adb reverse tcp:8081 tcp:8081`.
2. Edit `flows/_helpers/reconnect-dev-client.yaml`: port `8084` → `8081` in
   the `openLink` URL (leave the scheme `tummytracker-dev://` and everything
   else). Update the port note comment to say 8081.
3. **Smoke the helper on the dev variant:** `npm run e2e:flow flows/00-launch.yaml`.
   This is the first live test of the variant split's deep link. If the
   connect screen never yields to the app: take a screenshot (`maestro
   studio`/`adb exec-out screencap`), try the link by hand —
   `adb shell am start -a android.intent.action.VIEW -d
   "tummytracker-dev://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"`
   — and confirm Metro's terminal prints a bundling line. Record what you
   find in RESULTS.md root causes. If the dev scheme itself doesn't open the
   `.dev` app, that is an `app-regression`-class finding against the variant
   split (config, not a flow bug) — **report it, don't work around it by
   editing `app.config.ts`** (test sessions don't change features).
4. Freshness check per `docs/E2E.md` Troubleshooting: Metro must log a bundle
   on each launch. If it's silent, stop and report (`stale-build`).

### 1.2 Author — extend `flows/goals-tally.yaml` (the new coverage)

After the existing tally assertions (`"From 1 entry today"`, `"500"`, `"1
entry missing"`) append, in this order:

- Header: `scrollUntilVisible` UP to `"Today"`, `assertVisible: "Today"`, then
  `assertVisible: ".*, 20[0-9][0-9]"` (the long date — don't pin the day).
- Expand calories: `tapOn: id: "tally-row-calories"`, `waitForAnimationToEnd`,
  `assertVisible: "Open Tally Test Meal"` (the sub-row), and a time
  `assertVisible: "[0-9]{1,2}:[0-9]{2} (AM|PM)"`.
- Collapse: `tapOn: id: "tally-row-calories"` again, `assertNotVisible: "Open
  Tally Test Meal"`.
- Missing data: `tapOn: id: "tally-row-fatG"`, `assertVisible: "no data"`.
- Drill to entry: `tapOn: "Open Tally Test Meal"`, `waitForAnimationToEnd`,
  `assertVisible: "Save changes"` (the edit screen), then `back` and
  `assertVisible: "Today"`.
- Apply the flow-authoring rules from E2E.md: scroll before below-fold
  asserts, sync points after saves, full-match regex awareness (`.*…*`).

Also: `flows/nav-tabs.yaml` line ~27 — update the **comment** ("Goals"
subtitle now comes from `GoalsSection`'s heading, not the page header); keep
the assertion. Add Maestro `tags` to the targeted flows so the set can be run
as a group: `tags: [goals]` on `goals-tally`, `goal-editor`,
`checkin-persistence`, `nav-tabs`, and `tags: [smoke]` on `00-launch`
(Maestro flow config supports `tags:` alongside `appId:`; verify once with
`maestro test flows/ --include-tags smoke`). If `--include-tags` misbehaves
on this Maestro version, fall back to running the files individually and say
so.

### 1.3 Run — targeted set, junit output

1. Run each individually first (`npm run e2e:flow flows/<f>.yaml`), fix
   **flow** bugs as you go (stale label, below-fold, sync point). Never edit
   app source; an app problem is a finding.
2. Then the set for the record:
   `maestro test flows/ --include-tags goals,smoke --format junit --output
   flows/results.xml` (or the equivalent individual runs if tags fall back).
3. Flows in scope: `00-launch`, `goals-tally`, `goal-editor`,
   `checkin-persistence`, `nav-tabs`. Nothing else.

### 1.4 Report — RESULTS.md, ACCEPTANCE.md, E2E.md, commit

- Overwrite `docs/RESULTS.md` with the TEST_STRATEGY §4 template: summary
  (flows run / passed / failed, **scope: targeted — Goals + smoke on the dev
  variant**, rungs state, device + build = `.dev` package, Metro port), root
  causes with classes, per-flow table, findings for the next planning
  session, ACCEPTANCE changes. State explicitly that the full regression is
  still owed.
- `docs/ACCEPTANCE.md` → section "Post-MVP · 2026-08-21 release": flip the
  `· auto` rows for "Goals tab — tally drill-down…" and the reconnect-helper
  row under "Build-variant split" `[ ]→[x]` **only** from green testcases.
  Leave every other row alone.
- `docs/E2E.md` coverage table: update the `goals-tally.yaml` row's
  description to include the drill-down/Today/date coverage; update the
  helper finding's "Metro port is hardcoded" note to the current port.
- Run the three rungs (`typecheck`, `lint`, `test`) — flows/docs changes
  don't touch them, but the commit must leave them green.
- Commit in two: `chore(e2e): reconnect helper on 8081 + tags for targeted
  runs` and `test(e2e): cover Goals tally drill-down; results + acceptance
  for the first dev-variant run`. Leave Metro running at the end (say so);
  `flows/results.xml` is gitignored.
- End with an execute summary: per-flow results, root causes + classes, the
  helper verdict on the dev variant, files touched, anything blocked.

## 2. Guardrails (TEST_STRATEGY §7)

- Test sessions don't change features. Findings go in RESULTS.md; fixes are
  the next plan session's job.
- Verify before blaming the app — read the source (`goals.tsx`) before
  classifying any failure as `app-regression`.
- Keep `com.tummytracker.app` untouched: never `pm clear` it, never launch
  it, never `adb install` over it.
- Targeted only. The full run waits for the iOS deployment.
