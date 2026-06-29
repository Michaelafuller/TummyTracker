# TEST_STRATEGY.md — How testing actually drives this project

> This document exists because the testing cycle was **falling through the gaps**.
> The original spec (`PROGRESS.md`, `ACCEPTANCE.md`) describes a clean
> *three-session* loop where the Execute session writes both the feature **and**
> its Maestro flows. In reality, features kept shipping with Jest tests but
> **without** the Maestro flows — symptom logging, ingredient capture, the
> correlation insights, offline mode, and the collapsible calendar all reached
> `main` with on-device coverage missing. This doc reconciles the spec with how
> the project is really run, and names the artifacts so nothing falls through
> again.

---

## 1. The two layers of "tested"

| Layer | Command | Runs the app? | What it proves |
|-------|---------|:--:|----------------|
| **Rungs** | `npm run typecheck && npm run lint && npm test` | ❌ No | Code & logic correctness (Jest, pure functions, component wiring) |
| **Acceptance** | `npm run e2e` (Maestro on the Pixel 5) | ✅ Yes | The real app, real accessibility tree, real SQLite round-trips |
| **Bundle gate** | `npm run bundle:check` (`expo export`) | (builds) | Metro/Babel bugs the rungs miss; run before any EAS build |

The rungs are the inner loop the agent climbs every edit. Maestro is the **outer**
loop — the only thing that catches "the button has no label", "the screen
redboxes on launch", "the value didn't persist". A feature with green rungs and
no Maestro flow is **half-tested**. That half-gap is what this doc closes.

---

## 2. The real development loop (4 steps, not 3)

Each step is a **separate Claude session** — no shared context, clean handoffs via
files. The original spec compressed steps 2+4 into one "Execute" session; in
practice they separate, because writing Maestro flows is a different mode of work
(no device in the planning/code sessions, device required to run them) and gets
dropped when bundled with feature work.

```
┌─ 1. PLAN ────────────┐   Opus (opusplan)
│  reads PROGRESS.md,   │   writes docs/HANDOFF.md
│  codebase, CLAUDE.md  │   (next task fully specced)
└───────────┬──────────┘
            ▼
┌─ 2. EXECUTE ─────────┐   Sonnet (Auto)
│  reads HANDOFF.md     │   feature + Jest tests committed,
│                       │   rungs green, writes a brief summary
└───────────┬──────────┘
            ▼
┌─ 3. TEST-PLAN ───────┐   Opus/Sonnet
│  reads the summary    │   decides what on-device coverage is owed,
│  + E2E.md             │   updates ACCEPTANCE.md, writes the next
│                       │   HANDOFF.md (a *test-backfill* handoff)
└───────────┬──────────┘
            ▼
┌─ 4. TEST-EXECUTE ────┐   Sonnet (Auto)
│  reads the test       │   writes/updates Maestro flows, runs
│  HANDOFF.md + E2E.md  │   `npm run e2e` on the Pixel 5, reads
│                       │   flows/results.xml, writes RESULTS.md,
│                       │   ticks ACCEPTANCE.md [ ]→[x]
└───────────┬──────────┘
            ▼
        loop back to 1 (next feature, or fix what RESULTS.md flagged)
```

> **Note vs. the original 3-session spec.** Steps 2 and 4 of this loop are the two
> halves the old spec called "Execute" (Session 2) and "Test" (Session 3). The
> difference is that **flow authoring is now its own step (4a), not assumed inside
> step 2.** When a feature ships in step 2 without flows, the gap is paid down by a
> dedicated *test-backfill* pass (steps 3→4) — exactly the pass this current
> HANDOFF.md drives.

### Why split flow-authoring out of feature execution
- The Execute session has no device, so it can author flows but never *run* them —
  it can't tell a working flow from one targeting a stale label. Unverified flows
  rot silently.
- Bundling "ship the feature" with "write its e2e flow" means the flow is the
  first thing dropped under context pressure. Making it a named step with its own
  handoff makes the omission visible.

---

## 3. Starting a session — read only your input contract

**Do not "read all the docs."** Each session has one **input contract** — the doc
that tells it what to do — and that doc points onward to anything else it needs.
Root `CLAUDE.md` is auto-injected every session, so never spend a read on it.

| Session | Open by reading | Auto-loaded | Pulls onward as needed |
|---------|-----------------|-------------|------------------------|
| **Plan** | `PROGRESS.md` + `docs/RESULTS.md` | `CLAUDE.md` | `docs/TEST_STRATEGY.md`, the codebase |
| **Execute** | `docs/HANDOFF.md` | `CLAUDE.md` | whatever HANDOFF's preamble points to |
| **Test-plan** | `docs/RESULTS.md` + `docs/E2E.md` | `CLAUDE.md` | `docs/TEST_STRATEGY.md` |
| **Test-execute** | `docs/HANDOFF.md` (test variant) + `docs/E2E.md` | `CLAUDE.md` | `docs/TEST_STRATEGY.md §4` |

So the session-opener prompt shrinks to one line: **"Read docs/HANDOFF.md"** for an
execute session, **"Read PROGRESS.md and docs/RESULTS.md"** for a plan session. The
docs enforce the rest.

**Never auto-read** (historical / human-only — pull only if a task specifically
needs them): `docs/CLAUDE.md` (superseded by the root copy), `docs/BUILD_PLAN.md`
(phased MVP spec, now history), `docs/CLAUDE_CODE_WORKFLOW.md` (the owner's
learning guide, not agent input).

### The handoff preamble rule (what makes HANDOFF-only safe)

Reading only `HANDOFF.md` is safe **iff** every handoff is self-contained. So this
is a **rule, not a habit**:

> Every `docs/HANDOFF.md` MUST open with a "Read first" line naming **`CLAUDE.md`
> + the one protocol doc for this session type** (`docs/E2E.md` for a
> test-backfill handoff; otherwise whatever the task touches). A handoff that
> doesn't point at the doc its session needs is a defect — fix the handoff, don't
> make the next session guess.

A plan session writing the handoff owns this preamble. If you can't name the
onward doc, the task isn't specced tightly enough yet.

---

## 4. The artifacts (what bridges the sessions)

| Artifact | Written by | Read by | Purpose |
|----------|-----------|---------|---------|
| `docs/HANDOFF.md` | step 1 (or 3) | step 2 (or 4) | The next task, fully specced. **Single rolling file — overwritten each cycle.** |
| *(execute summary)* | step 2 / 4 | step 3 / 1 | Brief end-of-session note: what shipped, what's left, findings. Lives in the session output (and may be appended to the relevant doc). |
| `docs/ACCEPTANCE.md` | step 3 ticks structure, step 4 flips boxes | everyone | The living checklist. `· auto flows/<file>` = Maestro-driven; `· manual` = needs human. |
| `flows/results.xml` | `maestro test ... --format junit` | step 4 | Machine-readable pass/fail per flow. |
| `docs/RESULTS.md` | step 4 (test-execute) | step 1 (next plan) | **Human-readable** test run report: which flows passed/failed, what was fixed, what stays manual, what the next planning session must address. |

### `RESULTS.md` — the interpretation layer (not a transcript)
`flows/results.xml` is machine output (one pass/fail + one-line failure string per
testcase); `ACCEPTANCE.md` is a checklist. **Neither interprets the run.**
`RESULTS.md` is the interpretation: it *consumes* `results.xml` and adds the
triage the next planning session actually needs — root-cause grouping, failure
classification, and next-actions. Transcribing `results.xml` row-by-row adds no
value; the value is collapsing N raw failures into their few real causes.

> Worked example (2026-06-28 first full run): **14 raw failures collapsed to
> ~4 root causes.** Eleven of the fourteen were flow bugs (stale labels,
> below-fold assertions, a missing post-save sync point) — *not* app
> regressions. A row-by-row transcript would have read as "the app is broken";
> the interpretation read as "the flows need 3 mechanical fixes + 1 sync point."

**Every failure gets a classification** (this is the core of the report):

| Class | Meaning | Who fixes it | Where |
|-------|---------|--------------|-------|
| `flow-bug` | stale label, below-fold assert, missing sync point, bad selector | test-execute (flow YAML) | the flow |
| `app-regression` | the app genuinely broke | next plan → execute | component/lib |
| `flake` | passes on re-run, no code change | nobody (note it; quarantine if chronic) | — |
| `stale-build` | device ran an old bundle; not a real result | re-run on a fresh build | — |
| `expected-manual` | can't be made deterministic (camera, timing, switch value) | stays `· manual` | E2E.md |

**Verify before you blame the app.** A failing assertion is *not* evidence of an
app bug until you've read the source and ruled out a flow bug. Before writing
`app-regression`, open the relevant file and confirm. The 2026-06-28 run is the
cautionary tale: it hypothesised two app bugs — "`entry/new` may not call
`router.back()`" and "the Journal needs `useFocusEffect` to refresh" — and **both
were false**. All three save screens already call `router.back()`, and
`useEntries` already uses Drizzle `useLiveQuery` (a live subscription, so
`useFocusEffect` is irrelevant). The real cause was a missing post-save sync
point in the flows. A 5-minute source read would have prevented a wrong app
change.

Template:
```markdown
# RESULTS.md — Maestro run <date>

## Summary
- Flows run: N. Passed: X. Failed: Y. Manual/skipped: Z.
- Scope: targeted (<which flows> + neighbours) | full regression.
- Rungs: green/red. bundle:check: green/red. Device + build: <id / commit>.

## Root causes (the point of this file)
1. <cause> → class <flow-bug|app-regression|...> → flows affected → fix.
2. ...

## Per-flow
| Flow | Result | Class | Root cause # |
|------|--------|-------|--------------|

## Findings for the next planning session
- <verified app bug to fix / label to add / new manual item>. Cite file:line.

## ACCEPTANCE.md changes made
- Flipped <items> [ ]→[x] from results.xml (verified passes only).
```

`RESULTS.md` is overwritten each test-execute run (git history preserves prior
runs); `flows/results.xml` is **gitignored** (per-run, device-specific). The next
**plan** session reads `RESULTS.md` first — it's the feedback that closes the loop.

---

## 5. Maestro coverage: source of truth

`docs/E2E.md` holds the **Coverage table** (ACCEPTANCE item → flow file → status)
and the run protocol. When you add a flow, you add a row there. The table is the
audit of what's automated vs. manual vs. uncovered. If a feature isn't in that
table with a flow, assume it has **no** on-device coverage.

Manual items that stay on the owner's desk (camera, notification timing, visual
contrast, file-content inspection) are listed in `E2E.md` and stay `· manual` in
`ACCEPTANCE.md` — they are *not* gaps, they're deliberate.

---

## 6. Targeting & cadence — what to run when

A full Maestro run is ~22 min and flaky; running it after every JS tweak destroys
the tight loop. So **default to targeted**, escalate to full by *blast radius*,
not by calendar.

**Targeted** = the flow(s) for the changed feature **plus their immediate
neighbours** (flows that share the same screen or navigation path). Run with
`npm run e2e:flow flows/<file>.yaml`.

**Full regression** = `npm run e2e:ci` (all flows → `flows/results.xml`).

| The change touches… | Run |
|---------------------|-----|
| One leaf screen / one `lib/` function / one new flow | **Targeted** |
| Shared infra: tab bar / nav, theme tokens, `db/schema` or a migration, the app shell, a dependency bump | **Full** — global changes break distant flows |
| Before any EAS build / release (the `bundle:check` moment) | **Full** |
| Periodic backstop (e.g. weekly), to catch drift nobody flagged | **Full** |
| Establishing or re-establishing a trusted baseline | **Full** (see below) |

**Why full can't be purely "occasional":** targeted runs are blind to exactly the
failures that matter most — the cross-cutting ones. The 2026-06-28 run is proof:
a global change (Settings became a tab; entry screens save-and-`router.back()`)
broke *eleven* flows across unrelated features. A targeted run on that session's
new flows would have looked fine while the suite was broadly red.

**"Authored ✅" is not "verified ✅".** Until 2026-06-28, *no* flow had ever run on
a device — the ✅ marks in E2E.md were authored optimism. Use a two-state
vocabulary and never skip the second:
- **⏳ Authored** — flow written, labels verified against source, but never run on
  a device. (All an Execute/Test-author session can claim.)
- **✅ Verified** — passed on the Pixel 5 in a real run, recorded in `results.xml`.
  Only a test-execute session may set this, and only from a green testcase.

The first full run after a backlog of authored flows is a **baseline run** — its
whole job is to convert ⏳→✅ (or expose the truth). Expect it to be mostly red the
first time; that's the baseline doing its job, not a disaster.

---

## 7. Guardrails for test sessions

- **Test sessions don't change features.** A test-execute session that finds a
  missing accessibility label records it as a *finding* in `RESULTS.md`; it does
  **not** edit the component. The fix is specced by the next planning session.
  (This keeps "the test changed the app to make itself pass" from ever happening.)
- **Verify before blaming the app.** Don't classify a failure as `app-regression`
  until you've read the source and ruled out a flow bug. Speculation is a finding
  *to check*, never a fix *to ship*. (See the 2026-06-28 false-positive in §4.)
- **A documented manual item beats a flaky flow.** If a flow can't be made
  deterministic (e.g. needs real time gaps, camera, or notification timing), mark
  it `· manual` and say why — don't ship an assertion that fails intermittently.
- **Authored ≠ verified.** The Execute/author session can write flows but can't
  certify them; only a test-execute session with the device attached flips
  ⏳ Authored → ✅ Verified, and only from a green `results.xml` testcase. (§5)
- **Prefer flow fixes; batch the cheap ones first.** When a run is mostly red,
  fix the mechanical flow bugs (stale labels, below-fold scrolls, sync points)
  and re-run before investigating anything suspected to be an app bug — the
  narrower failure list makes the real bugs obvious.
- **One rolling `HANDOFF.md`.** It's overwritten each cycle. If two sessions must
  run concurrently (e.g. a Jest backfill and a Maestro backfill), the second
  handoff gets a suffixed name (`HANDOFF_MAESTRO.md`) and that divergence is noted
  here until they re-converge.

### Flow-authoring conventions that prevent the common failures
These three caused 11 of 14 failures in the first full run — bake them in:
- **Sync after every save.** A form `Save` triggers an awaited DB write +
  `router.back()`; `waitForAnimationToEnd` does **not** wait for that. Add a
  positive sync point before the next tap — e.g. `assertVisible: "TummyTracker"`
  (back on Home) before `tapOn: id: "tab-journal"`.
- **Scroll before asserting below-fold content.** Long forms and the Settings
  scroll view push `Save entry` / `App` / card bodies off-screen. Use
  `scrollUntilVisible` before `assertVisible`/`tapOn`, never a bare assert.
- **Target current labels.** Re-confirm the label against the component each run;
  navigation refactors (e.g. "Reminder settings" → the Settings tab) silently
  strip the strings flows depend on.

---

## 8. Where this leaves us today (2026-06-28)

- Jest backfill: complete (merged to `main`, 165 tests green).
- Maestro backfill: 7 flows authored; **first full run done** — 5 ✅ / 14 ❌
  (`docs/RESULTS.md`). The reds collapse to ~4 root causes, **11 of 14 are flow
  bugs, not app regressions** (verified: all save screens call `router.back()`;
  `useEntries` uses `useLiveQuery`). The current `HANDOFF.md` is the fix plan.
- The green-rungs status still **overstates** real coverage until the flows go
  ⏳→✅. That's expected for a baseline run (§5).
- Action: apply the flow fixes (Groups 1 + 4 first, then the post-save sync point
  for Groups 2 + 3), re-run `npm run e2e:ci`, write a fresh `RESULTS.md`, flip
  verified boxes. Then resume feature cycles with flow-authoring no longer optional.
