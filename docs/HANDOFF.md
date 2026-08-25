# HANDOFF.md — Execute session: BM insights / trends (Digestion section)

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§4 rungs, §8
> conventions, §9 guardrails). This cycle touches `src/features/bm/bristol.ts`,
> `src/features/analysis/temporal.ts` (one constant swap), new
> `src/lib/bmTrends.ts`, new `src/components/charts/CountBars.tsx` +
> `BristolHistogram.tsx`, `src/app/(tabs)/insights.tsx`, and tests. **No new
> dependency, no schema change, no network.** Zero-dep plain-View charts only
> (Decision 2: no charting libraries).

**Planned 2026-08-24 (Fable plan session), owner-requested and pinned:** BM
insights / trends — complete the trends story beyond sentiment. Scope is the
**BM half only** of the old "BM-regularity + intake charts" row; intake charts
stay in Tier 2 as a follow-on.

---

## 0. Context (verified — do not re-derive)

- Charts precedent: `TrendBars` (weekly sentiment bars, rolling 7-day buckets
  from `weeklySentiment` in `src/lib/chartData.ts`) and `MiniHistogram`
  (5-bar sentiment distribution). Mirror their structure, styling constants,
  empty-slot handling, and accessibility-summary pattern exactly.
- BM entries: `type === 'bowel_movement'`, `bristolScale` int 1–7 (nullable),
  validated by `isBristolValue` (`src/features/bm/bristol.ts`).
- "Bad" BM = Bristol 1, 2, 6, 7 (Decision 4) — currently a **private**
  `BAD_BRISTOL_TYPES` set in `src/features/analysis/temporal.ts:23`.
- Insights screen (`src/app/(tabs)/insights.tsx`): sections render inside one
  ScrollView; `entries = useAllEntries()`; `now` is lazy-init `useState(() =>
  Date.now())`. The "Trend" section renders `TrendBars` behind a
  `hasTrendData` gate.

## 1. Changes

### 1.1 `src/features/bm/bristol.ts` — shared bad-Bristol source of truth

Export `BAD_BRISTOL_VALUES = [1, 2, 6, 7] as const` and
`isBadBristol(n: unknown): boolean` (true iff `isBristolValue(n)` and in the
set). Update `src/features/analysis/temporal.ts` to import and use it —
delete the private `BAD_BRISTOL_TYPES` set (behavior identical; its existing
tests must stay green unchanged).

### 1.2 New `src/lib/bmTrends.ts` — pure helpers (no React, `now` passed in)

Follow `chartData.ts`'s header/style. All windows anchored on `startOfDay(now)`
like `weeklySentiment` (copy the local-midnight bucketing exactly so week
labels line up with the sentiment chart).

- `interface BmWeekBucket { label: string; count: number; badCount: number }`
- `weeklyBmCounts(entries, now, weeks = 8): BmWeekBucket[]` — rolling 7-day
  buckets, oldest-first, counting `type === 'bowel_movement'` entries by
  `loggedAt`; `badCount` counts those with `isBadBristol(bristolScale)`.
  Entries with null/invalid `bristolScale` count in `count` but never in
  `badCount`.
- `bristolDistribution(entries, now, weeks = 8): number[]` — length-7 counts
  for Bristol 1..7 over the same total window (`weeks × 7` days ending
  today); entries with null/invalid `bristolScale` are excluded.
- `bmRegularity(entries, now, days = 28): { total: number; perDay: number;
  hard: number; typical: number; loose: number } | null` — over the last
  `days` calendar days (inclusive of today): `total` BM entries, `perDay` =
  round1(total / days), `hard` = Bristol 1–2, `loose` = 6–7, `typical` = 3–5
  (unrated BMs are in `total` only). Return `null` when `total === 0`.

### 1.3 New `src/components/charts/CountBars.tsx`

Zero-dep weekly count bars, mirroring `TrendBars`' layout (CHART_HEIGHT 64,
track + labels rows, flex slots). Props: `buckets: readonly BmWeekBucket[]`.
Height ∝ `count / max(count)` across buckets (min bar height 4 when count >
0; empty track when 0 — zero BMs is real data, but render no fill). Each bar
stacks two segments bottom-up: bad portion (`badCount`, `theme.danger`) under
the remainder (`theme.primary`). Container `accessibilityLabel` summary like
TrendBars': "Weekly BM count: week of <label>, <n> BMs (<b> irregular); …" or
"no BMs logged yet" when all zero.

### 1.4 New `src/components/charts/BristolHistogram.tsx`

Mirror `MiniHistogram` (BAR_HEIGHT 32, share-of-max heights, hairline
baseline): 7 thin bars for Bristol 1..7, `counts: readonly number[]` (length
7). Color: bad values (1, 2, 6, 7) → `theme.danger`, typical (3–5) →
`theme.primary` — derive from `BAD_BRISTOL_VALUES`, don't hardcode indexes.
Value labels 1–7 under the bars (MiniHistogram's label row pattern).
Accessibility summary: "Bristol distribution: <n> at 1, …, out of <total>."

### 1.5 `src/app/(tabs)/insights.tsx` — "Digestion" section

After the "Trend" section (before `WatchlistSection`), gated on
`summary.bmEntries > 0` (the computed summary already counts BMs):

```
<ThemedText type="subtitle">Digestion</ThemedText>
<regularity line>       — "≈{perDay} BMs/day over the last 28 days —
                           {typical} typical · {hard} hard (1–2) ·
                           {loose} loose (6–7)." (ThemedText small,
                           textSecondary; render only when bmRegularity
                           returns non-null)
<CountBars buckets={weeklyBmCounts(entries, now)} />
<BristolHistogram counts={bristolDistribution(entries, now)} />
```

Keep the existing observation-framing disclaimer untouched; no new wording
beyond the section itself. Reuse the existing `styles.section` gap.

## 2. Tests (same change, CLAUDE.md §4)

- **New `src/lib/__tests__/bmTrends.test.ts`** (fixture style of
  `chartData.test.ts`): bucket boundaries (entry at today counts in the last
  bucket; 8 weeks tile back with no gaps), badCount classification (1,2,6,7
  bad; 3–5 not; null bristol in count but not badCount), distribution
  excludes null/invalid bristol, `bmRegularity` math incl. the `null`
  empty case and non-BM entries being ignored everywhere.
- **`src/features/bm/__tests__/bm.test.ts`** — add `BAD_BRISTOL_VALUES` /
  `isBadBristol` coverage (guards: 1 and 7 true, 3 false, null/'2' false).
- **New chart component tests** (async RNTL v14 — `await render`, destructure
  queries): `CountBars` renders one slot per bucket and the summary label;
  `BristolHistogram` renders 7 labels and its summary.
- **`src/app/(tabs)/__tests__/insights.test.tsx`** — extend: with a BM entry
  in the fixture, "Digestion" renders; with none, it doesn't.
- `src/features/analysis/__tests__/temporal.test.ts` must pass **unchanged**.

## 3. Definition of done

- `npm run typecheck` && `npm run lint` && `npm test` green — run them.
- No `// @ts-ignore`, no lint disables, no new dependency, no schema change.
- Commits (imperative, scoped), suggested split:
  `feat(analysis): shared bad-Bristol constant + BM trend helpers` ·
  `feat(insights): Digestion section — BM regularity, weekly counts, Bristol
  histogram` · `test(insights): BM trends coverage`.
- Execute summary: files, commits, rung counts, deviations with reasons.

## 4. After this (review pass + test session)

Fable reviews the diff for remediation, then authors + runs the Maestro
coverage on the Pixel: extend `flows/02-bm-tracking.yaml` (it already logs a
Bristol-rated BM) with an Insights-tab visit asserting the "Digestion"
heading and the regularity line (remember the full-regex gotcha — wrap
fragments in `.*`), or a new `k-bm-trends.yaml` seeding 2 BMs (one bad, one
typical) if extending muddies the existing flow. Metro for this worktree is
already on port 8081.
