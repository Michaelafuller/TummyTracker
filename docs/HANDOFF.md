# HANDOFF.md — Execute session: per-food / ingredient drill-down

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§4 rungs, §8
> conventions, §9 guardrails). This cycle touches new
> `src/features/analysis/drilldown.ts`, new `src/app/insight/detail.tsx`,
> `src/app/_layout.tsx` (one Stack.Screen), `src/app/(tabs)/insights.tsx`
> (Card becomes tappable), and tests. **No new dependency, no schema change,
> no network.**

**Planned 2026-08-24 (Fable plan session), owner-requested and pinned:** tap
an Insights finding → a detail screen listing **every instance and its
outcomes**. The natural follow-on to insights v2 (Tier 2's last no-dep row).

---

## 0. Context (verified — do not re-derive)

- Findings (`src/features/analysis/insights.ts`): `FoodFinding.name` is the
  trimmed display name, grouped **case-insensitively** on
  `entry.name.trim().toLowerCase()`; `TagFinding.tag` and
  `TemporalFinding.tag` are normalized tag tokens (exact strings from
  `parseTagsJson`).
- `src/features/analysis/temporal.ts` exports `isOutcome(entry)` (bad BM /
  severity ≥ 3 symptom / sentiment ≤ 2 food) and uses a 24 h
  follow-window; import its exported window constant if one exists, else a
  local `24 * 60 * 60 * 1000`.
- `FOOD_TYPES` is exported from `src/db/schema.ts`; `parseTagsJson` from
  `src/lib/ingredients.ts`.
- Insights screen: `Card` (local component) renders every finding; the
  screen navigates nowhere today. `useAllEntries()` supplies entries;
  screens push routes with `expo-router`'s `useRouter`.
- Root stack: every screen is registered in `src/app/_layout.tsx`
  (`entry/[id]` → title "Edit entry" is the precedent for a pushed,
  non-modal screen). A screen can override its own header title by
  rendering `<Stack.Screen options={{ title }} />` inside its body.
- Sentiment display: `sentimentLabel`/emoji come from
  `src/features/sentiment/scale.ts` (see `EntryRow.tsx` usage). Dates:
  `formatLongDate` + `formatTime12h` (`src/lib/datetime.ts`).

## 1. Changes

### 1.1 New `src/features/analysis/drilldown.ts` — pure logic (sits beside temporal.ts)

```
export type DrilldownKind = 'food' | 'tag';
export interface DrilldownInstance { entry: LogEntry; followedByOutcome: boolean }
export function findingInstances(
  entries: readonly LogEntry[], kind: DrilldownKind, value: string,
): DrilldownInstance[]
export interface DrilldownSummary {
  count: number; rated: number; avgSentiment: number | null; outcomes: number;
}
export function drilldownSummary(instances: readonly DrilldownInstance[]): DrilldownSummary
```

- Matching (food entries only — `FOOD_TYPES` allowlist): `kind 'food'` →
  `entry.name.trim().toLowerCase() === value.trim().toLowerCase()` (mirror
  the insights grouping exactly); `kind 'tag'` →
  `parseTagsJson(entry.tagsJson)` contains `value` (exact token match).
- `followedByOutcome`: some OTHER entry `o` with `isOutcome(o)` and
  `0 < o.loggedAt - entry.loggedAt <= windowMs` (24 h — same semantics as
  temporal's hit definition; an outcome at the same instant does not count).
- Sort instances newest-first (`loggedAt` desc).
- `drilldownSummary`: `count` = instances; `rated`/`avgSentiment` over
  entries with `isSentimentValue(sentiment)` (round to 1 decimal, null when
  none rated); `outcomes` = instances with `followedByOutcome`.

### 1.2 New `src/app/insight/detail.tsx` — the drill-down screen

- Params: `useLocalSearchParams<{ kind: DrilldownKind; value: string }>()`;
  guard invalid `kind`/empty `value` with the "Entry not found"-style
  centered fallback (`entry/[id].tsx` precedent), text "Nothing to show".
- `<Stack.Screen options={{ title: value }} />` so the header shows the
  food/tag itself.
- `useAllEntries()` → `findingInstances` → `drilldownSummary`.
- Layout (ScrollView, `entry/[id]`-style padding):
  - Summary line (small, textSecondary):
    `${count} logs · ${rated} rated${avgSentiment != null ? ` · avg sentiment ${avgSentiment}` : ''} · ${outcomes} followed by a rough outcome`.
  - One row per instance (Pressable →
    `router.push(`/entry/${entry.id}`)`), styled like the entry screen's
    component rows (bordered, `backgroundElement`, chevron `›`):
    - line 1 (smallBold): `formatLongDate(loggedAt)` · `formatTime12h(loggedAt)`
    - line 2 (small): entry name (always — for food kind it confirms the
      match; for tag kind it identifies the meal), then sentiment as
      `${emoji} ${label}` or `Not rated`.
    - when `followedByOutcome`: line 3 (small, `themeColor="danger"`):
      `Rough outcome within 24 h`.
    - `accessibilityRole="button"`,
      `accessibilityLabel={`Open ${entry.name}, ${formatLongDate(loggedAt)}`}`.
  - Empty list (params valid but no matches): centered "No matching logs."
- Register in `_layout.tsx`: `<Stack.Screen name="insight/detail"
  options={{ title: 'Finding' }} />` (non-modal, after `entry/[id]`).

### 1.3 `src/app/(tabs)/insights.tsx` — tappable finding cards

- `Card` gains optional `onPress?: () => void` and `pressLabel?: string`.
  With `onPress`, the card's outer `View` becomes a `Pressable`
  (`accessibilityRole="button"`, `accessibilityLabel={pressLabel}`), same
  styles; without it, exactly as today. Keep the `WatchButton` child
  working (nested pressables are fine — RNGH not involved here).
- Wire `onPress` + `pressLabel={`See all logs: ${title}`}` for:
  - `foodFindings` → `router.push({ pathname: '/insight/detail', params:
    { kind: 'food', value: finding.name } })`
  - `ingredientFindings` → kind 'tag', value `finding.tag`
  - `temporalFindings` → kind 'tag', value `finding.tag`
  - **Not** pairs or nutrients (no single drill-down target — deferred).
- Add `useRouter` to the screen.

## 2. Tests (same change, CLAUDE.md §4)

- **New `src/features/analysis/__tests__/drilldown.test.ts`** (fixture style
  of `temporal.test.ts`): food matching is case-insensitive + trimmed and
  food-entries-only; tag matching exact (no prefix bleed); newest-first
  order; outcome window edges (inside counts, same-instant and >24 h don't;
  the instance itself never counts as its own outcome); summary math incl.
  null avg and zero-rated.
- **New `src/app/insight/__tests__/detail.test.tsx`** (mock `expo-router`'s
  `useRouter`/`useLocalSearchParams` + the entries hook, following
  `src/app/(tabs)/__tests__/insights.test.tsx` patterns; async RNTL v14):
  renders summary + rows for a food value; outcome line shown only on
  flagged rows; row press pushes `/entry/<id>`; invalid kind → fallback.
- **`src/app/(tabs)/__tests__/insights.test.tsx`** — extend: a food-finding
  card exposes the `See all logs: …` label and pressing it pushes
  `/insight/detail` with the right params; a nutrient card has no such
  label.

## 3. Definition of done

- `npm run typecheck` && `npm run lint` && `npm test` green — run them.
- No `// @ts-ignore`, no lint disables, no new dependency, no schema change.
- Commits (imperative, scoped), suggested split:
  `feat(analysis): finding drill-down instances + summary helpers` ·
  `feat(insights): tap a finding to see every log behind it` ·
  `test(insights): drill-down coverage`.
- Execute summary: files, commits, rung counts, deviations with reasons.

## 4. After this (review pass + test session)

Fable reviews the diff, then authors + runs `flows/m-finding-drilldown.yaml`
on the Pixel: reuse `_helpers/seed-ingredient-reactions.yaml` (as
`d-ingredient-insights.yaml` does) → Insights → tap a `See all logs: …`
card → assert the detail screen's summary line and a row, tap the row →
"Edit entry". **Metro for this worktree is on port 8083** (helper current);
this host's orphaned-Metro quirk means any restart takes port 8084 next.
