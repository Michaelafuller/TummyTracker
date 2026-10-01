# HANDOFF.md — Execute session: Daily confounders (sleep, stress, alcohol, caffeine, period), GitHub #23

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§0: synchronous
> transactions, the #13 check-in rules, #20's medication analysis — this cycle
> mirrors it). **You are on the experiments branch
> (`worktree-agent-a93006f35a36fc943`) in its worktree** — #19–#22 are
> reviewed but unmerged; this cycle stacks on them. Never touch the main
> checkout.
>
> **JS/TS + one additive migration (owner-approved 2026-09-30)** — no
> dependency, no permission, no native change, no EAS build.

**Planned 2026-09-30 (Opus plan session, owner-reviewed) — GitHub
Michaelafuller/TummyTracker#23.** Done-when (issue): "at least sleep and
stress can be logged daily and the engine can account for them." Owner
decisions (2026-09-30):

1. **Factors:** sleep (poor / OK / good), stress (1–5), alcohol (none / some
   / a lot), caffeine (none / usual / more than usual), period (yes / no —
   **opt-in**, hidden until enabled in Settings).
2. **New table `day_factor`** (one row per local day, every factor
   nullable) — `day_check_in` requires a fine/rough answer and can't be
   relaxed additively. Backups → **v6**. Logging a factor counts the day as
   **covered**.
3. **Engine like #20's medications:** factor findings in Insights + a caveat
   on food/ingredient/combination cards. Food numbers unchanged.
4. **Entry in the Home check-in card:** an optional "Add details" row under
   Fine/Rough that expands to one-tap chips for today.

Plan-session judgments (flag them; owner may override):
- **Flagged days:** stress **4–5**; sleep **poor**; alcohol **some or a
  lot** (flags that day **and the next**, like a medication dose); caffeine
  **more than usual**; period **yes**.
- **Comparison base = days the factor was logged and *not* flagged** — never
  "all other days". An unlogged day is unknown, not low-stress (missing data
  is never a confirmed negative).
- **Rough day = an `isOutcome` entry only** (the #13 rule, same as #20).

---

## 0. Invariants — read twice

- **No existing number changes for existing data.** Food findings, latency,
  slower patterns, dose lines, medication findings/caveats, experiments: as
  before. The only intended ripple: a day with a `day_factor` row (and
  nothing else) now counts as **covered** — in the Insights coverage line
  (#13) and #20's medication day pools. Existing journals have no factor
  rows, so nothing moves until the user logs one.
- **Nothing is inferred.** A factor is known only on a day it was logged.
  Clearing a chip sets it back to null (unknown), never to a "low" value.
- **Period data stays out of sight when tracking is off:** no chips, no
  findings, no caveats, no notes. Stored rows are kept (turning it back on
  restores them); backups include them as they are.
- **Wording never claims causation.**
- Synchronous repository transactions; stage by path; LF.

## 1. Schema + migration

```ts
export const SLEEP_LEVELS = ['poor', 'ok', 'good'] as const;
export const ALCOHOL_LEVELS = ['none', 'some', 'a_lot'] as const;
export const CAFFEINE_LEVELS = ['none', 'usual', 'more'] as const;

export const dayFactor = sqliteTable('day_factor', {
  id: text('id').primaryKey(),
  date: text('date').notNull().unique(),          // 'YYYY-MM-DD' local day
  sleep: text('sleep', { enum: SLEEP_LEVELS }),
  stress: integer('stress'),                       // 1–5
  alcohol: text('alcohol', { enum: ALCOHOL_LEVELS }),
  caffeine: text('caffeine', { enum: CAFFEINE_LEVELS }),
  period: integer('period', { mode: 'boolean' }),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
```

`npm run db:generate` → `0012_*`; SQL must be only the new table + its
unique index (stop and report otherwise). Doc-comment the invariants. Prefs:
`trackPeriod: boolean` (default false) in `src/lib/prefs.ts` + the store
(setter like `setDayCheckIn`).

## 2. Repository + backup v6

- `setDayFactors(date, patch: Partial<{ sleep; stress; alcohol; caffeine; period }>)`
  — validate the date key and each value (stress integer 1–5; enums), then
  insert-or-update **only the patched fields** (null clears one) in one
  synchronous statement (`onConflictDoUpdate` on `date`). Returns nothing.
- `getDayFactors(date)`, `listAllDayFactors()`; live hook `useDayFactors()`.
- `insertDayFactorsPreservingIds(rows)` — like `insertDayCheckInsPreservingIds`
  (device's row for a date wins; dedupe dates in the file; chunked).
- Backup v6: `dayFactors` array, validated (date key, each field in range or
  null); v1–v5 import unchanged; Settings export/import wired with a summary
  clause.
- Real-SQLite tests (`repository.dayFactors.test.ts`): patching one field
  leaves the others; null clears; one row per date; invalid values throw and
  write nothing; restore precedence.

## 3. Pure analysis — `src/features/analysis/factors.ts`

```ts
export type FactorKey = 'stress' | 'sleep' | 'alcohol' | 'caffeine' | 'period';
export interface FactorDays { flagged: Set<string>; logged: Set<string> }  // logged ⊇ flagged
export function factorDays(rows: readonly DayFactor[], opts: { trackPeriod: boolean }): Map<FactorKey, FactorDays>
// alcohol 'some'/'a_lot' flags its day and the next; the next day joins `logged` too
// (it's known to be inside the alcohol window). Period omitted entirely when !trackPeriod.

export type FactorFinding = { key: FactorKey; label: string;          // "High-stress days"
  flaggedDays: number; flaggedRough: number; flaggedRate: number;
  baseDays: number; baseRough: number; baseRate: number;               // logged, not flagged, covered
  confidence: ConfidenceTier };
export type FactorNote = { key: FactorKey; label: string; reason: 'too-few-days' | 'nearly-always' };
export function analyzeFactorDays(entries, checkIns, factorRows, opts): { findings: FactorFinding[]; notes: FactorNote[] }
export function factorCaveat(instances, factorDaysMap): { key; label; overlapping; hits } | null
```

Rules: reuse #20's constants and shape (`MIN_EXPOSED_DAYS` for flagged
days, the same minimum for base days, the nearly-always share, confidence
tiers vs `baseRate`, low-only policy + cap, sort by excess). Only covered
days count (a factor row makes its day covered — §0). Caveat: same ≥ 2 and
≥ half rule as medications, on the meal's day.

Extend the coverage helpers to accept factor rows: `dayCoverage`
(`src/lib/dayCoverage.ts`, optional param) and #20's `coveredAndRoughDays`
(optional param). Existing call sites pass them from the screens; tests for
the old signatures stay green.

## 4. Screens

- **Home check-in card** (`DayCheckInCard`): under Fine/Rough, a link
  "Add details" (`accessibilityLabel="Add details for today"`) toggling an
  inline block of chip rows for **today**: Sleep (Poor / OK / Good), Stress
  (1–5), Alcohol (None / Some / A lot), Caffeine (None / Usual / More), and
  Period (Yes / No) only when `trackPeriod`. Tapping a selected chip clears
  it. Each tap saves immediately (`setDayFactors(today, { field })`). When
  any detail is set, the collapsed row summarizes it ("Stress 4 · Poor
  sleep"). Labels: "Sleep: Poor" etc. — don't collide with existing Home
  labels.
- **Settings:** in the Day check-in section, a "Track period" switch
  (`accessibilityLabel="Track period"`) with one line: "Adds a period
  option to the day details. Off by default; your data never leaves this
  device."
- **Insights:** a section "Daily factors linked to rough days" after the
  medications section, mirroring it: cards "Rough on 6 of 10 high-stress days
  (60%) vs 3 of 15 other days you logged stress (20%)." with the confidence
  chip ("N days"); notes ("Poor sleep — only 2 logged days so far."); footer
  "Days count only when you logged that factor. Linked doesn't mean caused."
  On food/ingredient/combination cards, the factor caveat line (after any
  medication caveat): "5 of the 7 meals followed by a rough outcome were on
  high-stress days."
- Insights coverage line counts factor-only days as covered.

## 5. Tests (same change)

- Schema/migration harness test; repository (§2); backup v6 round trip + v5.
- `factors`: flag rules per factor, alcohol next-day window, base = logged-
  not-flagged (an unlogged day is in neither set), period omitted when off,
  every rule/tier/note, caveat thresholds; coverage helpers with and without
  factor rows (old results identical without them).
- Home card: expand, set, clear, summary, period chips only when enabled.
- Settings switch; Insights section, notes, caveat line, unchanged numbers
  without factor rows.

## 6. Definition of done

- `npm run typecheck`, `npm run lint` (0 warnings), `npm run bundle:check`.
- **Targeted Jest only (never the full suite):** files you created/touched +
  `src/features/analysis/__tests__/*`, `dayCoverage`, `backup`, `prefs`,
  `prefsStore`, `settings`, Home `index`, Insights, all `src/db/__tests__/*`,
  `src/features/checkin/__tests__/*`. `(tabs)`/settings paths via
  `npx jest --runTestsByPath "<path>"`.
- No `@ts-ignore`, no lint disables, no `any` without `// reason:`, no deps,
  no schema change beyond §1. Don't run Maestro/EAS/expo start/adb; don't
  edit `flows/`, `CLAUDE.md`, `docs/`; don't push or merge.
- Commits (stage by path), committing each as soon as its tests pass:
  `feat(db): day_factor table + additive migration 0012` ·
  `feat(factors): repository, live hook, backup v6, track-period pref` ·
  `feat(analysis): daily-factor findings, caveats and coverage` ·
  `feat(factors): day details on the Home check-in card, Settings switch, Insights section` —
  each ending `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Execute summary: files per commit, hashes, the generated SQL verbatim, rung
  results, targeted Jest counts, a worked example (fixture → factor finding +
  caveat) pasted from a test, every existing test touched and why,
  deviations, review pointers.
