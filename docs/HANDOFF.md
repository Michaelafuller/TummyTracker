# HANDOFF.md — Execute session: Medications, Cycle A (inventory + screen + data model)

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§4 rungs, §6
> data-model conventions, §8 conventions, §9 guardrails). This cycle touches
> `src/db/schema.ts` + a **new generated migration**, `src/db/repository.ts`,
> new `src/lib/medications.ts`, `src/lib/backup.ts`,
> `src/components/date-time-field.tsx` (additive prop), `src/components/app-tabs.tsx`,
> `src/app/(tabs)/_layout.tsx`, **moves** `src/app/(tabs)/settings.tsx` →
> `src/app/settings.tsx`, new `src/app/(tabs)/meds.tsx` +
> `src/app/medication/{new,[id]}.tsx`, `src/app/_layout.tsx`, a new tab icon
> SVG + `scripts/generate-icons.mjs`, and tests.
>
> **Pure JS/TS + a bundled PNG asset** — no new dependency, no native/config
> change, no EAS build. **Schema change: owner-approved 2026-09-26** (CLAUDE.md
> §9) — additive migration only.

**Planned 2026-09-26 (Opus plan session), owner-requested — GitHub epic
Michaelafuller/TummyTracker#4, stories #5–#11, split into two cycles:**

- **Cycle A (this file):** #5 inventory, #6 screen (inventory half), #11
  data model + analysis-ready helpers, plus the nav restructure.
- **Cycle B (next handoff):** #7 create entry, #8 entry notes, #9 dosage
  override, #10 history, #6's recent-doses list + fixed **Create Entry** button,
  and doses in the Journal timeline/calendar dots.

**Owner decisions (2026-09-26):**
1. **Settings leaves the tab bar** → a gear button at the top-right of every
   tab screen. Tabs become **Home · Journal · Meds · Insights · Goals**.
2. **Dose units: a fixed list + "Other"** (free-text unit when Other).
3. **Frequency: free text.** No reminders, no schedule inference — reminders
   are a documented future enhancement (PROGRESS.md), out of scope.
4. **Doses will appear in the Journal** (Cycle B; plan the data for it now).
5. The issue's suggested TS model is a starting point, not a contract — the
   model below follows this project's conventions instead (§1 below).

---

## 0. Invariants — read twice

- **Never delete a medication.** Deactivate only (#5). No delete button, no
  `deleteMedication` in the repository.
- **Nothing is ever inferred as taken.** No code path creates a dose from a
  medication's frequency/schedule (#10, #11). Only an explicit user entry
  (Cycle B) writes `medication_dose` rows.
- **Editing a medication never touches dose rows** (#9): a dose snapshots its
  own `dose` + `doseUnit` at log time.
- **Doses reference `medicationId`, never the name** (#11) — renaming or
  deactivating a medication leaves history valid.
- **Timestamps are Unix epoch ms integers** (CLAUDE.md §6) — NOT the issue's
  ISO strings. Date-only fields store **local midnight** epoch ms.
- Do NOT touch `src/app/(tabs)/explore.tsx`, `src/lib/journal.ts`, or their
  tests — an uncommitted owner-review fix (week-strip alignment) lives there.
  Never `git add -A` / `git add .`; stage your files by path.

## 1. Data model — `src/db/schema.ts` (+ `npm run db:generate`)

Mirror the existing `logEntry` / `mealComponent` parent/child pattern (plain
text id columns + indexes, no FK constraints — same as today).

```ts
export const DOSE_UNITS = ['mg', 'mcg', 'g', 'mL', 'tablet', 'capsule', 'drop', 'puff', 'unit'] as const;

// Inventory (#5). Never deleted; isActive=false hides it from pickers only.
medication: id (text pk) · name (text, not null) · defaultDose (real) ·
  doseUnit (text — a DOSE_UNITS value, or the user's own text for "Other") ·
  frequency (text, free) · startDate (integer, local-midnight ms) ·
  endDate (integer, local-midnight ms) ·
  isActive (integer { mode: 'boolean' }, not null, default true) ·
  notes (text) · createdAt · updatedAt (integer, not null)

// One "I took these" event (#7: several medications, one moment).
medication_event: id · takenAt (integer, not null) ·
  timeKnown (integer { mode: 'boolean' }, not null, default true — #10 time
  is optional; when false, takenAt is local noon of the date) ·
  notes (text — #8, per event, separate from medication.notes) ·
  createdAt · updatedAt

// One medication within an event (#9, #11). Snapshots dose + unit.
medication_dose: id · eventId (text, not null, indexed) ·
  medicationId (text, not null, indexed) · dose (real, not null, > 0 —
  partial doses allowed, e.g. 0.5) · doseUnit (text, not null) ·
  createdAt · updatedAt
```

- All three tables are created **now** (one migration, 0009) even though
  Cycle A writes only `medication` — Cycle B then needs no schema change.
- Run `npm run db:generate`; commit the generated SQL, snapshot, `_journal.json`
  and `migrations.js`. Extend `src/db/__tests__/migrations.test.ts` in its
  existing style: 0009 creates the three tables and contains no `drop table`
  and no `alter table \`log_entry\``.

## 2. Pure helpers — new `src/lib/medications.ts` (the main test target)

- `validateMedication(input)` → `{ valid, errors }`: name required (trimmed,
  ≤ 100 chars); `defaultDose` optional but > 0 when present; a unit is required
  when a dose is given; "Other" unit text trimmed, ≤ 20 chars; `endDate` ≥
  `startDate` when both set; notes via the existing `validateNotes` (500).
- `formatDoseSummary(med)` → `"10 mg · twice daily"`, `"10 mg"`,
  `"twice daily"`, or `""` — used by the list rows. Drops trailing zeros
  (`0.5 tablet`, not `0.50`).
- **#11 analysis-ready helpers** (pure, over rows; Cycle B's UI and any future
  insights consume them):
  - `flattenDoseRecords(events, doses)` → one record per dose with exactly #11's
    fields: `{ entryId (dose id), eventId, medicationId, takenAt, timeKnown,
    dose, doseUnit, notes (from the event), createdAt, updatedAt }`.
  - `filterDoseRecordsInRange(records, { start, end })` — half-open, same
    semantics as `lib/journal.ts` ranges.
  - `groupDoseRecordsByMedication(records)` → `Map<medicationId, records[]>`.
  - `wasTakenOn(records, medicationId, dayStartMs)` → boolean; **false** when
    there is no record (never inferred from schedule).

## 3. Repository — `src/db/repository.ts`

`listMedications()` (all, active first then name A–Z), `getMedication(id)`,
`createMedication(input)` (mints id + timestamps), `updateMedication(id,
patch)` (bumps `updatedAt`; must not touch dose rows),
`setMedicationActive(id, isActive)`, and for backup:
`listAllMedicationEvents()`, `listAllMedicationDoses()`,
`insertMedicationsPreservingIds(rows)` / `…Events…` / `…Doses…` (skip rows
whose id already exists). **No delete functions.** Event/dose *creation* is
Cycle B.

## 4. Backup v3 — `src/lib/backup.ts` + the import/export handlers

- `entriesToJson` writes `version: 3` with `medications`, `medicationEvents`,
  `medicationDoses` arrays alongside `entries` + `mealComponents`.
- `parseBackupJson` still reads v1 and v2 (missing arrays → `[]`) and normalises
  medication rows like `normaliseMealComponent` does.
- Import inserts medication rows **preserving their ids** (unlike log entries,
  which are re-minted) — #11's stable ids must survive a restore — skipping
  ids that already exist. Report counts in the existing "Import complete" alert.

## 5. Navigation — Settings to a gear, Meds tab in

- `git mv src/app/(tabs)/settings.tsx src/app/settings.tsx`; register it in
  `src/app/_layout.tsx` as a Stack screen, title "Settings". Drop the screen's
  own "Settings" subtitle + top safe-area padding if the Stack header now
  provides them (keep bottom padding). Move its test alongside if the path
  changes (`src/app/__tests__/settings.test.tsx`).
- New `src/components/settings-button.tsx`: 44×44 gear `Pressable`,
  `accessibilityRole="button"`, `accessibilityLabel="Settings"`,
  `testID="open-settings"`, `router.push('/settings')`. Render it once in
  `src/app/(tabs)/_layout.tsx` as an absolutely-positioned overlay at the
  top-right below the safe-area inset, above every tab. Reuse the existing
  settings tab icon image (tinted `textSecondary`).
- `src/components/app-tabs.tsx`: remove the settings tab; add
  `name="meds"`, title/label "Meds", `tabBarButtonTestID: 'tab-meds'`, placed
  between Journal and Insights.
- Tab icon: new `assets/icons/tab-meds.svg` (simple capsule/pill glyph,
  same 24-unit viewBox/stroke style as `tab-insights.svg`/`tab-settings.svg`)
  + a rasterize line in `scripts/generate-icons.mjs`; run the script and
  commit `assets/images/tabIcons/meds{,@2x,@3x}.png`.
- Check (don't assume) that the gear overlay doesn't cover interactive content
  at the top-right of Home, Journal, Insights, Goals, Meds — add top-right
  padding to a screen's title row if it would.

## 6. Screens

- **`src/app/(tabs)/meds.tsx`** — title "Medications". **Active** list: each
  row name + `formatDoseSummary` secondary line, tap → `/medication/[id]`,
  `testID="med-row-<id>"`, `accessibilityLabel="Edit <name>"`. **Inactive (n)**
  section collapsed by default (Collapsible from `components/ui/collapsible`).
  Empty state: "No medications yet." "Add medication" `PrimaryButton`
  (`accessibilityLabel="Add medication"`) → `/medication/new`. Refresh on
  focus. (Cycle B adds recent doses + the fixed Create Entry button.)
- **`src/app/medication/new.tsx` / `[id].tsx`** (Stack screens, titles "Add
  medication" / "Edit medication") sharing a
  `src/features/medications/MedicationForm.tsx`: Name; Default dose (numeric)
  + Unit chips (`DOSE_UNITS` + "Other" → reveals a unit text field, wraps like
  the meal-slot chips); Frequency (free text, placeholder "e.g. twice daily");
  Start date / End date (optional, date-only — see §7); Notes (500, counter
  like meal review). Save validates via `validateMedication`, shows errors
  inline. `[id]` adds **Mark inactive / Mark active** (no delete, ever).
  Every control gets an `accessibilityLabel` (§8).

## 7. `DateTimeField` — additive date-only mode

Add optional `mode?: 'datetime' | 'date'` (default `'datetime'`, so every
existing caller is unchanged). In `'date'` mode hide the time chip and the Now
shortcut, and add an optional `onClear` so an optional date can be emptied
("Clear" link when set). Extend its existing test file.

## 8. Tests (same change, CLAUDE.md §4)

- `src/lib/__tests__/medications.test.ts` — every validation branch;
  `formatDoseSummary` shapes; `flattenDoseRecords` field mapping (notes come
  from the event; two doses in one event → two records sharing `eventId`);
  range filter edges; grouping; `wasTakenOn` false with no record, true with a
  record at 23:59 that day, false the next day; **a renamed/inactive
  medication's records still group under its id**.
- `src/lib/__tests__/backup.test.ts` — v3 round-trip incl. medication arrays;
  v2 and v1 files still parse (medication arrays default to `[]`).
- `src/db/__tests__/migrations.test.ts` — 0009 as in §1.
- `src/components/__tests__/date-time-field.test.tsx` — date mode hides time +
  Now; Clear calls `onClear`; default mode unchanged.
- Screen tests (mock the repository like sibling tests): meds list renders
  active rows + collapsed inactive count + empty state; Add navigates; form
  shows validation errors and calls `createMedication`/`updateMedication`;
  Mark inactive calls `setMedicationActive(id, false)`; settings-button pushes
  `/settings`; app-tabs has no settings tab and has `tab-meds`.

## 9. Definition of done

- `npm run typecheck` && `npm run lint` clean.
- **Targeted Jest only (owner instruction — do NOT run the full suite):** run
  every test file you created or touched plus `backup`, `migrations`,
  `date-time-field`, `settings`, and any test importing `app-tabs` /
  `(tabs)/_layout` / `repository` types you changed. Paths containing `(tabs)`
  must be run via `npx jest --runTestsByPath "<path>"` — plain path args
  silently skip them.
- **`npm run bundle:check`** — required this cycle (new migration SQL import +
  new PNG assets are exactly the bundler risks §0 of CLAUDE.md warns about).
- No `@ts-ignore`, no lint disables, no `any` without `// reason:`, no new deps.
- Do NOT run Maestro, EAS, or `npx expo start` (Metro is running on 8081 —
  leave it). Do NOT edit `flows/` (the test session owns them — see §10).
- Commits (imperative, scoped, stage by path), suggested split:
  `feat(db): medication, medication_event, medication_dose tables (0009)` ·
  `feat(meds): pure medication validation + analysis-ready dose helpers` ·
  `feat(backup): v3 — include medication inventory and history` ·
  `feat(nav): move Settings to a gear button; add Meds tab` ·
  `feat(meds): medications screen + add/edit/deactivate form` ·
  each ending `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
  Do NOT push.
- Execute summary: files, commits, rung + bundle:check results, targeted Jest
  counts, deviations with reasons, anything the review should examine.

## 10. After this (review + test session)

- Opus review; re-run rungs + bundle:check.
- **Flows referencing `tab-settings` must switch to `open-settings`:**
  `01e-reminders`, `i-backup`, `n-doctor-report`, `nav-tabs`,
  `settings-smoke`. `nav-tabs` also asserts the new tab set.
- **Dev-client caveat:** the Expo dev-tools floating bubble also sits at the
  top-right on dev builds — confirm on device that tapping `open-settings`
  isn't intercepted by it (production builds have no bubble).
- New flow for Cycle A: add → edit → deactivate → appears under Inactive →
  reactivate; plus backup export/import keeps the medication.
