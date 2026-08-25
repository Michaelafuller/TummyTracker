# HANDOFF.md — Execute session: intake charts (Insights "Intake" section)

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§4 rungs, §8
> conventions, §9 guardrails). This cycle touches `src/lib/chartData.ts`, new
> `src/components/charts/IntakeBars.tsx`, `src/app/(tabs)/insights.tsx`, and
> tests. **No new dependency, no schema change, no network.** Zero-dep
> plain-View charts only (Decision 2).

**Planned 2026-08-24 (Fable plan session), owner-requested and pinned:**
intake charts — the follow-on half of the old "BM-regularity + intake charts"
row, right after the Digestion section shipped.

---

## 0. Context (verified — do not re-derive)

- `src/lib/chartData.ts` holds `weeklySentiment` with the canonical rolling
  7-day bucketing (`startOfDay`, exclusive `end`, oldest-first, `MONTH_ABBR`
  labels) and a private `isFood` (FOOD_TYPES allowlist). Extend this file —
  don't duplicate the helpers elsewhere.
- Nutrition fields: `NUTRITION_FIELDS` / `NutritionField`
  (`src/lib/validation.ts`); display nouns: `NUTRITION_NOUNS`
  (`src/lib/nutrition.ts`, e.g. `calories` → "calories", `fiberG` → "fiber").
  Entry nutrition columns are nullable reals.
- Chart precedents: `TrendBars` (weekly bars, empty-slot-for-null tracks,
  CHART_HEIGHT 64) and the just-shipped `CountBars`/`BristolHistogram`.
- **Gotcha #5 (found on-device this same day, `docs/E2E.md`): a chart
  container View's `accessibilityLabel` MUST be paired with `accessible`** or
  it never becomes an Android a11y node (inert for TalkBack and Maestro).
  Copy the two-line comment from `CountBars.tsx`. This is non-negotiable —
  the Maestro flow asserts these summaries.
- Insights screen: sections in one ScrollView; the "Digestion" section
  (gated on `summary.bmEntries > 0`) sits after "Trend", before
  `WatchlistSection`.

## 1. Changes

### 1.1 `src/lib/chartData.ts` — `weeklyIntake`

```
export interface IntakeWeekBucket { label: string; avg: number | null }
export function weeklyIntake(
  entries, now, field: NutritionField, weeks = 8,
): IntakeWeekBucket[]
```

Same bucketing loop as `weeklySentiment` (identical labels so all three
weekly charts line up). Per bucket: take **food** entries (`isFood`) whose
`entry[field]` is a non-null finite number; `avg` = `round1(sum / 7)` —
average per calendar day across the full 7-day bucket, comparable to the
Goals tab's daily framing. `avg: null` when the bucket has **no** food entry
with a value for `field` (no data ≠ zero intake — same principle as
`weeklySentiment`). A bucket where values exist but sum to 0 yields `0`
(real data). Keep it field-generic; no per-nutrient special cases.

### 1.2 New `src/components/charts/IntakeBars.tsx`

Mirror `TrendBars`' structure/styles (CHART_HEIGHT 64, flex bar slots,
bordered tracks, label row). Props:

```
{ buckets: readonly IntakeWeekBucket[]; noun: string; unit: string }
```

- Height ∝ `avg / max(avg across buckets)` (min 4 when avg > 0; a 0 avg
  renders the min-height bar — zero intake is data; null renders an empty
  track). Single fill color `theme.primary`.
- Container: `accessible` + `accessibilityLabel` (gotcha #5), summary format
  **exactly**:
  - with data: `Weekly ${noun} intake: ${withData.map((b) => `week of
    ${b.label}, about ${b.avg} ${unit} per day`).join('; ')}.`
  - no data: `Weekly ${noun} intake: not enough nutrition data yet.`
  (The Maestro flow asserts `.*about 30 kcal per day.*` — keep the phrase
  "about {avg} {unit} per day" verbatim.)

### 1.3 `src/app/(tabs)/insights.tsx` — "Intake" section

Directly after the Digestion section, before `WatchlistSection`:

- Compute `caloriesBuckets = weeklyIntake(entries, now, 'calories')` and
  `fiberBuckets = weeklyIntake(entries, now, 'fiberG')`.
- Gate: render the section only when either has a non-null bucket.
- Contents:
  - `<ThemedText type="subtitle">Intake</ThemedText>`
  - caveat line (small, textSecondary): `Counts only entries with logged
    nutrition — sparse logging reads low.`
  - `<ThemedText type="smallBold">Calories</ThemedText>` +
    `<IntakeBars buckets={caloriesBuckets} noun="calories" unit="kcal" />`
  - `<ThemedText type="smallBold">Fiber</ThemedText>` +
    `<IntakeBars buckets={fiberBuckets} noun="fiber" unit="g" />`
  - Render each nutrient block only when that nutrient has a non-null
    bucket (e.g. calories logged but never fiber → only Calories shows).
- Reuse `styles.section`; no other screen changes.

## 2. Tests (same change, CLAUDE.md §4)

- **`src/lib/__tests__/chartData.test.ts`** — extend with `weeklyIntake`:
  sum÷7 math + round1; null bucket when no entries carry the field; explicit
  0 values yield `avg: 0` (not null); non-food entries (BM/symptom) ignored;
  bucket boundaries consistent with `weeklySentiment` (same labels for the
  same `now`); field-genericity via a second field (e.g. `fiberG`).
- **New `src/components/charts/__tests__/IntakeBars.test.tsx`** (async RNTL
  v14 — `await render`, destructure queries): renders one slot per bucket,
  the exact with-data summary label, and the no-data summary.
- **`src/app/(tabs)/__tests__/insights.test.tsx`** — extend: entries with
  calories → "Intake" + "Calories" render; calories but no fiber → no
  "Fiber" heading; no nutrition data at all → no "Intake" section.

## 3. Definition of done

- `npm run typecheck` && `npm run lint` && `npm test` green — run them.
- No `// @ts-ignore`, no lint disables, no new dependency, no schema change.
- Commits (imperative, scoped), suggested split:
  `feat(insights): Intake section — weekly calories + fiber charts` ·
  `test(insights): intake chart coverage`. (One feat commit is fine — the
  lib helper and component ship together.)
- Execute summary: files, commits, rung counts, deviations with reasons.

## 4. After this (review pass + test session)

Fable reviews the diff, then authors + runs `flows/l-intake-charts.yaml` on
the Pixel: log one meal through the builder with Calories 210 and Fiber 7
(→ deterministic weekly averages 30 kcal/day and 1 g/day) → Insights →
scroll to "Intake" → assert the headings and the summaries
(`.*about 30 kcal per day.*`, `.*about 1 g per day.*`). **Metro for this
worktree is on port 8082** (helper already updated).
