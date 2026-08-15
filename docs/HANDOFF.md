# HANDOFF.md — Cycle: trigger watchlist / elimination mode

> **Read first:** root `CLAUDE.md` (auto-loaded). Every task below is specced
> with file paths from the current tree; discover exact insertion points by
> reading the named files before editing.
>
> **Session type:** execute. Definition of done per CLAUDE.md §4:
> `npm run typecheck && npm run lint && npm test` green, tests ship with each
> change, one logical change per commit, imperative scoped commit messages.
> **This cycle adds a schema migration, so `npm run bundle:check` IS required**
> at closeout (a new migration `.sql` file must be inlined by
> `babel-plugin-inline-import` — exactly the class of bug the three rungs
> can't see).
>
> **Source of these requirements:** owner planning session 2026-08-15;
> PROGRESS.md Tier 1 "Trigger watchlist / elimination mode" — *mark suspected
> ingredients, flag entries containing them, track reactions — how food
> journals are actually used therapeutically.* This is the top-ranked unshipped
> differentiator item. It builds on the hardened ingredient capture: entry
> `tagsJson` now carries parenthetical sub-ingredients, allergens, and
> additives, and the backfill repaired historical rows.

---

## Design contract (decided in planning — do not re-litigate)

- A **watchlist item** is a normalized text term the user suspects ("soy",
  "dairy", "e322"). Watching starts at `createdAt` — that timestamp doubles as
  the **elimination start date**. v1 has no pause/status; removing an item
  stops watching it.
- **Matching is prefix-at-word-boundary**, not substring: a term matches a tag
  when `tag === term` OR the term appears in the tag starting at a word
  boundary (start of tag, or after a space/hyphen). So `soy` matches
  `soybeans` and `soy lecithin` and `hydrolyzed soy protein`, but `milk` does
  **NOT** match `buttermilk`. Rationale (mirror of the additive-tags policy,
  inverted for alerts): a warning that cries wolf erodes trust faster than a
  missed match disappoints. Multi-word terms work via the same rule
  (`soy protein` matches `isolated soy protein`). Document this in the
  matcher's doc comment with the buttermilk example.
- **Analysis-side stats reuse the parent-row convention:** stats are computed
  over `logEntry` rows' `tagsJson` only (never component rows), matching how
  `src/features/analysis/insights.ts` reads tags.
- **Where it lives in the UI:** a Watchlist section on the Insights tab
  (manage + stats), a one-tap "Watch" action on each ingredient finding card
  (the therapeutic loop: insight → watch → confirm), a warning banner on the
  entry view for entries containing watched ingredients, and a non-blocking
  notice on the meal review screen before save (the elimination-mode value
  moment). No notifications this cycle.

---

## Phase 1 — schema, migration, repository

- `src/db/schema.ts`: new `watchlistItem` table (`watchlist_item`):
  `id` (text pk), `term` (text, not null, **unique**), `createdAt` (int ms).
  Follow the existing table definitions' style. Export `WatchlistItem` /
  `NewWatchlistItem` inferred types like the others.
- Generate migration 0007 with the project's drizzle-kit setup (see
  `drizzle.config.ts` / package.json scripts; migrations live in
  `src/db/migrations/` and are registered in `migrations/migrations.js` by the
  generator). Additive only — do not touch prior migrations.
- `src/db/repository.ts`: `listWatchlistItems(): Promise<WatchlistItem[]>`
  (ordered by `createdAt` asc), `addWatchlistItem(term: string)` (id/createdAt
  filled in, per `createLogEntry`'s pattern; caller passes an
  already-normalized term), `removeWatchlistItem(id: string)`.

**Commit:** `feat(db): add watchlist table and repository (migration 0007)`

---

## Phase 2 — pure matching + stats (`src/lib/watchlist.ts`, new)

Pure, no React, no I/O — this is where the test leverage lives.

- `normalizeWatchTerm(input: string): string | null` — same normalization as
  tag extraction (lowercase, strip chars outside `[a-z0-9 -]`, collapse/trim
  whitespace); null when the result is shorter than 2 chars. If
  `src/lib/ingredients.ts` doesn't already export its normalization step,
  extract/export it there and reuse — do not duplicate the regex chain.
- `matchesWatchTerm(tag: string, term: string): boolean` — the
  prefix-at-word-boundary rule from the design contract. Escape the term
  before building any RegExp.
- `findWatchedTags(tagsJson: string | null, items: readonly WatchlistItem[])`
  → `{ item: WatchlistItem; matchedTags: string[] }[]` — which watched terms an
  entry trips, with the tags that matched (for banner copy). Empty array when
  no matches / null tagsJson.
- `computeWatchStats(item: WatchlistItem, entries: readonly LogEntry[], now: number)`
  → per-item stats over **food-type parent rows** (filter `FOOD_TYPES`):
  - `timesSinceWatch`: matching entries with `loggedAt >= item.createdAt`;
  - `lastEatenAt`: max `loggedAt` of matching entries overall, or null;
  - `cleanDays`: full days from `max(lastEatenAt, item.createdAt)` to `now`
    (never negative) — "clean since watching" when never eaten since;
  - `avgSentiment` + `ratedCount` over matching rated entries (all-time).
  Take `now` as a parameter — no `Date.now()` inside lib functions.

**Tests** (`src/lib/__tests__/watchlist.test.ts`): matching — exact, word
start, mid-tag word boundary, hyphen boundary, the `milk`/`buttermilk`
negative, multi-word term, regex-special chars in a term; normalization —
case/punctuation/short-input-null; stats — timesSinceWatch respects
`createdAt`, cleanDays for eaten-after-watch vs never-eaten, unrated entries
excluded from avg, non-food rows ignored.

**Commit:** `feat(watchlist): tag matching and per-term stats helpers`

---

## Phase 3 — store + Insights-tab watchlist section

- `src/features/watchlist/watchlistStore.ts`: minimal zustand store mirroring
  `src/features/prefs/prefsStore.ts`'s shape — `items`, `load()` (from
  repository), `add(term)`, `remove(id)` (each calls the repository then
  refreshes/updates state). Hydrate it in `src/components/app-providers.tsx`'s
  `MigrationGate` success effect (alongside `runTagBackfillOnce()`) — watchlist
  reads must not race the migration gate.
- Insights tab (`src/app/(tabs)/insights.tsx`):
  - New **Watchlist section**: per item show the term, times-since-watch,
    clean-days streak (or "clean since watching"), avg sentiment where rated
    (render sentiment via `src/features/sentiment/scale.ts` — never hard-code
    emoji), and a remove control. Manual add: a `TextInput` + add button that
    runs `normalizeWatchTerm` and rejects dupes (the DB `unique` constraint is
    the backstop, not the UX). Empty state: one line inviting the user to add
    a suspect or watch one from a finding.
  - Each **ingredient finding card** (`TagFinding` list) gets a one-tap
    "Watch"/"Watching" affordance keyed on whether the tag is already covered
    by `matchesWatchTerm` against current items.
  - Every interactive element gets an `accessibilityLabel` (CLAUDE.md §8);
    follow the tab's existing styling/theme constants. No new chart types.
- Component tests (async RNTL v14 — await `render`/`fireEvent`, destructure
  queries from the awaited result): section renders items + stats; add
  normalizes and persists; remove removes; finding-card Watch adds the tag;
  already-watched tag shows "Watching". Mock the repository module the way
  existing screen tests mock DB access.

**Commit:** `feat(watchlist): insights-tab section with stats and quick-watch`

---

## Phase 4 — flag watched ingredients at the point of use

- Entry view (`src/app/entry/[id].tsx`): when `findWatchedTags` on the loaded
  entry is non-empty, render a warning banner naming the matched terms (and
  the matching tags when they differ, e.g. "soy — matched: soybeans"). Styled
  with existing theme constants; `accessibilityLabel` on the banner.
- Meal review (`src/app/meal/review.tsx`): compute the union of component
  tags (the same union that will be saved — see `unionComponentTags` usage)
  and show a **non-blocking** notice above the save button when watched
  ingredients are present. It must never prevent saving — elimination mode is
  the user's choice to break, and the journal must capture the lapse.
- Component tests for both: banner/notice appears when tags match a watched
  term, absent otherwise, save still works with the notice showing.

**Commit:** `feat(watchlist): flag watched ingredients on entry view and meal review`

---

## Explicitly out of scope (do not do these)

- Pause/snooze/status on watchlist items; editing a term (remove + re-add).
- Notifications of any kind (Goals cycle owns notification UX later).
- Badges in the browse/calendar lists (candidate follow-on; note it, skip it).
- Component-row-level matching or any change to analysis/insights math.
- Any OFF/search/backfill changes; Goals feature; PROGRESS/RESULTS edits.

## After the phases (execute-session closeout)

1. Full rungs green, **plus `npm run bundle:check`** (new migration `.sql`
   must survive Metro export).
2. Summarize per phase; call out any spec deviation explicitly.
3. Note for the next test-plan session: new Maestro coverage owed for the
   watchlist loop (add from finding → see review notice → entry banner), and
   the owner's device checklist gains "migration 0007 against a real
   database".
