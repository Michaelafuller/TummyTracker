# HANDOFF.md — Execute session: Medications, Cycle B (log doses + history + Journal) + gear icon

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§4 rungs, §6,
> §8 conventions, §9 guardrails). Cycle A (tables, inventory, Meds tab,
> Settings gear, backup v3) shipped 2026-09-26 — see `git log 4d017be..692ab88`.
> This cycle touches `src/db/repository.ts`, `src/lib/journal.ts`,
> new `src/lib/medicationEntry.ts`, `src/features/medications/*`,
> `src/features/logging/EntryList.tsx`, `src/app/(tabs)/meds.tsx`,
> `src/app/(tabs)/explore.tsx`, new `src/app/medication/entry/{new,[id]}.tsx` +
> `src/app/medication/history.tsx`, `src/app/_layout.tsx`,
> `assets/icons/tab-settings.svg`, `scripts/generate-icons.mjs`, the settings
> tab PNGs, and tests.
>
> **Pure JS/TS + regenerated PNG assets** — no new dependency, **no schema
> change** (Cycle A's 0009 already created `medication_event` +
> `medication_dose`), no native change, no EAS build.

**Planned 2026-09-26 (Opus plan session) — GitHub epic
Michaelafuller/TummyTracker#4: #7 create entry, #8 entry notes, #9 dosage
override, #10 history, #6's recent doses + Create Entry button; plus doses in
the Journal (owner: "trust your judgement" → yes), two Cycle A review
follow-ups, and an owner-requested gear icon redesign.**

---

## 0. Invariants — read twice (unchanged from Cycle A, now load-bearing)

- **Nothing is ever inferred as taken.** Only the Create Entry form (and
  backup restore) writes `medication_event` / `medication_dose`. No code
  derives doses from `frequency`, start/end dates, or "active".
- **A dose snapshots `dose` + `doseUnit` at log time.** Editing a medication's
  default never rewrites a dose; editing a dose never touches the medication.
- **Doses reference `medicationId`.** Inactive/renamed medications still show
  their current name on old doses and remain in history and the Journal.
- **Medications are never deleted.** A *dose entry* (event) may be deleted —
  it's the user correcting their own log — with a confirm, removing the event
  and its dose rows together in one transaction.
- **Insights, Goals and meal review stay food-only.** They keep reading
  `useAllEntries()` (logEntry). Medications appear in the **Journal only**;
  correlation with outcomes is future work (#11 only prepares the data).
- Stage files by path — never `git add -A` / `git add .`.

## 1. Gear icon — owner-requested (do this first; it's small)

The current `assets/icons/tab-settings.svg` is a 24-point zig-zag (reads as a
spiky starburst) and its hub hole doesn't even render (the inner circle is
wound the same way as the outline). Replace the file's contents **verbatim**
with this — geometry-generated (8 flat-topped teeth, rounded joins, evenodd
hub), already rendered and checked at 480px and 72px in the plan session:

```svg
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path fill="white" fill-rule="evenodd" stroke="white" stroke-width="1.1" stroke-linejoin="round"
    d="M10.520 4.240 L10.940 1.654 L13.060 1.654 L13.480 4.240 A7.9 7.9 0 0 1 16.440 5.466 L16.440 5.466 L18.566 3.935 L20.065 5.434 L18.534 7.560 A7.9 7.9 0 0 1 19.760 10.520 L19.760 10.520 L22.346 10.940 L22.346 13.060 L19.760 13.480 A7.9 7.9 0 0 1 18.534 16.440 L18.534 16.440 L20.065 18.566 L18.566 20.065 L16.440 18.534 A7.9 7.9 0 0 1 13.480 19.760 L13.480 19.760 L13.060 22.346 L10.940 22.346 L10.520 19.760 A7.9 7.9 0 0 1 7.560 18.534 L7.560 18.534 L5.434 20.065 L3.935 18.566 L5.466 16.440 A7.9 7.9 0 0 1 4.240 13.480 L4.240 13.480 L1.654 13.060 L1.654 10.940 L4.240 10.520 A7.9 7.9 0 0 1 5.466 7.560 L5.466 7.560 L3.935 5.434 L5.434 3.935 L7.560 5.466 A7.9 7.9 0 0 1 10.520 4.240 Z M15.3 12 A3.3 3.3 0 1 0 8.7 12 A3.3 3.3 0 1 0 15.3 12 Z"/>
</svg>
```

- **Fix `scripts/generate-icons.mjs`** (Cycle A follow-up): it still
  rasterizes `assets/icons/icon.svg` / `icon-monochrome.svg`, deleted in
  `65e7014`, so it throws before reaching the tab icons. Guard each
  `rasterize` source with `existsSync` — skip with a clear
  `console.warn('  – skipped (missing source): …')` — so the script runs
  end-to-end with today's assets. Don't recreate or change the app icons.
- Run `node scripts/generate-icons.mjs`. Commit `assets/icons/tab-settings.svg`
  + `assets/images/tabIcons/settings{,@2x,@3x}.png`. If the run also rewrites
  `insights*.png` / `meds*.png` / any other PNG, `git checkout` those — this
  commit changes the gear only.
- The gear PNG is used by `src/components/settings-button.tsx` (Settings is no
  longer a tab); no code change needed there.

## 2. Restore hardening — chunked inserts (Cycle A follow-up)

`insertMedicationsPreservingIds` / `…Events…` / `…Doses…` in
`repository.ts` do one `inArray(...)` lookup and one multi-row INSERT per
table. SQLite caps bound variables at 32,766 — `medication_dose` (7 cols)
hits it at ~4,700 rows. Add a small pure `chunk<T>(rows, size)` in
`src/lib/` (unit-tested) and process ids/rows in chunks of **500 rows**
(both the existence lookup and the insert). Behavior otherwise identical.

## 3. Pure logic

### 3.1 New `src/lib/medicationEntry.ts` — the entry form model (main test target)

```ts
export interface DoseLineState { medicationId: string; selected: boolean; doseInput: string; doseUnit: string }
export interface MedicationEntryFormState {
  dateInput: string; timeInput: string; timeKnown: boolean;
  lines: DoseLineState[]; notes: string;
}
export function defaultEntryState(activeMeds: readonly Medication[], now: number): MedicationEntryFormState
export function entryStateFromEvent(event: MedicationEvent, doses: readonly MedicationDose[],
  meds: readonly Medication[]): MedicationEntryFormState
export function buildMedicationEntry(state: MedicationEntryFormState):
  { valid: boolean; errors: MedicationEntryErrors;
    event?: { takenAt: number; timeKnown: boolean; notes: string | null };
    doses?: { medicationId: string; dose: number; doseUnit: string }[] }
```

- `defaultEntryState`: date/time = now, `timeKnown: true`, one **unselected**
  line per *active* medication, pre-filled with its `defaultDose` / `doseUnit`
  (#7, #9). Order: same as the Meds list.
- `entryStateFromEvent`: lines for every medication in the event (**including
  inactive ones**, selected) + the other active meds (unselected).
- Validation: ≥ 1 selected line ("Select at least one medication"); each
  selected line's dose parses and is > 0 (partial doses like `0.5` fine) and
  has a unit; valid date (+ time when `timeKnown`); notes via `validateNotes`.
- `timeKnown: false` → `takenAt` = **local noon** of the date (so it lands on
  the right day in every timezone-offset edge); the UI shows "time not set".
- Never mutates medication defaults — it only returns event + dose payloads.

### 3.2 `src/lib/journal.ts` — Journal items (additive)

```ts
export type JournalItem =
  | { kind: 'log'; id: string; loggedAt: number; entry: LogEntry }
  | { kind: 'medication'; id: string /* eventId */; loggedAt: number; timeKnown: boolean;
      summary: string /* "Omeprazole 20 mg · Ibuprofen 200 mg" */; notes: string | null };
export function logEntriesToJournalItems(entries: readonly LogEntry[]): JournalItem[]
export function medicationEventsToJournalItems(events, doses, meds): JournalItem[]
export function filterJournalItems(items, filter: EntryTypeFilter): JournalItem[]
```

- Extend `EntryTypeFilter` with `'meds'`: `'all'` = everything, `'meds'` =
  medication items only, `'food'|'bm'|'symptom'` = log items of that type only
  (no medication items). Keep `filterByEntryType` working for its other callers.
- Summary uses the medication's *current* name (inactive included) +
  `formatDoseSummary`-style `"20 mg"` of the **dose's own snapshot**; an event
  whose medication row is missing (shouldn't happen) shows "Unknown medication".
- The existing generic `filterEntriesInRange` / `groupEntriesByDay` /
  `entryDateKeys` already work on `{ loggedAt }` — reuse, don't fork.

## 4. Repository + live hooks

- `createMedicationEvent(event, doses)` — one transaction, mints ids + timestamps.
- `updateMedicationEvent(id, event, doses)` — one transaction: update the
  event row, delete its dose rows, insert the new ones (bump `updatedAt`).
- `deleteMedicationEvent(id)` — one transaction: its doses, then the event.
- `getMedicationEvent(id)` → `{ event, doses } | undefined`.
- New `src/features/medications/useMedicationData.ts`: `useMedications()`,
  `useMedicationEvents()` (newest first), `useMedicationDoses()` via
  `useLiveQuery`, mirroring `useAllEntries` — so the Meds tab, history and
  Journal refresh automatically after a save/delete.

## 5. Screens

- **Create / edit entry** — `src/app/medication/entry/new.tsx` and
  `entry/[id].tsx` (Stack screens, titles "Log medication" / "Edit entry"),
  sharing `src/features/medications/MedicationEntryForm.tsx`:
  - `DateTimeField` (datetime mode) + a "Time not known" switch
    (`accessibilityLabel="Time not known"`) that hides the time chip.
  - One row per line: a checkbox-style `Pressable`
    (`accessibilityRole="checkbox"`, `accessibilityState={{ checked }}`,
    `accessibilityLabel="Took <name>"`, `testID="dose-line-<medicationId>"`);
    when checked, a dose input (`accessibilityLabel="Dose of <name>"`,
    pre-filled default) + unit shown/editable (reuse Cycle A's unit chips).
    Inactive meds show an "inactive" tag (edit screen only).
  - Notes (500, counter). Save → `createMedicationEvent` /
    `updateMedicationEvent`, then back. Edit screen adds **Delete entry**
    (confirm Alert, like `entry/[id].tsx`).
  - Empty state when there are no active meds: "Add a medication first" +
    button to `/medication/new`.
- **Meds tab** (`meds.tsx`):
  - **Create entry** `PrimaryButton` **fixed at the bottom** (outside the
    ScrollView, above the tab bar — #6), `accessibilityLabel="Create entry"`,
    → `/medication/entry/new`; disabled with the hint "Add a medication to
    log doses" when there are no active meds. "Add medication" stays, as a
    secondary button under the lists.
  - **Recent doses** section (after the active list): the 5 newest events —
    date + time (or "time not set"), summary, a notes glyph when notes exist;
    tap → `/medication/entry/[id]`. "See all history" link →
    `/medication/history`. Empty: "No doses logged yet."
  - Scroll content gets bottom padding so the fixed button never covers the
    last row.
- **History** — `src/app/medication/history.tsx` (title "Medication history",
  #10): all events newest first, grouped by day (reuse `groupEntriesByDay` on
  journal items); filter chips "All" + one per medication that has doses
  (inactive included, `SegmentedControl` like the Journal). Tap → edit entry.
- **Journal** (`explore.tsx` + `EntryList.tsx`):
  - Add a **"Meds"** filter chip after "Symptom".
  - Merge `logEntriesToJournalItems(entries)` +
    `medicationEventsToJournalItems(...)`, then filter/range/group as today.
    Calendar dots come from the merged, filtered items.
  - `EntryList` renders `JournalItem[]`: log items → existing `EntryRow`
    (unchanged); medication items → new `MedicationEventRow` (time or "time
    not set", "Medication" type label, summary, notes glyph;
    `testID="journal-med-<eventId>"`; tap → edit entry). Keep `EntryList`'s
    other callers working (adapt them via `logEntriesToJournalItems`).
  - **Do not change** the week-strip sizing / today styling from `4a668e7`.

## 6. Tests (same change, CLAUDE.md §4)

- `src/lib/__tests__/medicationEntry.test.ts` — defaults (active only,
  unselected, defaults pre-filled); edit state includes inactive meds;
  every validation branch; partial dose 0.5; override doesn't alter the
  input medication objects (deep-equal before/after); `timeKnown: false` →
  local noon.
- `src/lib/__tests__/journal.test.ts` — item mapping, summary text (inactive
  name, snapshot dose not the current default), `'meds'` filter + other
  filters exclude meds, merged sort order, dots include med days.
- `chunk` helper test; repository-level logic is exercised via mocked screen
  tests as elsewhere (no DB test harness exists).
- Screen tests (mock repository + hooks like siblings): entry form select /
  override / save payload; delete confirm; Meds tab fixed Create entry
  (enabled/disabled), recent doses + empty state; history filter; Journal
  Meds chip shows only medication rows and "All" shows both.
- Existing Journal/explore, meds, EntryList callers' tests stay green.

## 7. Definition of done

- `npm run typecheck` && `npm run lint` clean; **`npm run bundle:check`**
  (asset regeneration).
- **Targeted Jest only (owner instruction — never the full suite):** every
  test file you created or touched + `journal`, `backup`, `medications`,
  `explore`, `meds`, `settings-button`, and any test of an `EntryList`
  caller. `(tabs)` paths via `npx jest --runTestsByPath "<path>"`.
- No `@ts-ignore`, no lint disables, no `any` without `// reason:`, no new
  deps, no schema change (if you think you need one, stop and report).
- Do NOT run Maestro, EAS, or `npx expo start` (Metro runs on 8081 — leave
  it). Do NOT edit `flows/`.
- Commits (stage by path), suggested split:
  `fix(icons): real gear glyph for Settings; make generate-icons runnable` ·
  `fix(backup): chunk id-preserving medication restores` ·
  `feat(meds): medication entry model + event repository + live hooks` ·
  `feat(meds): log and edit medication entries; recent doses + history` ·
  `feat(journal): medication entries in the Journal with a Meds filter` —
  each ending `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
  Do NOT push.
- Execute summary: files per commit, hashes, rung + bundle:check results,
  targeted Jest counts, deviations with reasons, review/device-test pointers.

## 8. After this (review + test session)

- Opus review; re-run rungs + bundle:check.
- New flow: log a two-medication entry with one dose overridden to half →
  Recent doses shows it → Journal "Meds" chip shows it, "Food" hides it →
  edit notes → delete (confirm) → gone everywhere; medication defaults
  unchanged throughout.
- Regression: `r-medications`, `journal-calendar`, `01d-browse-edit`,
  `nav-tabs` (gear icon visual check in a screenshot).
