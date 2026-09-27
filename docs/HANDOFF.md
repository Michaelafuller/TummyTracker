# HANDOFF.md — Execute session: Work backwards from a bad day, GitHub #15

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§4 rungs, §8
> conventions, §9 guardrails). This cycle adds new
> `src/features/analysis/lookback.ts`, a new screen
> `src/app/outcome/[id].tsx`, a small entry point in
> `src/app/entry/[id].tsx`, one `Stack.Screen` in `src/app/_layout.tsx`, and
> tests.
>
> **Pure JS/TS, read-only feature** — no new dependency, no schema change, no
> new permission, no writes, no native change, no EAS build.

**Planned 2026-09-27 (Opus plan session) — GitHub
Michaelafuller/TummyTracker#15.** Done-when (from the issue): "a rough outcome
opens a timeline of preceding meals and medications, each with its existing
suspicion level." It's the reverse of the Insights finding drill-down
(`src/app/insight/detail.tsx`, `features/analysis/drilldown.ts`) and reuses
the engine's existing findings — it computes nothing new about causation.

---

## 0. Invariants — read twice

- **The engine does not change.** No edits to `temporal.ts`, `insights.ts`,
  `drilldown.ts`, `isOutcome`, or any finding's thresholds. "Suspicion" is
  read off `computeInsights(entries)`'s existing findings, nothing else.
- **No finding ≠ safe.** A food with no matching finding shows **"No pattern
  yet"** — never "safe", "fine" or a green/positive treatment.
- **Medications are shown, never scored.** They appear in the timeline (the
  issue asks for "eaten *and taken*"), but the engine doesn't analyse them
  (CLAUDE.md / Cycle B invariant: medication correlation is future work), so
  they carry no suspicion and the screen says so once.
- **Only rough outcomes get the entry point** — `isOutcome(entry)` on the
  *saved* entry, the same rule as everywhere else.
- **Window rule matches the engine's join:** an item counts when
  `outcome.loggedAt - windowMs <= item time < outcome.loggedAt` (inclusive
  at the far edge, strictly before the outcome — an item at the exact same
  instant is excluded, like `mealsFollowedByOutcome`).
- Observations, not advice: keep the Insights disclaimer tone.
- Stage files by path — never `git add -A` / `git add .`.

## 1. Pure logic — `src/features/analysis/lookback.ts` (main test target)

```ts
import type { ConfidenceTier } from '@/lib/stats';

export const LOOKBACK_HOURS = [24, 48, 72] as const;
export type LookbackHours = (typeof LOOKBACK_HOURS)[number];

export interface SuspicionMatch {
  kind: 'food' | 'ingredient' | 'combination';
  label: string;              // finding.label — "Wheat Bread", "gluten", "milk + wheat"
  confidence: ConfidenceTier;
}

export type LookbackItem =
  | { kind: 'food'; entry: LogEntry; hoursBefore: number;
      /** Strongest match's tier, or null = "No pattern yet". */
      suspicion: ConfidenceTier | null;
      /** Every matching finding, strongest first (high > medium > low, then foods, ingredients, combinations). */
      matches: SuspicionMatch[] }
  | { kind: 'medication'; item: MedicationJournalItem; hoursBefore: number | null /* null when time not set */ };

export function lookback(
  outcome: LogEntry,
  entries: readonly LogEntry[],
  medicationItems: readonly MedicationJournalItem[],
  findings: Pick<Insights, 'foodFindings' | 'ingredientFindings' | 'pairFindings'>,
  hours: LookbackHours,
): LookbackItem[]

/** "Just before" (< 1 h) | "3 h before" | "1 day 2 h before" (≥ 24 h). */
export function hoursBeforeLabel(hoursBefore: number): string
```

- **Food items:** entries of `FOOD_TYPES` inside the window (§0 rule).
  Matching, mirroring `drilldown.ts`'s grouping exactly:
  - food finding when `finding.key === entry.name.trim().toLowerCase()`;
  - ingredient finding when `finding.key` is in `parseTagsJson(entry.tagsJson)`;
  - combination finding when **both** tags of its `"a + b"` key are in the
    entry's tags (split on `' + '`; the key is built from sorted tags in
    `analyzePairOutcomes`, so don't depend on order).
- **Medication items:** from `medicationEventsToJournalItems(...)`
  (`src/lib/journal.ts` — export a `MedicationJournalItem` type alias for the
  `kind: 'medication'` variant if one doesn't exist). Inside the window by
  `loggedAt`. `timeKnown: false` items (stored at local noon) are included
  when noon is in the window, with `hoursBefore: null`.
- Other BMs/symptoms in the window are **not** listed (keep it to what was
  eaten and taken).
- Order: **closest to the outcome first** (smallest `hoursBefore`; untimed
  meds sort by their noon `loggedAt` like the rest). `hoursBefore` = whole
  hours, floored.
- `MedicationJournalItem` is exported from `journal.ts` if not already.

## 2. Screen — `src/app/outcome/[id].tsx`

- `Stack.Screen` in `_layout.tsx`: `name="outcome/[id]"`, title
  **"What came before"**.
- Data: `getLogEntry(id)` on focus (like `entry/[id].tsx`), `useAllEntries()`,
  `useMedicationEvents()` / `useMedicationDoses()` / `useMedications()` →
  `medicationEventsToJournalItems`, `computeInsights(entries)`. If the entry is
  missing or isn't an outcome (`!isOutcome(entry)`): "Nothing to show"
  (mirror `insight/detail.tsx`'s invalid state).
- Layout, top to bottom:
  1. The outcome itself via `EntryRow` (reuse — it's already a link to
     `/entry/[id]`), then one `textSecondary` line: the long date.
  2. `SegmentedControl` of `LOOKBACK_HOURS` labelled "24 h" / "48 h" / "72 h",
     default **24 h** (the engine's own window). State is local.
  3. The timeline: for each item a row group —
     - food: a `textSecondary` line `hoursBeforeLabel(...)`, then `EntryRow`
       (reuse — tap opens the meal), then a suspicion line: the strongest
       tier as a chip reusing Insights' confidence colours ("High
       suspicion" / "Medium" / "Low"), followed by the matched labels
       ("Linked to rough outcomes: gluten, Wheat Bread") — or, with no
       match, `textSecondary` **"No pattern yet"**. Give the group
       `accessibilityLabel` `"<name>, <hoursBefore label>, <suspicion text>"`.
     - medication: the `hoursBeforeLabel` line (or "Same day, time not set"),
       then `MedicationEventRow` (reuse — tap opens the dose entry).
  4. Empty state: "Nothing logged in the 24 h before this." (use the selected
     window) + "Try a longer window." when not already at 72 h.
  5. Footer (`textSecondary`): "Suspicion comes from your Insights patterns
     (a rough outcome within 24 h of eating). Medications aren't part of the
     pattern analysis yet. Observations, not medical advice."
- Extract the Insights `ConfidenceChip` colour logic only if it's trivial to
  share (a tiny exported helper in `insights.tsx` or a component under
  `src/components/`); otherwise duplicate the three colour choices — don't
  refactor Insights for this.

## 3. Entry point — `src/app/entry/[id].tsx`

- When the loaded entry is a BM or symptom **and** `isOutcome(entry)`: above
  the form, a compact `Pressable` banner — `smallBold` "Rough outcome" + link
  text **"See what came before"** (`accessibilityRole="button"`,
  `accessibilityLabel="See what came before"`,
  `testID="see-what-came-before"`) → `router.push('/outcome/<id>')`.
- Not shown for food entries, for non-rough BMs/symptoms, or before load.
- It sits beside the existing watched-ingredient banner logic (that one only
  applies to food) — don't disturb it.

## 4. Tests (same change, CLAUDE.md §4)

- `src/features/analysis/__tests__/lookback.test.ts` — window edges (exactly
  24 h before = in; same instant = out; after = out; 24 h + 1 ms = out at 24,
  in at 48); food/ingredient/combination matching (case-insensitive food
  name; exact tag; pair needs both tags, order-free); strongest-first match
  order; no match → `suspicion: null`; medication items in/out of window;
  untimed med → `hoursBefore: null`; BMs/symptoms excluded; ordering;
  `hoursBeforeLabel` (0.5 h, 3 h, 26 h).
- Screen test `src/app/outcome/__tests__/[id].test.tsx` (mock repository +
  hooks like `insight/detail`'s test): outcome renders; default 24 h hides a
  30-h-earlier meal and 48 h shows it; a matched meal shows its tier +
  labels, an unmatched one "No pattern yet"; a medication row renders with no
  suspicion; non-outcome entry → "Nothing to show"; empty-window copy.
- `entry/[id]` test: banner shown for a rough BM and a severity-3 symptom;
  hidden for a food entry, a Bristol-4 BM with feel 4, and a severity-2
  symptom; tap pushes `/outcome/<id>`.
- `journal.test.ts` stays green (if you add the type alias).

## 5. Definition of done

- `npm run typecheck` && `npm run lint` clean; `npm run bundle:check` clean
  (new route).
- **Targeted Jest only (owner instruction — never the full suite):** every
  test file you created or touched + `drilldown`, `insights` (analysis),
  `journal`, `insight/detail`, `entry/[id]`, and the Insights screen test.
  `(tabs)` paths via `npx jest --runTestsByPath "<path>"`; bracketed paths
  like `[id]` also need `--runTestsByPath` with the path quoted.
- No `@ts-ignore`, no lint disables, no `any` without `// reason:`, no new
  deps, no schema change.
- Do NOT run Maestro, EAS, or `npx expo start` (Metro runs on 8081 — leave
  it). Do NOT edit `flows/`, `CLAUDE.md` or `docs/`.
- Keep LF line endings if you write files with a script.
- Commits (stage by path), suggested split:
  `feat(analysis): lookback from a rough outcome with existing suspicion` ·
  `feat(insights): "What came before" timeline for a rough outcome` —
  each ending `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
  Do NOT push.
- Execute summary: files per commit, hashes, rung + bundle:check results,
  targeted Jest counts, deviations with reasons, review/device-test pointers.

## 6. After this (review + test session)

- Opus review: §0 invariants (engine untouched, "No pattern yet" wording,
  meds unscored, window edges), matching parity with `drilldown.ts`.
- Maestro (Opus writes it): seed meals + a rough symptom → open the symptom →
  "See what came before" → meals listed with suspicion / "No pattern yet" →
  72 h widens the list → tapping a meal opens it.
