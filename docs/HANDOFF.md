# HANDOFF.md — Execute session: the owner's two device-run ideas

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§0: the #13 day
> check-in rules; medications #6–#11/#26/#28). **You are on `main`** in the
> main checkout `C:\Users\E146796\projects\TummyTracker`. A Metro dev server
> may be running from this checkout — leave it alone.
>
> **Pure JS/TS UI** — no dependency, no schema, no permission, no native change.

**Planned 2026-10-02 (Opus; the owner asked for both after the §1 device
run).**

- **A. Visible confirmation for a check-in answered from the notification.**
  Tapping "Fine day" / "Rough day" in the notification shade opens the app
  and records the answer (`useDayCheckInResponses`), but nothing says it was
  recorded unless you look at the card. Show a brief banner on Home.
- **B. "Select all" on the medication entry form.** Ticking several meds one
  by one is tedious.

Plan-session judgments (flag them; owner may override):
- A's banner text: **"✓ Rough day recorded"** / **"✓ Fine day recorded"**,
  plus " for <Mon D>" when the answered date isn't today (a late tap on
  yesterday's notification). `tapFeedback('success')` when it appears. It
  hides itself after **4 s** or when tapped. **Only for notification
  answers** — Home-card taps already highlight the chosen button.
- A's banner sits at the top of Home's content (above the hero),
  `accessibilityRole="alert"`, `accessibilityLiveRegion="polite"`,
  `testID="check-in-recorded-banner"`.
- A only shows when the record actually succeeded (a failed write shows
  nothing new — today's silent failure behaviour stays).
- B: a "Select all" link (`accessibilityLabel="Select all medications"`,
  `testID="select-all-medications"`) at the top of the Medications field;
  when every line is selected it reads **"Clear all"**
  (`accessibilityLabel="Clear all medications"`). Select all ticks every
  line, keeping each line's dose/unit/reason as they are; Clear all unticks
  every line (values kept, as a single untick does today). Hidden when
  there's only one line.

## 0. Invariants

- **A notification answer is still recorded for `content.data.date`, never
  "now"** (CLAUDE.md §0, #13) — the banner only reads what was recorded.
- No dose is ever written by B — it only changes the form's selection.
- Existing behaviour unchanged otherwise; every interactive element has an
  `accessibilityLabel` + `testID`; stage by path; LF; no `@ts-ignore` / lint
  disables / bare `any`.

## A. Check-in confirmation

- A tiny zustand store `src/features/checkin/checkInFeedbackStore.ts`:
  `{ recorded: { date: string; status: DayStatus; at: number } | null;
  show(...); clear() }`.
- `useDayCheckInResponses`: after `recordDayCheckIn` **resolves**, call
  `show({ date, status, at: Date.now() })`. On a thrown record, don't.
- `src/features/checkin/CheckInRecordedBanner.tsx`: reads the store; renders
  nothing when null; otherwise the banner (themed like the app's other
  notices), fires `tapFeedback('success')` once per `at`, auto-clears after
  4 s (clear the timer on unmount / on a newer `at`), clears on tap.
  Pure helper for the text in `dayCheckInModel.ts`:
  `recordedBannerText(status, date, todayKey)`.
- Mount it at the top of Home (`src/app/(tabs)/index.tsx`).

Tests: text helper (fine/rough, today vs another day); the hook calls
`show` only after a successful record (and not on failure) — extend
`useDayCheckInResponses.test.ts`; the banner renders, fires feedback once,
hides after 4 s (fake timers) and on tap; Home renders the banner (mock the
store or set it).

Commit: `feat(checkin): confirm a check-in answered from the notification`.

## B. Select all

- Pure helpers in `src/lib/medicationEntry.ts`:
  `allLinesSelected(state)` and `setAllLinesSelected(state, selected)`.
- `MedicationEntryForm.tsx`: the link per the judgment above, wired to the
  helpers.

Tests: helpers (all/none/mixed, values preserved); form: Select all ticks
every line (reason fields appear on as-needed lines), label flips to Clear
all, Clear all unticks, hidden with one line; saving after Select all
writes every medication with its default dose (existing save path).

Commit: `feat(meds): Select all / Clear all on the dose entry form`.

## Definition of done

- `npm run typecheck`, `npm run lint` (0 warnings), the **full `npm test`**
  (check `FAIL` lines and `Test Suites:`), `npm run bundle:check`.
- Don't run Maestro / EAS / adb; don't edit `flows/`, `CLAUDE.md`, `docs/`;
  don't push.
- Existing tests change only where needed (e.g. Home's test gaining a store
  mock) — list each with the reason.
- Two commits as above, each ending
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Summary: files per commit + hashes, rung results, full-suite counts,
  existing tests touched and why, deviations.
