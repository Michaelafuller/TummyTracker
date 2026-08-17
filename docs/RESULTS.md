# RESULTS.md — Maestro run 2026-08-16 (test-execute resume: two-release backfill) — BLOCKED (new cause)

## Summary

- **Flows run: 23/23, all failed — 0 passed.** The prior blocker (installed APK was
  an EAS `preview` build that could never reach Metro) is **resolved**: the owner
  installed a real `development`-profile dev client, and this session got fresh
  JS loading from Metro for what looks like the first time in this project's
  Maestro history. But that success immediately surfaced a **real, previously
  invisible app-bug** that crashes the Home screen (and therefore the whole app,
  since there's no error boundary) on every dev-mode launch. Every flow fails at
  or near its first interaction for this single root cause — see Root cause #1.
- **Scope:** full regression (mandated — theme pass touched shared infra) plus the
  five new/extended flows from `docs/HANDOFF.md`. All ran; all failed identically.
- **Rungs: green.** `npm run typecheck` ✅ `npm run lint` ✅ `npm test` ✅ (505/505,
  58 suites). The bug below is **invisible to all three rungs** — `tsc`, `expo lint`,
  and Jest's component tests never trigger expo-router's `Slot` dev-mode check in
  a way that throws (see Root cause #1 for why).
- **Device + build:** Pixel 5 (`0A131FDD4006VE`), package `com.tummytracker.app`,
  installed build is the **development-profile dev client from 2026-08-16 20:30:06**
  (`dumpsys package` confirms `DEBUGGABLE` flag) — this is the real dev client the
  prior session needed. Metro served this worktree on port 8083 (8081 and 8082
  were occupied by other sessions' leftover processes — see Root cause #2 for the
  full connection story).
- **`flows/results.xml` written:** 23 testcases, 23 failures, 0 passures. See
  Root cause #1 for why a 100%-red run is still trustworthy signal (not a
  "misleading reds" situation like the prior session's blocked run) — the JS is
  fresh and the crash is real, reproducible `main`-HEAD behavior.

## Root causes

### 1. **App-bug — Home screen (and therefore every screen) throws a fatal render error in dev-mode JS. Class: `app-bug`, NOT `flow-bug` or `env`. Blocks 100% of the suite. Do not patch — flagged here per the test-execute charter.**

**What happens:** `expo-router`'s `Slot` implementation
(`node_modules/expo-router/build/ui/Slot.js:55-64`) has a dev-mode-only guard:

```js
if (process.env.NODE_ENV !== 'production') {
  if (React.isValidElement(props.children) &&
      'style' in props.children.props &&
      Array.isArray(props.children.props.style)) {
    throw new Error(`[expo-router]: You are passing an array of styles to a
      child of <Slot>. Consider flattening the styles with StyleSheet.flatten
      before passing them to the child component.`);
  }
}
```

Any `<Link href="..." asChild><SomeComponent style={[a, b]}>` — an array-literal
`style` prop on the **direct child** of an `asChild` wrapper — throws this in
dev mode. It is silently skipped in production (`NODE_ENV === 'production'`),
which is exactly the mode an EAS `preview`/`production` build runs in. **That is
why this has never been seen before**: every previous "on-device" signal this
project has (2026-07-03's 18/19 baseline, and every "stale-bundle green" noted
in the prior RESULTS.md entry) ran against a bundle that was either
production-mode (EAS preview) or never actually reached the device at all. This
session is, as far as the RESULTS.md history shows, **the first time this
project's Maestro suite has ever run against a genuinely fresh dev-mode Metro
bundle** — and that's exactly the condition this bug needed to surface.

**Confirmed crash sites** (5 call sites, 2 files — verified by reading source,
not just the stack trace):
- `src/app/(tabs)/index.tsx:60-103` — all four Home-screen CTAs: `Link
  href="/scan" asChild><Pressable style={[styles.cta, {backgroundColor:
  theme.primary}]}>` (line ~64), and three more with `styles.secondaryCta` for
  `/meal/component`, `/bm/new`, `/symptom/new`.
- `src/features/logging/EntryRow.tsx:46-53` — every journal row: `<Link
  href={`/entry/${entry.id}`} asChild><Pressable style={[styles.row,
  {backgroundColor: theme.backgroundElement, borderColor: theme.border}]}>`.

Both patterns were introduced by `4600f44` ("feat(ui): new accessible color
scheme with primary action token", 2026-06-28) which replaced flat static
styles with `[staticStyle, {dynamicThemeColor}]` arrays to support the
teal/plum theme tokens — reasonable code, just incompatible with `Slot`'s
dev-only array-style guard.

**Blast radius:** Home is the initial tab and is unconditionally mounted by
`AppTabs`'s `<Tabs>` navigator on cold launch. There's no error boundary
wrapping individual screens, so the thrown render error unmounts the entire
app (confirmed visually — a screenshot after dismissing the redbox shows a
blank screen with **no bottom tab bar at all**, not just a blank Home tab).
This is why literally every flow fails, including ones that never touch a Home
CTA (e.g. `nav-tabs`, `settings-smoke`, `goals-tally` all fail on `Id matching
regex: tab-settings/tab-goals/tab-journal` — the tab bar itself never mounts).

**Proof, not assumption:**
- Full expo-router source read: the throw is unconditional given an array
  style, gated only by `NODE_ENV`.
- `grep`/agent search across `src/app` and `src/components` for every `asChild`
  usage confirmed exactly 5 crash sites (2 files) and 4 safe usages (all in
  `app-tabs.web.tsx`, none array-styled).
- Live device repro: launched app fresh, hit React Native's redbox
  ("Render Error — [expo-router]: You are passing an array of styles...") citing
  `Slot.js:63` and the call site `index.tsx:60`. Screenshot evidence captured.
- `maestro test flows/00-launch.yaml` alone: `"TummyTracker"` title asserts
  visible (renders before the crashing subtree), `"Scan barcode"` (inside the
  crashing `Link`) does not — matches the diagnosis exactly.
- Full suite: 23/23 failed, every failure is "element not found" for something
  that only exists post-Home-render or in the tab bar — no unrelated failure
  reasons, no flakiness, no partial passes. This is single-root-cause, not 23
  independent flow problems.

**Suggested fix for the next plan/execute session** (not applied — app-code
changes are out of scope for test-execute): wrap each array-style prop with
`StyleSheet.flatten([...])` at the 5 call sites above, or restructure to merge
into a single object before passing to the `asChild` child. Trivial, low-risk,
no schema/dependency change — a good first item for the next Execute session,
since it's the single highest-leverage fix in the project (unblocks literally
every dev-mode flow at once).

### 2. Environment note — worktree had no `node_modules`; the leftover Metro on 8081/8082 was serving from stale/incomplete state (procedural, not a code bug)

This worktree (`gifted-montalcini-fc828d`) had **no `node_modules` directory at
all** at session start — `npm install` had apparently never been run here. Port
8081 was held by a leftover Metro from an earlier, unrelated session (per the
task setup notes, not owned by this session); I started a fresh Metro on 8082,
but that instance had started crawling before `npm install` completed, so it
never picked up the newly-installed `node_modules` and kept 404ing
`node_modules/expo-router/entry` even after `npm install` finished (confirmed
via `DevLauncher` error body: `UnableToResolveError` on
`./node_modules/expo-router/entry`). Neither leftover Metro process could be
killed (sandboxed from `taskkill`), so the fix was a **third** Metro instance on
port 8083, started after `npm install` completed — that one bundled cleanly
(`Android Bundled 9262ms node_modules\expo-router\entry.js (2405 modules)`).

**For the next test-execute session:** run `npm install` in the worktree before
starting Metro if `node_modules` is missing (check first — this worktree may
carry the fix forward, or may not, depending on how worktrees are created).
Also: if Metro was started before `node_modules` existed or changed
significantly, restart it — don't assume a running Metro will notice.

## What stays manual / blocked

Same list as before — everything requiring camera, notification timing, visual
inspection, network-dependent OFF search, and on-device DB migration spot
checks. Additionally, **the entire automated suite is now blocked on the
app-bug in Root cause #1**, not on environment. Once that's fixed:
1. Re-run the full suite: `maestro test flows/ --format junit --output
   flows/results.xml`.
2. If the fix is truly isolated to the 5 call sites (verify with a quick
   `grep -rn "asChild" src` sweep after the fix, same as this session's
   search), all `23/23` should go green or reveal the *next* layer of real
   issues — this session never got past the Home-screen crash, so nothing
   past that point has been exercised even once against real dev-mode JS.

## Findings for the next planning session

- **This is the single highest-priority item.** The dev-client loop this
  project has been trying to establish across at least two prior sessions
  (per `docs/RESULTS.md` history) is now technically *working* — Metro serves,
  the device connects, fresh JS bundles — but is immediately blocked by this
  app-bug. Fixing the 5 call sites (see Root cause #1) should be step one of
  the next Execute session; it is small, mechanical, and unblocks everything
  else.
- **Every "✅ Automated" / "passed" flow status in `docs/E2E.md` and
  `docs/ACCEPTANCE.md` prior to this session should be treated with suspicion
  for anything that exercises Home or an entry row.** Given this bug is
  `NODE_ENV`-gated and has existed since 2026-06-28, and given the only
  confirmed real dev-mode Metro connection in this project's history is *this*
  session, it's unclear whether the 2026-07-03 "18/19" baseline actually ran
  in dev mode or against some other JS source. Worth a quick sanity check next
  planning session (not urgent — the app-bug fix will resolve this
  empirically on the next full run).
- **Recommend adding a root-level React error boundary** around the tab
  navigator (or per-screen) so a single screen's render error doesn't blank
  the entire app. This wouldn't have prevented this bug, but it would have
  scoped the blast radius to one tab instead of the whole app, and would make
  future regressions like this easier to diagnose from a screenshot alone.
- **`node_modules` was missing from this worktree at session start** — see
  Root cause #2. Not an app-code issue, but worth a quick check at the top of
  future test-execute sessions in a worktree: `ls node_modules` before
  assuming Metro will "just work" per `docs/E2E.md`'s documented commands.
- **The owner can now manually verify the splash/notification/icon
  ACCEPTANCE.md items** (`Post-MVP · 2026-08-16 release` → "Splash &
  notification colors" section). Native config (splash screen, launcher icon,
  notification accent) is baked into the APK at build time regardless of the
  `development`/`preview`/`production` EAS profile — only the *JS-loading
  strategy* differs between profiles. Since the newly installed dev client was
  built from the same 2026-08-16 HEAD that carries the splash/notification/icon
  fixes, those three `· manual (EAS build)` checklist items are visible on
  **this** build today; they don't require a fresh preview/production build to
  inspect. This session did not check them (no device UI access outside
  Maestro/adb), but flagging it here so the owner can tick them by eye.

## ACCEPTANCE.md changes made

**None.** 0 of 23 flows passed, so no `[ ]` → `[x]` flips. The 2026-08-16
release section's banner (previously describing the now-resolved preview-APK
blocker) was updated to describe this session's app-bug blocker instead, with
a pointer to this file. No other ACCEPTANCE.md line was touched.

---

_Prior run history (2026-07-03 full regression, 18/19; 2026-08-16 blocked run,
environment) is preserved in git history. The 2026-07-03 numbers are the last
run that produced any passing flows at all, but per the finding above, their
provenance (dev-mode vs. production-mode JS) is now in question and should be
revisited once the app-bug is fixed and a clean full run completes._
