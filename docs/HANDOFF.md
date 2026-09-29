# HANDOFF.md — Execute session: Reaction latency + a second window, GitHub #21

> **Read first:** this file only. `CLAUDE.md` is auto-loaded. **You are on the
> experiments branch (`worktree-agent-a93006f35a36fc943`) in its worktree** —
> #19/#20 are reviewed but unmerged; this cycle stacks on them. Commit here;
> never touch the main checkout.
>
> **Pure JS/TS** — no dependency, no schema change, no permission, no native
> change, no EAS build.

**Planned 2026-09-28 (Opus plan session, owner-reviewed) — GitHub
Michaelafuller/TummyTracker#21.** Done-when (issue): "findings show typical
latency and the engine compares more than one window." Owner decisions:

1. **Main findings stay at 24 h.** Add a **"Slower patterns (within 48 h)"**
   section: ingredient/food/combination findings that reach **medium or high**
   confidence at 48 h **and do not appear at 24 h** (any tier). Never low.
2. Each finding's **detail screen** gets a **timing profile** at 6 / 24 / 48 /
   72 h — context only, never creates findings.
3. **Latency** ("Usually about 5 h later (3–8 h)") on Insights cards, the
   detail screen (plus per-meal "rough outcome 5 h later"), **and the PDF**.
4. **Everything else stays at 24 h**: "What came before", medication caveats
   and findings, experiments, the watchlist, and the PDF's findings list (the
   PDF gains only the latency text, not slower patterns).

Why the guard rails (keep them in code comments): with daily meals and
scattered rough days, long windows push the baseline toward 100 %, and trying
several windows per food finds spurious "triggers" by chance. So: one extra
window, medium/high only, and profiles that never create findings.

---

## 0. Invariants — read twice

- **Every existing 24 h number is unchanged.** Default parameters keep
  `DEFAULT_WINDOW_MS`; existing tests pass untouched (only additive fields may
  force a `toEqual` update — say which and why).
- A slower pattern **never duplicates** a 24 h finding (same key, any tier).
- Latency is **descriptive**: median and 25th–75th percentile of hours from
  each hit meal to its **first** rough outcome strictly after it, within that
  finding's window; shown only with ≥ 3 hits.
- Wording: "within 48 h", "usually about N h later"; never "causes".
- LF line endings; stage by path.

## 1. Engine (pure)

- `src/features/analysis/temporal.ts`:
  - `mealsFollowedByOutcome` is unchanged. Add
    `firstOutcomeDelayMs(entries, meal, windowMs = DEFAULT_WINDOW_MS): number | null`
    (strictly after, ≤ window — same join rule).
  - Export `SLOW_WINDOW_MS = 48 h`, `PROFILE_WINDOWS_H = [6, 24, 48, 72]`.
  - `outcomeRateForKey(entries, keysOf, key, windowMs)` →
    `{ occurrences, hits, hitRate, baseRate } | null` — the same eligible-meal
    set and baseline as `analyzeOutcomeRates`, but for one key with **no**
    gating (for the profile).
- `src/features/analysis/insights.ts`: `analyzeIngredientOutcomes`,
  `analyzeFoodOutcomes`, `analyzePairOutcomes` gain an optional
  `windowMs = DEFAULT_WINDOW_MS` (pairs: pass it through to `tagHitRates` too).
  Add `analyzeSlowerPatterns(entries, twentyFourHour: Insights)` →
  `{ ingredientFindings, foodFindings, pairFindings }` per §0 rule 1.
  `computeInsights` itself is unchanged.
- New `src/features/analysis/latency.ts`:
  ```ts
  export interface LatencySummary { medianH: number; lowH: number; highH: number; n: number }
  export function latencySummary(delaysMs: readonly number[]): LatencySummary | null   // n ≥ 3, hours rounded to whole
  export function latencyLine(s: LatencySummary): string
  // "Usually about 5 h later (3–8 h)"; median < 1 h → "Usually within an hour"; low === high → "Usually about 5 h later"
  ```
  Percentiles: nearest-rank on the sorted delays (document it).
- `src/features/analysis/drilldown.ts`: `DrilldownInstance` gains
  `outcomeDelayMs: number | null` (null when not followed); `findingInstances`
  and `flagFollowedByOutcome` take an optional `windowMs` (default 24 h).
  `pairInstances` (medications.ts) passes it through.

## 2. Insights screen

- Each ingredient / combination / food card: a `textSecondary` latency line
  under the sentence when its instances give a `latencySummary`.
- **"Slower patterns (within 48 h)"** section after "Foods linked to rough
  outcomes" (before Medications), when non-empty. One intro line: "These only
  show up when counting outcomes up to 48 hours after eating — slower
  reactions." Cards like the others, sentence says "within 48 h", latency
  from the 48 h instances. Tapping opens the detail screen with `window=48`.
- Medication cards: no latency (day-level).

## 3. Detail screen — `src/app/insight/detail.tsx`

- Accept `window` param (`'24' | '48'`, default 24); pass it to
  `findingInstances`; summary line says "within 48 h" accordingly.
- Latency summary line under the summary.
- Each meal row: "rough outcome 5 h later" / "rough outcome within the hour"
  when followed.
- **Timing profile** block: "How the pattern changes with time" + 4 rows
  "Within 6 h: 1 of 5 meals (20%) · baseline 10%" … "Within 72 h: …" from
  `outcomeRateForKey`, with a `textSecondary` note: "Longer windows catch
  slower reactions but also more unrelated rough days."
  Needs the finding's kind/key → keysOf: food = lowercased trimmed name; tag
  = the tag. (Combination findings don't open a detail screen today — leave
  that as is.)

## 4. PDF — `src/lib/report.ts`

`outcomeSentence` gains the latency line when available: "… (Medium
confidence, n=6). Usually about 5 h later (3–8 h)." Nutrient findings: no
latency. No slower-patterns section.

## 5. Tests (same change)

- `latency`: n < 3 → null; median/percentiles (odd/even n, nearest-rank);
  rounding; each copy variant.
- `temporal`: `firstOutcomeDelayMs` (strictly after, boundary included,
  first of several, none); `outcomeRateForKey` equals the corresponding
  `analyzeOutcomeRates` finding's numbers when that finding exists.
- `insights` (analysis): default-window results identical to before (assert
  against the existing fixtures); a slow-only trigger (outcome ~30 h after
  each meal) → absent at 24 h, present in slower patterns at medium/high; a
  24 h finding never duplicated; low-at-48h excluded; baseline-saturation
  fixture (rough every day) → no slower patterns.
- `drilldown`: `outcomeDelayMs` values; 48 h window param.
- Screens: card latency line present/absent; slower section; detail screen
  with `window=48`, per-meal delays, profile rows; PDF latency text.

## 6. Definition of done

- `npm run typecheck`, `npm run lint` (0 warnings), `npm run bundle:check`.
- **Targeted Jest only (never the full suite):** files you created/touched +
  `src/features/analysis/__tests__/*`, `report`, `watchlist`,
  `experiments/__tests__/*`, the Insights screen and `insight/detail` tests
  (`--runTestsByPath` for `(tabs)`).
- No `@ts-ignore`, no lint disables, no `any` without `// reason:`, no deps,
  no schema change. Don't run Maestro/EAS/expo start/adb; don't edit
  `flows/`, `CLAUDE.md`, `docs/`; don't push or merge.
- Commits (stage by path): `feat(analysis): outcome delays, latency summaries and window params` ·
  `feat(analysis): slower patterns at 48 h and per-key timing profile` ·
  `feat(insights): latency lines, slower patterns section, detail timing profile` ·
  `feat(report): latency in PDF finding sentences` — each ending
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Execute summary: files per commit, hashes, rung results, targeted Jest
  counts, a worked slow-trigger example (fixture → absent at 24 h → slower
  pattern + latency line) pasted from a test, any existing test you had to
  touch and why, deviations, review pointers.
