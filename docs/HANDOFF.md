# HANDOFF.md — Execute session: "By chance" indicator on findings, GitHub #24

> **Read first:** this file only. `CLAUDE.md` is auto-loaded. **You are on
> the burn-down branch (`worktree-agent-a93006f35a36fc943`) in its
> worktree** — #19–#23 are reviewed but unmerged; this cycle stacks on them.
> Never touch the main checkout.
>
> **Pure JS/TS** — no dependency, no schema change, no permission, no native
> change, no EAS build.

**Planned 2026-09-30 (Opus plan session, owner-reviewed) — GitHub
Michaelafuller/TummyTracker#24.** Done-when (issue): "findings show a chance
comparison alongside the existing confidence tiers." Owner decisions
(2026-09-30):

1. **Method = "slide my journal".** Re-run the same analysis with the rough
   outcomes slid against everything else by whole days, many times, and
   average how many findings appear. This keeps the user's eating habits and
   their rough-day streaks (which a textbook binomial formula ignores — it
   would *understate* chance) but breaks any real food → outcome link.
   Deterministic: same data → same number, every render.
2. **Placement = one line on each finding card**, matched to that card's
   confidence tier.
3. **Scope = every finding section:** ingredients, foods, combinations,
   slower patterns (all three kinds), medications, daily factors, nutrients.
4. **Never hide, re-tier or reorder.** Add the line, plus "could easily be
   chance" wording when luck explains as many findings as were found.

Plan-session judgments (flag them in your summary; owner may override):
- **"This strong" = this card's tier or better** (a Medium card compares
  against chance findings at Medium or High).
- **Slide distances:** whole days, at least `MIN_SLIDE_DAYS = 3` away from
  zero in both directions (clears the 48 h window); at most `MAX_SLIDES = 30`
  evenly spaced; fewer than `MIN_SLIDES = 10` possible → no estimate (the
  card says the check needs more history). So a journal needs ≥ 15 days.
- **"Could easily be chance" when `round(expected) >= found`** — i.e. when the
  number the user *reads* is at least the number of findings at that tier or
  better. "fewer than 1" (expected < 0.5) is never flagged.
- **Insights screen only.** The PDF report and the finding detail screen are
  unchanged this cycle.

---

## 0. Invariants — read twice

- **No existing number, tier, order or visibility changes.** Every existing
  exported analysis function returns exactly what it returns today; every
  existing test passes **unmodified** (if one needs changing, stop and
  report). The chance check is additive, display-only.
- **Deterministic.** No `Math.random`, no `Date.now()` inside the analysis.
  Test fixtures that need noise use a seeded PRNG written in the test.
- **Wording never claims causation or safety.** "Luck alone" and "could
  easily be chance" — never "this is a coincidence" or "this is real".
- Pure logic in `src/features/analysis/`; no React there.
- Stage by path; LF; no `@ts-ignore` / lint disables / bare `any`.

## 1. Faster meal → outcome join (behavior-identical) — `temporal.ts`

The chance check re-runs the engine ~30× per family, so the hot join must be
cheap. Rewrite `mealsFollowedByOutcome` (today `O(meals × outcomes)` via
`outcomes.some`) to sort outcome `loggedAt` values once and binary-search,
per meal, the first outcome strictly after `meal.loggedAt`; a hit when it
exists and is `<= meal.loggedAt + windowMs`. **Same semantics exactly**
(strictly after, boundary inclusive, an outcome at the same ms as the meal
doesn't count). Leave its signature and doc comment's rule alone.

Test: an equivalence test against a naive reference implementation (written
in the test) over seeded random journals, plus explicit boundary cases
(outcome at exactly `+windowMs`, at `+windowMs + 1`, at the same ms, several
outcomes, none).

Commit: `perf(analysis): binary-search the meal-to-outcome join`.

## 2. Candidate lists for every finding family (refactor, no behavior change)

The chance check must count findings the same way on the real journal and on
every slide, **without** the display rules (low-only fallback, caps,
sorting). Add, for each family, an exported function returning
`{ checked: number; candidates: <Finding>[] }` where `checked` = how many
keys/meds/factors/nutrients were actually compared (passed the minimum-count
gates) and `candidates` = **every** excess-risk result with its tier (low
included), unsorted and uncapped:

| Family | New function (suggested name) | `checked` = | Notes |
|---|---|---|---|
| ingredients / foods (any window) | `outcomeRateCandidates(entries, keysOf, options)` in `temporal.ts` | keys with `>= minOccurrences` meals | `analyzeOutcomeRates` becomes "candidates → sort → fallback". |
| combinations | `pairCandidates(entries, windowMs)` in `insights.ts` | pairs (top-tag) with `>= MIN_PAIR_OCCURRENCES` | Candidates that pass the `PAIR_RATE_MARGIN` interaction filter, uncapped. Leave `analyzePairOutcomes`'s own pipeline exactly as is (it filters the fallback-applied list — don't "fix" that); share the key builder. |
| nutrients | `nutrientCandidates(entries)` in `insights.ts` | nutrients passing the sample + group-size gates | Includes the `low` tier that `analyzeNutrientOutcomes` suppresses. |
| medications | core `compareMedicationDays(covered, rough, meds, exposure)` in `medications.ts` | meds that were compared (not turned into notes) | `analyzeMedicationDays` calls the core; notes unchanged. |
| daily factors | core `compareFactorDays(covered, rough, days)` in `factors.ts` | factors that were compared | `analyzeFactorDays` calls the core; notes unchanged. |

For meds/factors the core takes the `covered` / `rough` day sets as
arguments so the chance check can pass a slid `rough` set (§3).

Tests: for each family, on existing fixtures, the public function's output
equals "candidates → the display rules" (and the existing tests for the
public functions still pass unmodified). `checked` counts on a fixture with
keys below the gate.

Commit: `refactor(analysis): candidate lists for every finding family`.

## 3. The chance check — new `src/features/analysis/chance.ts`

```ts
export const MIN_SLIDE_DAYS = 3;
export const MIN_SLIDES = 10;
export const MAX_SLIDES = 30;

/** Slide distances (days) for a journal spanning `spanDays` days: every d in
 * [MIN_SLIDE_DAYS, spanDays - MIN_SLIDE_DAYS]; when more than MAX_SLIDES,
 * MAX_SLIDES of them evenly spaced (deterministic, ascending, unique); [] when
 * fewer than MIN_SLIDES. */
export function slideOffsets(spanDays: number): number[];

/** Meal-level slide: a copy of `entries` where every `isOutcome` entry's
 * loggedAt moves `days` × 24 h later, wrapped circularly inside the journal
 * span [start, start + spanDays × 24 h) where start = local midnight of the
 * earliest entry. Non-outcome entries are the SAME objects (untouched). */
export function slideOutcomes(entries: readonly LogEntry[], days: number): LogEntry[];

/** The span used above: whole local days from the earliest to the latest entry, inclusive. */
export function journalSpanDays(entries: readonly LogEntry[]): number;

/** Day-level slide: covered days sorted ascending; each covered day's rough
 * flag moves `positions` places later, wrapping. Same number of rough days. */
export function rotateRoughDays(covered: ReadonlySet<string>, rough: ReadonlySet<string>, positions: number): Set<string>;

export interface ChanceCheck {
  /** Things compared on the real journal (e.g. 42 ingredients). */
  checked: number;
  /** Real-journal candidates at each tier OR BETTER. */
  found: Record<ConfidenceTier, number>;
  /** Mean over slides of candidates at each tier OR BETTER. */
  expected: Record<ConfidenceTier, number>;
  slides: number;
}

export type ChanceFamily =
  | 'ingredients' | 'foods' | 'pairs'
  | 'slowerIngredients' | 'slowerFoods' | 'slowerPairs'
  | 'medications' | 'factors' | 'nutrients';

/** One ChanceCheck per family that is asked for; null for a family when the
 * journal is too short (no slides). */
export function chanceChecks(input: {
  entries: readonly LogEntry[];
  checkIns: readonly { date: string }[];
  meds: readonly Medication[];
  events: readonly MedicationEvent[];
  doses: readonly MedicationDose[];
  factorRows: readonly FactorRow[]; // already visibleFactorRows-filtered
  trackPeriod: boolean;
  families: ReadonlySet<ChanceFamily>; // only compute what is on screen
}): Partial<Record<ChanceFamily, ChanceCheck | null>>;
```

Rules per family (each slide counts with the **same** function used for the
real journal):

- **Meal-level families** (ingredients, foods, pairs, nutrients and the three
  slower ones): slide distances from `slideOffsets(journalSpanDays(entries))`;
  each slide analyses `slideOutcomes(entries, d)`.
  - ingredients / foods / pairs / nutrients: candidates at 24 h.
  - slower kinds: 48 h candidates at **medium or better** whose key is NOT in
    that same journal's (real or slid) **shown** 24 h findings of that kind
    (any tier — i.e. the public `analyze*Outcomes` output), mirroring
    `analyzeSlowerPatterns`. `found.low`/`expected.low` for a slower family
    equal the medium values (slower cards are never low).
- **Day-level families** (medications, factors): covered/rough from
  `coveredAndRoughDays(entries, checkIns, factorRows)` once; distances from
  `slideOffsets(covered.size)`; each slide uses
  `rotateRoughDays(covered, rough, d)` with the real `covered` and the real
  exposure / factor days.
- `found[t]` / `expected[t]` count candidates whose tier is `t` or better
  (`low` counts all candidates).

Copy helper (pure, in `chance.ts`):

```ts
export function chanceSentence(
  check: ChanceCheck | null,
  tier: ConfidenceTier,
  noun: { one: string; many: string }, // e.g. ingredient / ingredients
): string;
```

- `null` → `"Chance check: needs a couple of weeks of logs first."`
- `E = check.expected[tier]`; `shown = E < 0.5 ? 'fewer than 1' : \`about ${Math.round(E)}\``.
- `"Chance check: of ${checked} ${checked === 1 ? one : many} checked, luck alone would make ${shown} look this strong."`
- When `E >= 0.5 && Math.round(E) >= check.found[tier]`, append
  `" That's as many as you have, so this could easily be chance."`

Nouns: ingredient(s), food(s), combination(s), medication(s), daily
factor(s), nutrient(s). Slower cards use their kind's noun.

**Performance gate.** Add `src/features/analysis/__tests__/chance.perf.test.ts`:
a seeded synthetic 365-day journal (3 meals/day, 3–5 tags each from a pool of
40, outcomes on ~30 % of days, 3 meds with doses on some days, daily factor
rows) → `chanceChecks` with **all** families. Log the elapsed ms; assert
`< 3000` (generous, CI-safe). **If the measured time is over 300 ms on this
machine**, profile and optimise behavior-identically (e.g. parse each
entry's tags once per analysis call instead of per `keysOf` call — allowed;
a module-level global cache is not). If still over 300 ms, stop and report
the numbers before wiring the screen.

Tests (`chance.test.ts`):
- `slideOffsets`: short span → `[]`; exactly `MIN_SLIDES` → all; long span
  → 30 ascending unique, first `>= 3`, last `<= span - 3`.
- `slideOutcomes`: only outcomes move; count preserved; wrap past the end
  lands near the start; time of day preserved; non-outcomes are the same
  objects; input not mutated.
- `rotateRoughDays`: count preserved, wrap, `positions` = 0 → same set.
- **Planted signal:** one tag always followed within hours by an outcome on
  a ~40-day journal, other tags noise → its family has `found.high >= 1` and
  `expected.high < found.high`; the sentence for that card has no
  "could easily be chance".
- **Pure noise:** seeded random tags + outcomes unrelated to them → for the
  tier the noise reached, `chanceSentence` contains "could easily be chance".
- Day-level: a medication whose exposure days coincide with rough days →
  found high, low expected; and a too-short journal → `null`.
- Determinism: two calls on the same input are deep-equal.
- `chanceSentence`: null copy, singular noun, "fewer than 1", rounding,
  flag on/off at the boundary (`E = 0.5`, `found = 1` → flagged;
  `E = 0.49` → not).

Commit: `feat(analysis): chance check by sliding outcomes against the journal`.

## 4. Insights screen — `src/app/(tabs)/insights.tsx`

- One `useMemo` computing `chanceChecks` (deps: entries, checkIns, meds,
  medEvents, medDoses, visibleFactors, trackPeriod), passing in `families`
  only the sections that actually have findings on screen. Do **not** move
  the existing `computeInsights` / slower calls (out of scope).
- `Card` gets an optional `chance?: string | null` prop rendered as a
  `small` / `textSecondary` line **directly under the confidence chip**
  (before `children`), with `testID="chance-line"`.
- Every finding card in every section passes
  `chance={chanceSentence(checks.<family> ?? null, finding.confidence, NOUN)}`.
  A family missing from the map (not requested) can't happen for a rendered
  card — but fall back to no line rather than crash.
- Nothing else on the screen changes.

Tests (`src/app/(tabs)/__tests__/insights.test.tsx`, run via
`npx jest --runTestsByPath`): a journal long enough for slides shows a
"Chance check: of N … checked" line on an ingredient card and on a medication
or factor card; a short journal shows the "needs a couple of weeks" line;
existing assertions untouched.

Commit: `feat(insights): chance-check line on every finding card`.

## 5. Definition of done

- `npm run typecheck`, `npm run lint` (0 warnings), `npm run bundle:check`.
- **Targeted Jest only (never the full suite):** all of
  `src/features/analysis/__tests__/*`, `src/lib/__tests__/report*`,
  Insights (`npx jest --runTestsByPath "src/app/(tabs)/__tests__/insights.test.tsx"`),
  `src/app/insight/__tests__/*` if it exists, plus any file you touched.
- No deps, no schema, no `@ts-ignore` / lint disables / bare `any`. Don't run
  Maestro / EAS / `expo start` / `adb`; don't edit `flows/`, `CLAUDE.md`,
  `docs/`; don't push or merge.
- Commits as listed (stage by path), each as soon as its tests pass, each
  ending `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- **Execute summary:** files per commit + hashes; rung results; targeted Jest
  counts; the perf test's measured ms (before and after any optimisation);
  a worked example pasted from a test (planted-signal journal → its
  `ChanceCheck` → the card sentence; pure-noise journal → its sentence);
  confirmation that no existing test was modified (or which and why — that
  should have been a stop); deviations; review pointers (where the real and
  slid counts could diverge in definition).
