# HANDOFF.md — Execute session: Dose-response on findings, GitHub #22

> **Read first:** this file only. `CLAUDE.md` is auto-loaded. **You are on the
> experiments branch (`worktree-agent-a93006f35a36fc943`) in its worktree** —
> #19–#21 are reviewed but unmerged; this cycle stacks on them. Commit here;
> never touch the main checkout.
>
> **Pure JS/TS** — no dependency, no schema change, no permission, no native
> change, no EAS build.

**Planned 2026-09-30 (Opus plan session, owner-reviewed) — GitHub
Michaelafuller/TummyTracker#22.** Done-when (issue): "findings can show
whether larger amounts raise the outcome rate."

**Spike result (plan session):** ingredient, food and combination findings
are **amount-blind** — the engine reads only `logEntry.name` and the entry's
union `tagsJson`; servings live on `mealComponent` rows, which the engine
never reads. Nutrient findings already scale with amount (entry nutrition is
Σ value × servings). So the gap is per-food / per-ingredient amount.

Owner decisions (2026-09-30):

1. **Amount = servings** (the stepper multiplier). Missing → 1.
2. **Foods and ingredients** get a comparison (not combinations, not
   nutrients). Ingredient wording says "servings of foods with it", since
   servings of different foods aren't the same dose.
3. **Cards show a line only for a clear increase**; the detail screen shows
   the split numbers whenever there's enough data (no verdict text there).
4. **Insights cards + finding detail only** (not the PDF).

---

## 0. Invariants — read twice

- **No existing number changes.** Findings, confidence, ordering, latency,
  slower patterns, caveats — all as before. Dose-response is a new pure
  module the screens compose.
- **Never infer an amount.** A meal's amount comes from its stored component
  `servings` (missing/null → 1); a flat entry with no component rows counts
  as 1. Never from grams, calories or the meal name.
- **Same instances as the card.** The split is over exactly the meals behind
  the finding (`findingInstances` with the finding's window — 24 h or 48 h for
  slower patterns), using their existing `followedByOutcome` flags.
- **Wording never claims causation or safety.** No "a little is fine" — show
  the numbers.
- LF line endings; stage by path.

## 1. Data — live meal components

`useAllMealComponents()` live hook (Drizzle `useLiveQuery` over
`mealComponent`) next to `useAllEntries` in
`src/features/logging/useEntries.ts`. Screens group components by `entryId`
once (memoized).

## 2. Pure module — `src/features/analysis/doseResponse.ts`

```ts
/** Food finding: total servings of the meal's components (no components → 1).
 *  Ingredient finding: Σ servings of the components whose own tags include `tag`
 *  (exact tag, as tag findings match); if the entry has no components but its
 *  tags include it → 1; if components exist but none carries the tag
 *  (legacy/edited rows) → 1. */
export function mealAmount(entry: LogEntry, components: readonly MealComponent[],
  kind: 'food' | 'tag', value: string): number

export interface DoseSplit {
  threshold: number;                       // the median amount; smaller = ≤ threshold, larger = > threshold
  smaller: { meals: number; hits: number; rate: number };
  larger:  { meals: number; hits: number; rate: number };
  clearIncrease: boolean;                  // larger.rate − smaller.rate ≥ DOSE_RATE_MARGIN
}
/** null when every meal has the same amount, or either side has < MIN_DOSE_GROUP meals. */
export function doseSplit(instances: readonly { entry: LogEntry; followedByOutcome: boolean }[],
  amountOf: (entry: LogEntry) => number): DoseSplit | null

export const DOSE_RATE_MARGIN = 0.2;
export const MIN_DOSE_GROUP = 4;   // reuse MIN_GROUP_SIZE from insights.ts if it's the same value — import it, don't duplicate

/** Card line (only call when clearIncrease):
 *  food:       "More than 1 serving: 4 of 5 (80%) · 1 or less: 1 of 6 (17%)"
 *  ingredient: "More than 1 serving of foods with it: 4 of 5 (80%) · 1 or less: 1 of 6 (17%)"
 *  threshold formatted with formatDoseNumber (1.5 → "1.5 servings", 1 → "1 serving"). */
export function doseLine(split: DoseSplit, kind: 'food' | 'tag'): string
```

Median: of the amounts (even count → mean of the two middle values); if that
median equals the maximum amount, step the threshold down to the largest
amount below it so "larger" isn't empty — and if none exists → null.

## 3. Screens

- **Insights cards** (`src/app/(tabs)/insights.tsx`): for each ingredient and
  food card — in the 24 h sections **and** the slower-patterns section (with
  its 48 h instances) — a `textSecondary` line from `doseLine` when
  `doseSplit(...)?.clearIncrease`. Combination and medication cards: none.
- **Finding detail** (`src/app/insight/detail.tsx`): when `doseSplit` is
  non-null, a block "By amount" with two rows — "More than 1 serving: 4 of 5
  meals followed by a rough outcome (80%)" / "1 serving or less: 1 of 6
  (17%)" — no verdict sentence. Each meal row shows its amount ("1.5
  servings") alongside its existing outcome text.

## 4. Tests (same change)

- `doseResponse`: `mealAmount` for both kinds (components with/without the
  tag, no components, null servings → 1, fractional servings); `doseSplit`
  (all equal → null; small side < 4 → null; median rules incl. even count and
  median = max step-down; rates; `clearIncrease` at exactly the margin);
  `doseLine` wording for both kinds and singular/plural/decimal thresholds.
- Insights screen: a food card gains the dose line with a clear-increase
  fixture; absent when amounts are all 1; absent when not clear; a slower-
  pattern card uses its 48 h instances; existing numbers unchanged.
- Detail screen: "By amount" block present/absent; per-meal amounts.

## 5. Definition of done

- `npm run typecheck`, `npm run lint` (0 warnings), `npm run bundle:check`.
- **Targeted Jest only (never the full suite):** files you created/touched +
  `src/features/analysis/__tests__/*`, the Insights screen and
  `insight/detail` tests (`--runTestsByPath` for `(tabs)`), `useEntries` if it
  has a test, `report` (must be unchanged).
- No `@ts-ignore`, no lint disables, no `any` without `// reason:`, no deps,
  no schema change. Don't run Maestro/EAS/expo start/adb; don't edit
  `flows/`, `CLAUDE.md`, `docs/`; don't push or merge.
- Commits (stage by path): `feat(analysis): per-meal amounts and dose split for findings` ·
  `feat(insights): dose-response line on cards and By amount on finding detail` —
  each ending `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
  Commit each as soon as its tests pass.
- Execute summary: files per commit, hashes, rung results, targeted Jest
  counts, a worked example (fixture → split → card line) pasted from a test,
  deviations, review pointers.
