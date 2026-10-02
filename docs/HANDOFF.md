# HANDOFF.md — Execute session: Day details on their own screen (device-run fix, #23 follow-up)

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§0: the #23
> daily-factors decisions). **You are on `main`** in the main checkout
> `C:\Users\E146796\projects\TummyTracker` (the burn-down branch was merged
> 2026-10-01). A **Metro dev server is running** from this checkout for the
> device run — that's fine; don't stop it, don't start another.
>
> **Pure JS/TS UI change** — no dependency, no schema, no permission, no
> native change.

**Planned 2026-10-02 (Opus, owner-decided).** Found on the §3 device run
(`docs/OWED.md`): on Home, the expanded "Add details" chips (#23) run off the
bottom of the screen. With Settings → Track period on, the **Period row sits
behind the tab bar and can't be reached** (Home doesn't scroll — on purpose:
the Recent list inside it scrolls), and the Recent list is squeezed out while
details are open. Owner decision: **give the chips their own small screen.**

## 0. Invariants

- **Nothing about the data changes**: same `setDayFactors` writes, same
  tap-again-to-clear rule, same `factorSummary`, Period chips only while
  Track period is on, a factor row still only covers its day (#23).
- The Home card keeps Fine / Rough and its other behaviour exactly.
- Every interactive element keeps an `accessibilityLabel` and `testID`;
  existing chip testIDs (`day-factor-<field>-<value>`) and accessibility
  labels (`"<Caption>: <Label>"`, e.g. "Stress: 4") stay the same.
- Stage by path; LF; no `@ts-ignore` / lint disables / bare `any`.

## 1. Shared chips component

Move the chip rows out of `src/features/checkin/DayCheckInCard.tsx` into
`src/features/checkin/DayFactorChips.tsx` (`{ date: string }` prop; reads
`useDayFactors` + `usePrefsStore(trackPeriod)` itself; same `chipRow`
markup, same `handleFactor` with `tapFeedback`), including the "Optional. Tap
a chosen chip again to clear it." line. No behaviour change.

## 2. Screen — `src/app/day-details.tsx`

Route `/day-details?date=YYYY-MM-DD` (register it in `src/app/_layout.tsx`
like the other stack screens). Missing/invalid `date` → today (local).
Title: "Today's details" when the date is today, otherwise "Details for
<formatLongDate>". Content in a `FormScrollView` (so it always scrolls):
`DayFactorChips`, then a "Done" `PrimaryButton`
(`accessibilityLabel="Done"`, `testID="day-details-done"`) → `router.back()`.

## 3. Home card

`DayCheckInCard`: drop the `expanded` state and the inline chips. The
details row becomes a Pressable that pushes
`{ pathname: '/day-details', params: { date } }`:
- label = `summary ?? 'Add details'` (unchanged text);
- `accessibilityLabel` = `'Add details for today'` when there's no summary,
  else `` `Edit details for today: ${summary}` ``;
- keep `testID="day-factors-toggle"`; remove `accessibilityState.expanded`.

## 4. Tests

- Move the chip interaction tests from `DayCheckInCard.test.tsx` to a new
  `DayFactorChips.test.tsx` (set, clear, Period only when tracking is on,
  summary-relevant writes) — same assertions, new home. List each moved test.
- `DayCheckInCard.test.tsx`: the row shows "Add details" / the summary, and
  pressing it pushes `/day-details` with today's date; Fine/Rough unchanged.
- `src/app/__tests__/day-details.test.tsx`: renders the chips for the param
  date (and today without one), the title variants, Done goes back, the
  Period row present when tracking is on (this is the bug: it must be
  rendered inside the scroll view).
- Home `index.test.tsx` (via `--runTestsByPath`) must still pass; only mock
  changes if the new navigation needs them (list them).

## 5. Definition of done

- `npm run typecheck`, `npm run lint` (0 warnings), `npm run bundle:check`,
  and the **full `npm test`** (it's fast now — 144 suites in ~30 s; check
  `FAIL` lines and the `Test Suites:` count).
- Don't run Maestro / EAS / adb; don't edit `flows/`, `CLAUDE.md`, `docs/`;
  don't push.
- One commit: `fix(checkin): day details on their own screen so every chip is reachable`
  ending `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Summary: files, hash, rung results, full-suite counts, moved/changed tests
  and why, deviations.
