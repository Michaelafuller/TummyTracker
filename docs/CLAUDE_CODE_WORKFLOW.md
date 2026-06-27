# CLAUDE_CODE_WORKFLOW.md — How to Drive This Project

> This is the learning artifact. The app is the excuse; becoming fluent in
> autonomous, agentic coding is the goal. Read this once, keep it open for the
> first few sessions.

---

## 0. Billing safety (set this once, then forget it)

Your hard rule is "no surprise bills." The safe configuration is the **default**,
and it’s structural — the risky thing is opt-in, not opt-out:

- **Do not enable pay-as-you-go / "extra usage" / "Add funds."** With it off,
  hitting your plan’s limit is a **hard stop**: the session pauses, your files
  and conversation are saved, and nothing is charged. Wait for the window to
  reset (or `/model` down to a lighter model) and continue.
- The only way to spend beyond your subscription is to deliberately turn that on,
  and even then you set a spending cap. So leave it off and the worst case of
  *any* loop is "it stopped," never "it billed me."
- The June 15 2026 split (which would have metered headless `claude -p` separately)
  was **paused on June 15**; programmatic usage currently still runs on your normal
  subscription pool. Treat that as subject to change — but the hard-stop default
  protects you either way, which is exactly why we can experiment freely.

**Net:** run Auto Mode, run loops, experiment. You cannot accidentally overspend
without flipping a switch you’ll leave off.

## 1. The core idea: the verify loop

Agentic coding works when the agent can check its own work. The loop is:

```
plan → edit → run checks → read failures → fix → repeat → green → done
```

Everything else in this doc is in service of that loop. The reason we picked
TypeScript + Jest + ESLint and wrote the "definition of done = checks green"
rule in CLAUDE.md §4 is that those commands ARE the loop’s feedback signal. No
checks = no autonomy, just guessing.

**Your job as the driver:** make the checks fast and trustworthy, then get out of
the way between green states.

## 2. Plan Mode — your default starting gear

For anything beyond a one-line fix, start in **Plan Mode** (Shift+Tab to cycle
into it, or `/plan`). The agent researches and proposes a strategy *without
touching files*; you read it, correct the approach, then approve execution.

Why it matters for learning: you see the agent’s intended steps before they
happen, which is where the reasoning is visible. Reject plans that skip tests or
add unjustified dependencies. A good habit: "Show me the plan and the files
you’ll touch; don’t write code yet."

## 3. Model routing — Opus thinks, Sonnet builds

This is the "Opus for advice, Sonnet for code" pattern you’d heard about. There’s
no `/advisor` command; the real mechanisms are:

- `/model opusplan` — Opus 4.8 drives planning, Sonnet 4.6 does execution
  automatically. Closest thing to the workflow you described.
- `/model` — switch manually any time. Use **Opus** to plan a phase or review a
  diff, **Sonnet** for the bulk of implementation and test-writing, **Haiku** for
  trivial mechanical edits.

Rule of thumb: spend Opus on judgment, Sonnet on volume.

## 4. Auto Mode — supervised autonomy

Auto Mode lets the agent proceed through safe actions on its own while a separate
classifier vets each step and escalates risky ones. It’s the comfortable middle
between approving every keystroke and full headless. Use it for clearly-scoped
phase work where the checks will catch mistakes (e.g. "implement 1b until the
manual-entry tests pass"). Because pay-as-you-go is off (§0), the failure mode is
a stop, not a bill.

If output drifts, press **Escape twice** to rewind to a checkpoint and retry with
a tighter prompt. Checkpoints are automatic before changes — lean on them.

## 5. A reviewer subagent (recommended, optional)

Subagents run in their own context window with their own model and tool set.
A useful one here is a **read-only reviewer** on Opus that critiques a diff
without being able to change it. Create it with `/agents` (Personal scope), e.g.:

```markdown
---
name: code-reviewer
description: Reviews the latest diff for correctness, test coverage, and CLAUDE.md compliance. Use after implementing a sub-phase.
tools: Read, Grep, Glob, Bash
model: opus
---
You are a senior reviewer. Check the diff against CLAUDE.md conventions and the
phase’s done-criteria in BUILD_PLAN.md. Report issues by severity. You cannot
edit files — recommend, don’t modify.
```

Then: `Use the code-reviewer agent to review the Phase 1b diff.` Note subagents
multiply token use (roughly several× a single thread), so reach for them at
review points, not for every edit.

## 6. Headless — graduate to this later

`claude -p "<prompt>"` runs one-shot with no interactive session — good for
"implement this fully-specified task and stop when tests pass," nightly audits,
or pre-commit checks. Don’t start here. Once you trust the loop on a few
sub-phases interactively, try a single well-scoped, well-tested task headless
(e.g. a `lib/` helper with its tests). Same billing safety applies: with
pay-as-you-go off, it stops rather than overspends.

## 7. Suggested first session (copy/paste friendly)

1. Put `CLAUDE.md`, `BUILD_PLAN.md`, and this file in the (soon-to-exist) repo root.
2. Start Claude Code in an empty project folder.
3. Confirm pay-as-you-go is OFF in your account (§0).
4. `/model opusplan`
5. Enter Plan Mode and say:
   `Read CLAUDE.md and BUILD_PLAN.md. Plan Phase 0 only. Propose the steps and the
    exact files you’ll create; don’t write code until I approve.`
6. Review, approve, let it execute to green checks.
7. Install the dev build on the Pixel 5. Phase 0 done.
8. New session per sub-phase from there (1a, 1b, 1c…), Plan Mode each time,
   reviewer subagent at the end of each.

## 8. Habits that make you fluent fast

- **One sub-phase per session.** Small context = sharper agent = easier review.
- **Make the agent run the checks itself** and paste the output. Don’t take
  "done" on faith — take it on green.
- **Use `/context`** to watch context fill; `/compact` when it gets heavy.
- **Reject scope creep in the plan**, not after the code is written.
- **Keep CLAUDE.md honest.** When you discover a convention, write it there so the
  agent inherits it next session. The repo’s memory file is your real leverage.
