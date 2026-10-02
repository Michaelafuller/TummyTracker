# HANDOFF.md — Execute session: Medication adherence view + as-needed reason, GitHub #28

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§0: synchronous
> transactions; medications #4–#11/#17/#20; #26 regular medications — this
> cycle builds on them). **You are on the burn-down branch
> (`worktree-agent-a93006f35a36fc943`) in its worktree** — #19–#26 are
> reviewed but unmerged; this cycle stacks on them. Never touch the main
> checkout.
>
> **JS/TS + one additive migration (owner-approved 2026-10-01)** — no
> dependency (`react-native-calendars` is already in the stack), no
> permission, no native change, no EAS build.

**Planned 2026-10-01 (Opus plan session, owner-reviewed) — GitHub
Michaelafuller/TummyTracker#28.** Done-when (issue): "each medication shows
e.g. 'taken 26 of 30 days' and an as-needed entry can record a reason."
Owner decisions (2026-10-01):

1. **Logged days, never "missed".** Regular medications (#26 `isRegular`):
   "Logged on 26 of the last 30 days". As-needed (not regular): "Logged on 4
   days in the last 30" — no "of", no percentage.
2. **A month calendar on each medication's own screen** marking the days
   with a dose (previous/next month), plus the summary line on each Meds tab
   row.
3. **A `reason` per dose** — additive column `medication_dose.reason`,
   migration **0015**, backups **v9**. Asked only on lines for **non-regular**
   medications in the dose entry form; shown wherever a dose is listed
   ("Ibuprofen 200 mg — headache").
4. **Reason input = free text + chips** of the reasons previously used for
   that medication.

Plan-session judgments (flag them in your summary; owner may override):
- **The window** = the 30 local days ending today (today included). For a
  regular medication the denominator starts at the later of the window
  start, the medication's `startDate`, and its **first logged dose ever**
  (so a med started 10 days ago reads "of the last 10 days"), and ends at its
  `endDate` if earlier. A day counts once however many doses it has. Reuse
  the day-counting helpers behind `summarizeMedicationUse` (#17,
  `src/lib/medications.ts`) rather than writing new day math — and make the
  PDF and this line agree for the same range.
- **Wording:** regular with denominator `M`: `M === 30` → "Logged on N of the
  last 30 days"; `M < 30` → "Logged on N of the last M days"; as-needed:
  "Logged on N days in the last 30" ("1 day"); none at all → "No doses
  logged in the last 30 days".
- **Reason:** trimmed, max 60 chars (validation in `src/lib/`), empty → null.
  Chips = that medication's distinct past reasons, most recent first, at
  most 5, case-insensitively de-duplicated (first-seen casing). Tapping a
  chip fills the field. A reason already saved on a dose of a medication
  that later becomes regular is kept and still shown (never dropped).
- **Calendar marking** = days with ≥ 1 dose of this medication (dot).
  Tapping a day does nothing this cycle.

---

## 0. Invariants — read twice

- **Never "missed", "skipped" or a percentage** anywhere. A day without a
  logged dose is unknown, not a missed dose.
- **Doses still come only from explicit entries** — this cycle only reads
  them (plus the new optional reason on the entry form).
- **No existing number changes**: the PDF's medication table, the Meds tab's
  existing rows, #20's analysis and #26's regular-meds button behave as
  before (the PDF/journal may gain the reason text after a dose — that is
  the only visible change there).
- Synchronous repository transactions; `accessibilityLabel` + `testID` on
  everything interactive; stage by path; LF; no `@ts-ignore` / lint
  disables / bare `any`.

## 1. Schema + migration 0015 + backup v9

`medicationDose.reason` — `text('reason')`, nullable. `npm run db:generate`
→ a single `ALTER TABLE \`medication_dose\` ADD \`reason\` text;` (paste it).
Migration harness test. Backups v9: dose rows carry `reason`;
`parseBackupJson` normalises a missing / non-string / blank reason to null;
v1–v8 import unchanged. Tests: v9 round trip, a v8 dose imports with
`reason: null`.

Commit: `feat(db): medication_dose.reason + additive migration 0015, backup v9`.

## 2. Pure logic — `src/lib/medications.ts` (or a sibling pure module)

- `adherenceSummary(med, events, doses, now): { daysWithDose: number; denominator: number | null }`
  — `denominator` null for a non-regular medication (per the rules above).
- `adherenceLine(med, summary): string` — the wording above.
- `doseDaysInMonth(medicationId, events, doses, year, month): Set<string>`
  (local 'YYYY-MM-DD' keys) — or a marked-dates map for the calendar.
- `pastReasons(medicationId, events, doses): string[]` — chips rule above.
- `validateReason(text)` + the max length constant.
- Extend the shared dose-label formatting so a dose with a reason renders
  "200 mg — headache"; use it at **every** place a dose is shown as
  "<dose> <unit>" (journal rows `src/lib/journal.ts`, the PDF dose rows,
  the medication history / event rows — find them all with a grep and list
  them in your summary). The PDF's "amounts" summary
  (`summarizeAmounts`) stays amount-only (a reason isn't an amount).

Tests: window edges (dose at 00:00 today, 29 and 30 days ago), DST-safe day
counting, start/end/first-dose clipping, several doses one day, regular vs
as-needed, each wording branch, chips order/dedupe/limit, reason
validation, labels with and without a reason.

Commit: `feat(meds): adherence summary, dose calendar days, past reasons`.

## 3. Dose entry form — reason on as-needed lines

`src/lib/medicationEntry.ts` + `MedicationEntryForm.tsx`: `DoseLineState`
gains `reasonInput: string`; a **selected** line for a non-regular medication
shows a "Reason (optional)" field (`accessibilityLabel="Reason for <name>"`,
`testID="dose-reason-<medicationId>"`) with the chips
(`testID="dose-reason-chip-<medicationId>-<i>"`). Regular lines never show
it (but an existing reason on an edited event is preserved, not cleared).
`buildMedicationEntry` validates and returns `reason` on each dose;
`entryStateFromEvent` fills it back in; `createMedicationEvent` /
`updateMedicationEvent` store it (the `MedicationDoseInput` type gains an
optional `reason`). #26's `regularDoses` writes `reason: null`.

Tests: model (build/round trip/validation, regular line has no reason
input), form (field only on selected as-needed lines, chip fills the field),
repository create/update keep the reason (real-SQLite test).

Commit: `feat(meds): reason for as-needed doses`.

## 4. Screens

- **Meds tab rows** (`src/app/(tabs)/meds.tsx`): each active medication row
  gains the adherence line (`testID="adherence-<medicationId>"`) under its
  existing summary. Inactive rows: unchanged.
- **Medication screen** (`src/app/medication/[id].tsx`): above the edit
  form, the adherence line and a month `Calendar` from
  `react-native-calendars` (as `explore.tsx` uses it) with dots on dose days
  (`testID="dose-calendar"`), opening on the current month, prev/next
  arrows. Theme colours like the Journal calendar. Nothing else on the
  screen changes.
- Dose rows that list a reason (history, journal, PDF) — via §2's label.

Tests: Meds tab line for a regular and an as-needed med; medication screen
renders the line and marks the right days (assert the `markedDates` you
pass); history/journal show "— reason"; the PDF's Medications/Journal
include the reason text; existing screen tests pass (only add mocks if the
new code needs them, and list them).

Commit: `feat(meds): adherence on the Meds tab and a dose calendar per medication`.

## 5. Definition of done

- `npm run typecheck`, `npm run lint` (0 warnings), `npm run bundle:check`.
- **Targeted Jest only (never the full suite)** — when you read results,
  check `FAIL` lines and the `Test Suites:` count, not just `Tests:`:
  files you created/touched, all `src/db/__tests__/*`,
  `src/lib/__tests__/{backup,medications,medicationEntry,journal,report,validation}*`,
  `src/features/{medications,analysis}/__tests__/*`,
  `src/app/medication/**/__tests__/*`, and via `--runTestsByPath`: Meds
  `meds.test.tsx`, Journal `explore.test.tsx`, `settings.test.tsx`.
- No deps, no schema change beyond §1. Don't run Maestro / EAS / `expo
  start` / adb; don't edit `flows/`, `CLAUDE.md`, `docs/`; don't push or merge.
- If an existing test must change, only because the spec changes that
  behaviour (backup 8 → 9, a fixture gaining `reason: null`, a mock gaining
  a function) — list each with the reason.
- Commits as listed (stage by path), each ending
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- **Execute summary:** files per commit + hashes; the generated SQL
  verbatim; rung results; targeted Jest counts (suites + tests); the list of
  dose-label sites you changed; a worked example from a test (a regular and
  an as-needed med → their lines); every existing test touched and why;
  deviations; review pointers (day math at the window edges, the first-dose
  clipping, reason preservation on regular lines).
