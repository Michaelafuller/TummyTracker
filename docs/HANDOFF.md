# HANDOFF.md — Cycle: Goals tab, part 1 — daily nutrition tally

> **Read first:** root `CLAUDE.md` (auto-loaded). File paths below are from the
> current tree; read the named files before editing.
>
> **Session type:** execute. Definition of done per CLAUDE.md §4:
> `npm run typecheck && npm run lint && npm test` green, tests ship with each
> change, one logical change per commit. **`npm run bundle:check` IS required**
> at closeout: this cycle adds `require()`d PNG tab-icon assets, and asset
> resolution is exactly Metro's domain — a missing/misnamed asset passes all
> three rungs and dies at bundle time.
>
> **Source of these requirements:** owner feature spec, 2026-08-15 planning
> session (PROGRESS.md Tier 2 "Goals tab: daily nutrition tally"). This is
> **part 1 of the Goals pair**: the aggregation tab only. Part 2 (nutrient
> threshold goals + daily check-in notification) is a separate later cycle —
> build nothing for it beyond keeping the screen's layout amenable to a
> section being added below the tally.

---

## Design contract (decided in planning — do not re-litigate)

- **New 5th tab "Goals"**, placed between Insights and Settings (final order:
  Home, Journal, Insights, Goals, Settings).
- v1 shows **today only** (local-time day of `Date.now()` at render). No date
  picker, no history, no 7-day trend (a later follow-on reuses the chart
  components — out of scope now).
- Aggregation is over **food-type parent rows only** (`FOOD_TYPES`), matching
  how analysis reads entries: grouped meals already carry aggregate nutrition
  on the parent row, and component rows live in a separate table — so summing
  parent rows never double-counts.
- **Missing-data honesty (owner requirement):** a sum that silently treats
  null as zero will understate protein (false alarms later) and understate fat
  (false comfort). Each nutrient row must disclose how many of today's entries
  had no value for it. Mistrusted numbers kill this feature.
- Nutrient set = the 8 fields of `NUTRITION_FIELDS` (`src/lib/validation.ts`),
  labeled via `NUTRITION_LABELS` (`src/lib/nutrition.ts`) — never hand-write
  labels/units.

---

## Phase 1 — pure tally helpers

- `src/lib/datetime.ts`: add `dayBounds(epochMs: number): { start: number; end: number }`
  — local-time midnight to next midnight (end exclusive), implemented with a
  `Date` mutated to 00:00:00.000 local. Doc-comment the exclusivity.
- `src/lib/dailyTally.ts` (new, pure, no React/no I/O):

  ```ts
  export interface NutrientTally {
    /** Sum over entries with a non-null value; null when NO entry had a value. */
    total: number | null;
    /** Entries in range that had a value for this nutrient. */
    loggedCount: number;
    /** Entries in range with null for this nutrient. */
    missingCount: number;
  }
  export interface DailyTally {
    entryCount: number; // food entries in [start, end)
    nutrients: Record<NutritionField, NutrientTally>;
  }
  export function tallyDailyNutrition(
    entries: readonly LogEntry[],
    start: number,
    end: number, // exclusive
  ): DailyTally
  ```

  Filter to `FOOD_TYPES` rows with `start <= loggedAt < end`. Round totals for
  display stability using the same precision as the OFF mapper
  (`src/lib/openFoodFacts.ts`): calories and sodiumMg to 0 decimals, gram
  fields to 1.
- **Tests** (`src/lib/__tests__/dailyTally.test.ts`): non-food rows excluded;
  boundary times (entry at exactly `start` included, at `end` excluded);
  null-vs-zero distinction (a logged 0 counts as logged, contributes 0);
  all-null nutrient → `total: null`, not 0; empty range; rounding; and
  `dayBounds` midnight/DST-agnostic sanity (start ≤ input < end, start is
  00:00 local).

**Commit:** `feat(lib): daily nutrition tally helpers`

---

## Phase 2 — the Goals tab

- **Icon assets** — `assets/images/tabIcons/goals.png` + `@2x` + `@3x`,
  matching the sibling icons' dimensions (inspect `home.png` sizes first).
  Icons are tinted (`tintColor`), so only the **alpha channel** matters: draw
  a white-on-transparent silhouette — a simple bullseye/target (two concentric
  rings + center dot) reads as "goals" at tab size. Generate the PNGs with a
  one-off Node script in the scratchpad (zlib is built-in; a minimal PNG
  encoder over an RGBA pixel matrix is ~40 lines) — commit only the PNGs,
  never the script. **Fallback if generation misbehaves:** copy the
  `insights*.png` files as `goals*.png` placeholders, and say so loudly in
  your report so the owner can swap in a real icon.
- `src/components/app-tabs.tsx`: register the `goals` screen between
  `insights` and `settings`, following the existing pattern exactly
  (`title: 'Goals'`, `tabBarLabel: 'Goals'`, `tabBarButtonTestID: 'tab-goals'`,
  tinted `Image` icon).
- `src/app/(tabs)/goals.tsx` (new screen):
  - Mirror the Insights tab's data-loading pattern (read
    `src/app/(tabs)/insights.tsx` first — same repository call, same
    focus/refresh behavior, same themed components).
  - Header: "Today" plus the formatted date (reuse `src/lib/datetime.ts`
    formatting helpers).
  - One row per `NUTRITION_FIELDS` entry: `NUTRITION_LABELS` label + total
    (em-dash or similar for `total: null`), and when `missingCount > 0` a
    subtle per-row caveat ("2 entries missing"). Above or below the table, one
    summary line: "From N entries today" (singular/plural handled).
  - Empty state (`entryCount === 0`): a short line inviting the user to log a
    meal — match the tone of existing empty states.
  - Every interactive element (if any) gets an `accessibilityLabel`; the tally
    rows should carry `accessibilityLabel`s that read naturally ("Protein: 42
    grams, 1 entry missing"). Use theme constants; no new chart types, no new
    dependencies.
- **Tests** (`src/app/(tabs)/__tests__/goals.test.tsx`, async RNTL v14 — await
  `render`/`fireEvent`, destructure queries from the awaited result; mock
  `@/db/repository` like the sibling tab tests do): totals render from mocked
  entries; the missing-data caveat appears only when a value is null; empty
  state renders with no entries; non-today and non-food entries excluded.

**Commit:** `feat(goals): Goals tab with today's nutrition tally`

---

## Explicitly out of scope (do not do these)

- Threshold goals, ≥/≤ directions, goal persistence, notifications, check-in
  times — **all of part 2** (separate cycle; it will add a `goal` table then).
- Date navigation / history / 7-day trends.
- Any schema change or migration.
- Watchlist, search, analysis changes; PROGRESS/RESULTS edits.

## After the phases (execute-session closeout)

1. Full rungs green, **plus `npm run bundle:check`** (new `require()`d assets).
2. Summarize per phase; call out any spec deviation explicitly (especially if
   the icon fallback was used).
3. Note for the next test-plan session: new Maestro coverage owed for the tab
   (log a meal → Goals tab shows it in the tally); pure-JS cycle otherwise —
   Metro-into-dev-client is sufficient for device verification.
