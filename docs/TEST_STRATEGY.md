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

## 3. The artifacts (what bridges the sessions)

| Artifact | Written by | Read by | Purpose |
|----------|-----------|---------|---------|
| `docs/HANDOFF.md` | step 1 (or 3) | step 2 (or 4) | The next task, fully specced. **Single rolling file — overwritten each cycle.** |
| *(execute summary)* | step 2 / 4 | step 3 / 1 | Brief end-of-session note: what shipped, what's left, findings. Lives in the session output (and may be appended to the relevant doc). |
| `docs/ACCEPTANCE.md` | step 3 ticks structure, step 4 flips boxes | everyone | The living checklist. `· auto flows/<file>` = Maestro-driven; `· manual` = needs human. |
| `flows/results.xml` | `maestro test ... --format junit` | step 4 | Machine-readable pass/fail per flow. |
| `docs/RESULTS.md` | step 4 (test-execute) | step 1 (next plan) | **Human-readable** test run report: which flows passed/failed, what was fixed, what stays manual, what the next planning session must address. |

### `RESULTS.md` — the new, previously-missing artifact
`flows/results.xml` is machine output; `ACCEPTANCE.md` is a checklist. Neither
tells the *next planning session* the story of the run. `RESULTS.md` is that
story — written at the end of every **test-execute** session:

```markdown
# RESULTS.md — Maestro run <date>

## Summary
- Flows run: N. Passed: X. Failed: Y. Skipped/manual: Z.
- Rungs: green/red. bundle:check: green/red.

## Per-flow
| Flow | Result | Note |
|------|--------|------|
| c-symptom-logging | ✅ pass | — |
| e-temporal-insights | ⚠️ partial | "Timing patterns" left manual — timing-dependent |
| ... | ❌ fail | step "tapOn: X" — label drifted, see finding |

## Findings for the next planning session
- <label to add / flow to fix / feature regression / new manual item>

## ACCEPTANCE.md changes made
- Flipped <items> [ ]→[x] from results.xml.
```

`RESULTS.md` is overwritten each test-execute run (git history preserves prior
runs). The next **plan** session reads it first — it's the feedback that closes
the loop.

---

## 4. Maestro coverage: source of truth

`docs/E2E.md` holds the **Coverage table** (ACCEPTANCE item → flow file → status)
and the run protocol. When you add a flow, you add a row there. The table is the
audit of what's automated vs. manual vs. uncovered. If a feature isn't in that
table with a flow, assume it has **no** on-device coverage.

Manual items that stay on the owner's desk (camera, notification timing, visual
contrast, file-content inspection) are listed in `E2E.md` and stay `· manual` in
`ACCEPTANCE.md` — they are *not* gaps, they're deliberate.

---

## 5. Guardrails for test sessions

- **Test sessions don't change features.** A test-execute session that finds a
  missing accessibility label records it as a *finding* in `RESULTS.md`; it does
  **not** edit the component. The fix is specced by the next planning session.
  (This keeps "the test changed the app to make itself pass" from ever happening.)
- **A documented manual item beats a flaky flow.** If a flow can't be made
  deterministic (e.g. needs real time gaps, camera, or notification timing), mark
  it `· manual` and say why — don't ship an assertion that fails intermittently.
- **The Execute session can author flows but can't certify them.** Only a
  test-execute session with the device attached may mark a flow as passing.
- **One rolling `HANDOFF.md`.** It's overwritten each cycle. If two sessions must
  run concurrently (e.g. a Jest backfill and a Maestro backfill), the second
  handoff gets a suffixed name (`HANDOFF_MAESTRO.md`) and that divergence is noted
  here until they re-converge.

---

## 6. Where this leaves us today (2026-06-28)

- Jest backfill: in progress (separate session, the previous `HANDOFF.md`).
- Maestro backfill: specced in the current `HANDOFF.md`. Eight feature areas
  shipped without flows (symptom logging being the largest hole at 8 ACCEPTANCE
  items). Until those flows land and a test-execute session produces a clean
  `RESULTS.md`, the green-rungs status **overstates** real coverage.
- Action: run steps 4a→4b for the Maestro backfill, produce the first `RESULTS.md`,
  then resume normal feature cycles with flow-authoring no longer optional.
