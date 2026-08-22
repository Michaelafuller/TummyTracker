# HANDOFF.md — Execute session: Goals tab — tally drill-down, "Today" rename, long date

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§4 rungs, §8
> conventions). This cycle touches `src/app/(tabs)/goals.tsx` (+ its test),
> `src/lib/dailyTally.ts` (+ test), `src/lib/datetime.ts` (+ test), and a
> one-line import swap in `src/lib/journal.ts`. Pure JS/TS — no dependency, no
> schema change, no config change, no build, no device. Maestro work is a later
> test session's job (§3).

**Planned 2026-08-21 (Fable plan session), owner-requested.** One cycle, three
small pieces on one screen — commit them separately.

---

## 0. Context (verified by the plan session — don't re-derive)

- `src/app/(tabs)/goals.tsx` renders, top to bottom: a header (`<ThemedText
  type="subtitle">Goals</ThemedText>` + `todayHeading(now)` = `"Today ·
  2026-08-21"` via `formatDateInput`), then the **daily tally table** (one
  `View` row per `NUTRITION_FIELDS` entry; each row is `accessible` with a
  composite `accessibilityLabel`, shows label + missing-data caveat on the
  left and total / goal progress on the right), then `<GoalsSection />` (its
  own `"Goals"` subtitle + per-nutrient goal rows that **expand inline** when
  tapped — the accordion idiom this cycle reuses), then `<CheckInSection />`.
- `src/lib/dailyTally.ts` → `tallyDailyNutrition(entries, start, end)`
  sums food-type parent rows (`FOOD_TYPES`) in `[start, end)`; per-nutrient
  `total` is null only when no entry had a value; `decimalsFor(field)`
  rounds calories/sodium to 0 dp, grams to 1 dp. There is **no per-entry
  contribution data** today — that's the new pure function.
- `src/lib/datetime.ts` has `formatDateInput` (YYYY-MM-DD), `formatTime12h`
  (`"3:07 PM"`), `dayBounds`. No long-date formatter exists. `src/lib/journal.ts`
  has a private `MONTHS_LONG` array (full month names) used only by
  `formatPeriodLabel`'s month mode.
- `nutritionUnit(field)` returns `'g'`, `'mg'`, or `''` (calories); the table
  renders calories totals with no unit (e.g. `"500"`). `NUTRITION_NOUNS`
  gives lowercase nouns ("fat", "saturated fat").
- Tests: `src/app/(tabs)/__tests__/goals.test.tsx` mocks
  `@/features/logging/useEntries`, `@/db/repository`, and
  `@/features/goals/checkInService`; it does **not** mock `expo-router`
  (the screen doesn't use it yet) and asserts no heading/date text. It
  asserts tally totals by bare text (`getByText('450')`), so the table's
  number nodes must keep rendering as standalone text.
- Maestro flows assert `"Goals"` (still satisfied by `GoalsSection`'s own
  subtitle after the rename), `"From 1 entry today"`, `"500"`, `"1 entry
  missing"`, `"10g / 50g"` — all text nodes that must survive unchanged.
  None taps a tally row.

## 1. The change

### 1.1 Pure logic — `src/lib/dailyTally.ts`

Add, alongside `tallyDailyNutrition` (same food-type + `[start, end)`
filtering — factor the filter into a shared private helper rather than
duplicating it):

```ts
export interface NutrientContribution {
  id: string;        // logEntry id (for navigation)
  name: string;
  loggedAt: number;
  value: number;     // rounded with decimalsFor(field)
}
export interface NutrientMissing { id: string; name: string; loggedAt: number }
export interface NutrientContributions {
  contributors: NutrientContribution[];   // value desc, ties by loggedAt asc
  missing: NutrientMissing[];             // loggedAt asc
}
export function nutrientContributions(
  entries: readonly LogEntry[], field: NutritionField, start: number, end: number,
): NutrientContributions
```

A logged `0` is a contributor (value 0), not missing — same rule as the tally.

Tests (`src/lib/__tests__/dailyTally.test.ts`): contributors sorted by value
desc with the loggedAt tiebreak; missing split out and in time order;
non-food and out-of-range entries excluded; a `0` value counts as a
contributor; **invariant** — the sum of contributors' values equals
`tallyDailyNutrition(...).nutrients[field].total` for the same inputs
(within rounding), and `contributors.length + missing.length ===
entryCount`.

### 1.2 Pure logic — `src/lib/datetime.ts`

- Export `MONTHS_LONG` from `datetime.ts` (move the array out of
  `journal.ts`; `journal.ts` imports it from `@/lib/datetime` and drops its
  local copy — no behavior change, existing journal tests must stay green).
- Add `formatLongDate(epochMs: number): string` → local-time
  `"August 21, 2026"` (full month name, unpadded day, 4-digit year). Use
  `Date` getters like every other formatter here — **not**
  `toLocaleDateString` — so output is deterministic in Jest and on Hermes.

Tests (`src/lib/__tests__/datetime.test.ts`, extend the existing file):
a fixed local date built with `new Date(2026, 7, 21, 12).getTime()` →
`"August 21, 2026"`; a single-digit day (`new Date(2026, 0, 5, 12)`) →
`"January 5, 2026"`.

### 1.3 Screen — `src/app/(tabs)/goals.tsx`

**Rename + date.** The page header's `"Goals"` subtitle becomes `"Today"`;
the line under it becomes just `formatLongDate(now)` (drop the `"Today · "`
prefix — redundant under a "Today" heading). Delete `todayHeading`. The
**tab** label stays `"Goals"` (`src/components/app-tabs.tsx` untouched) and
`GoalsSection`'s `"Goals"` subtitle is untouched — it is now the one and
only "Goals" heading on the page, which is the point of the rename.

**Expandable tally rows** (the feature):
- `const [expandedField, setExpandedField] = useState<NutritionField | null>(null)`
  — one row open at a time, tapping the open row collapses it (mirror
  `GoalsSection.toggleExpand`).
- Each tally row becomes a `Pressable` (keep `accessible` + the existing
  composite `accessibilityLabel` verbatim; add `accessibilityRole="button"`,
  `accessibilityState={{ expanded: expandedField === field }}`,
  `accessibilityHint="Shows the entries that make up this total"`,
  `testID={`tally-row-${field}`}`). Add a small trailing chevron glyph
  (`ThemedText` textSecondary, `"›"` collapsed / `"⌄"` expanded) after the
  progress text so the row reads as tappable; keep the progress text node
  exactly as today (flows assert its bare text).
- When `expandedField === field`, render a panel directly beneath that row,
  inside the table (themed `backgroundSelected`-ish inset, hairline top
  border), computed via `nutrientContributions(entries, field, start, end)`
  (memoize on `[entries, expandedField, start, end]` is fine; it's a tiny
  list):
  - One sub-row per contributor: left = entry name (`numberOfLines={1}`) with
    a secondary line `formatTime12h(loggedAt)` (append ` · ${mealSlot}` when
    set); right = `smallBold` amount `unit ? `${value}${unit}` : String(value)`
    (matches the table's own unit convention — calories stay unitless).
  - Then one sub-row per missing entry: name + time on the left, right text
    `"no data"` in textSecondary — this is the "1 entry missing" caveat made
    actionable.
  - Every sub-row is a `Pressable` → `router.push(`/entry/${id}`)` (the
    existing edit screen is the natural next drill-down; `useRouter` from
    `expo-router`), `accessibilityRole="button"`,
    `accessibilityLabel={`Open ${name}`}`, `testID={`tally-item-${id}`}`.
  - Empty-contributors + empty-missing cannot happen for a rendered table
    (entryCount > 0), so no empty state is needed in the panel.
- Don't reorder or restyle anything else on the screen.

### 1.4 Tests — `src/app/(tabs)/__tests__/goals.test.tsx`

Add `jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))`
with a hoisted `mockPush` (same pattern as `entry/__tests__/[id].test.tsx`).
New cases:
- Header renders `"Today"` and a long date matching `/^[A-Z][a-z]+ \d{1,2}, \d{4}$/`
  (don't pin the real date); and `"Today · "` no longer appears.
- Tapping `tally-row-fatG` with entries `{name:'Burger', fatG: 30, loggedAt: t1}`,
  `{name:'Salad', fatG: 5, loggedAt: t0}`, `{name:'Tea', fatG: null}` shows
  `Burger` before `Salad` (use `getAllByTestId(/tally-item-/)` order or
  rendered-text order), shows `"30g"` and `"5g"`, and shows `Tea` with
  `"no data"`.
- Tapping the open row again hides the panel; tapping a different row
  swaps which one is open.
- Pressing `tally-item-<id>` calls `mockPush('/entry/<id>')`.
- Existing tests must pass unchanged (they assert bare totals like `'450'`).

## 2. Definition of done

- `npm run typecheck` && `npm run lint` && `npm test` — green, run them.
- No `// @ts-ignore`, no lint disables, no new dependency.
- Suggested commits:
  1. `feat(goals): add nutrientContributions + formatLongDate pure helpers`
  2. `feat(goals): rename tally header to Today with a long date`
  3. `feat(goals): expand a tally row to list the entries behind its total`
- End with an execute summary: per-commit contents, file list, rung results
  (suite/test counts), deviations, punts.

## 3. Not this session (for the test-plan session)

- Maestro: extend `flows/goals-tally.yaml` — after the tally renders, tap
  `tally-row-calories`, assert `"Tally Test Meal"` and `"500"` appear in the
  panel (note `"500"` now also exists in the row total — prefer the
  `tally-item-*` id or the `"Open Tally Test Meal"` label), then tap
  `tally-row-fatG` and assert `"no data"`. Assert `"Today"` and a
  `".*, 2026"`-style date once. `flows/nav-tabs.yaml:27`'s comment ("Goals
  subtitle renders unconditionally (goals.tsx header)") is now satisfied by
  `GoalsSection`'s subtitle instead — update the comment, not the assertion.
- ACCEPTANCE.md rows for the three pieces.
