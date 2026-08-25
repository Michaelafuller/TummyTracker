# HANDOFF.md — Execute session: multi-symptom logging in one instance

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§4 rungs, §8
> conventions, §9 guardrails). This cycle touches
> `src/features/symptoms/formModel.ts`, `SymptomTypePicker.tsx`,
> `SymptomForm.tsx`, `src/app/symptom/new.tsx`, `src/db/repository.ts`,
> `src/app/entry/[id].tsx` (one-line wrapper only), and tests. **No new
> dependency. No schema change, no migration** — the design deliberately
> fans out to existing single-symptom rows.

**Planned 2026-08-24 (Fable plan session), owner-requested and pinned to the
top of the backlog:** log multiple symptoms in a single pass (e.g. nausea AND
bloating) instead of opening the symptom screen once per symptom.

---

## 0. Design decision (context — do not re-litigate)

**Multi-select picker on the *new symptom* screen; save creates one `logEntry`
row per selected symptom.** All rows share the same `loggedAt`, `severity`,
and `notes`; each row keeps its own `symptomType` and per-type `name`
("Nausea", "Bloating") exactly as today.

Why fan-out instead of a multi-type column:
- **Zero schema change** — no migration, no §9 guardrail conversation.
- **Per-symptom granularity is the product.** `isOutcome` (severity ≥ 3),
  temporal correlation, insights, journal rows, daily tally, and backup all
  consume one-symptom-per-row and keep working untouched.
- Each symptom stays individually editable/deletable afterward (the edit
  screen stays single-select — one row is one symptom).

Accepted trade-offs (by design, don't "fix"): shared severity/notes across the
batch (the user can fine-tune an individual entry afterward); notes text is
duplicated per row.

## 1. Changes

### 1.1 `src/features/symptoms/formModel.ts`

- `SymptomFormState.symptomType: SymptomTypeValue | null` →
  **`symptomTypes: SymptomTypeValue[]`** (order = tap order; empty = none).
- Replace `buildSymptomEntry` with **`buildSymptomEntries(state)`** returning
  `{ valid: boolean; entries?: BuiltSymptomEntry[]; errors: SymptomFormErrors }`:
  - Validate date/time + notes once (unchanged rules).
  - `symptomTypes.length === 0` → **one** entry with `symptomType: null`,
    name `"Symptom"` (preserves today's optional-type behavior).
  - Otherwise one entry per selected type, `name: symptomTypeLabel(type)`,
    all sharing `loggedAt` / `severity` / trimmed `notes`.
  - `BuiltSymptomEntry` shape is unchanged.
- `symptomEntryToFormState`: `symptomTypes: isSymptomTypeValue(entry.symptomType)
  ? [entry.symptomType] : []`.
- Keep `symptomEntryName` as-is (still used for per-entry names).

### 1.2 `src/features/symptoms/SymptomTypePicker.tsx`

Props → `values: readonly SymptomTypeValue[]`, `onToggle: (value) => void`,
`onClear?: () => void`. A chip is selected iff `values.includes(option.value)`;
keep each chip's `accessibilityLabel={option.label}` **exactly** (Maestro
`c-symptom-logging.yaml` taps `"Bloating"` — a single tap must still select).
"Clear" link shows when `values.length > 0`, label stays
`"Clear symptom type"`.

### 1.3 `src/features/symptoms/SymptomForm.tsx`

- State uses `symptomTypes: []`; add prop **`single?: boolean`** (default
  false).
- Toggle handler: multi mode → add/remove membership; `single` mode → replace
  the selection with `[value]` (tap = pick, matching today's edit behavior).
- Field label: multi mode `"Symptom types (optional)"` with hint
  `"Select all that apply"`; single mode keeps `"Symptom type (optional)"`.
- `onSubmit` signature becomes **`(entries: BuiltSymptomEntry[])`** — submit
  runs `buildSymptomEntries` and passes `result.entries` (always length ≥ 1
  when valid).

### 1.4 `src/db/repository.ts` — `createLogEntries(inputs: CreateLogEntryInput[]): Promise<LogEntry[]>`

One transaction (mirror `deleteMealComponentAndReaggregate`'s transaction
style): for each input, same id/timestamp stamping as `createLogEntry`;
insert all rows; return them. Keep `createLogEntry` unchanged (other callers).

### 1.5 Screens

- `src/app/symptom/new.tsx`: `handleSubmit(entries: BuiltSymptomEntry[])` →
  `await createLogEntries(entries)` → `router.back()` (submitting guard
  unchanged).
- `src/app/entry/[id].tsx`: symptom branch passes `single` to `SymptomForm`
  and adapts the callback: `onSubmit={(entries) => handleSubmit(entries[0])}`.
  Nothing else on the edit path changes.

## 2. Tests (same change, per CLAUDE.md §4)

- **`src/features/symptoms/__tests__/symptoms.test.ts`** — rework the
  `buildSymptomEntry` block for `buildSymptomEntries`:
  - two types → two entries; shared `loggedAt`/`severity`/`notes`; names
    `"Nausea"` / `"Bloating"`; both `type: 'symptom'`, food fields null.
  - empty selection → exactly one generic `"Symptom"` entry (type null).
  - invalid date / over-long notes → `valid: false`, no entries.
  - round-trip: `symptomEntryToFormState` yields `symptomTypes: ['bloating']`
    and rebuilds a single matching entry.
- **New `src/features/symptoms/__tests__/SymptomForm.test.tsx`** (async RNTL
  v14 — `await render(...)`, `await fireEvent(...)`, destructure queries from
  the awaited result; the global `screen` proxy is unreliable):
  - multi mode: tap `"Nausea"` + `"Bloating"`, press Save → `onSubmit` gets 2
    entries; tapping `"Nausea"` again before save deselects → 1 entry.
  - `single` mode: tap `"Nausea"` then `"Bloating"` → save yields 1 entry
    with `symptomType: 'bloating'`.
- **New `src/app/symptom/__tests__/new.test.tsx`** (mock `expo-router`'s
  `useRouter` and `@/db/repository`, following `src/app/entry/__tests__/
  [id].test.tsx` patterns): select two chips, Save → `createLogEntries`
  called once with 2 inputs → `router.back()`.
- **`src/app/entry/__tests__/[id].test.tsx`** — keep green; the symptom-edit
  case must still save a single updated entry through the adapted callback.

## 3. Definition of done

- `npm run typecheck` && `npm run lint` && `npm test` green — run them.
- No `// @ts-ignore`, no lint disables, no new dependency, no schema change.
- Commits (imperative, scoped), suggested split:
  `feat(symptoms): multi-select symptom types — fan out one entry per symptom
  on save` · `test(symptoms): form + screen coverage for multi-symptom save`.
- Execute summary: file list, rung counts, any deviations from this spec.

## 4. After this (review pass + test sessions)

Fable reviews the diff for remediation before anything ships. Test session
owed: extend `flows/c-symptom-logging.yaml` (or a new `c2-multi-symptom.yaml`)
— tap two chips, save once, assert **two** journal rows at the same time;
existing single-tap flow must keep passing. Device pass rides the next
Metro-connected session; no build needed (pure JS/TS).
