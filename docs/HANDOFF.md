# HANDOFF.md — Cycle: owner feedback batch (bugs) + meal builder + insights v2

> **Read first:** root `CLAUDE.md` (auto-loaded). No other protocol doc is needed
> for this handoff — every task below is fully specced with file paths.
> `docs/E2E.md` is only needed if you touch a flow YAML beyond the edits listed
> here.
>
> **Session type:** execute (feature). Definition of done per CLAUDE.md §4:
> `npm run typecheck && npm run lint && npm test` green, tests ship with the
> feature, one logical change per commit, imperative scoped commit messages.
> Do NOT run `npm run e2e` (no device attached). Flow YAML edits are *authored*
> (⏳), never claimed verified.
>
> **Source of these requirements:** direct owner feedback (2026-07-02 planning
> session), including iOS field reports. Where a spec below conflicts with an
> older doc, this handoff wins. (The prior HANDOFF's remaining device work —
> rebuild + run `e-temporal-insights`, `ab-satfat-ingredients`,
> `d-ingredient-insights` — lives in `docs/RESULTS.md` §"For next session" and
> PROGRESS Tier 4; it is a test-execute task, not part of this cycle.)

This cycle has three phases. Each phase is independently shippable and lands as
its own series of commits. Do them in order.

---

## Phase 1 — Owner bug/UX batch (six items, ~6 commits)

### 1.1 Notes limit 200 → 500 chars

Change `MAX_NOTES_LENGTH` from 200 to 500 in `src/lib/validation.ts:10` and
update its JSDoc (line 13). All three forms (LogEntryForm, BmForm, SymptomForm)
and the validation tests consume the constant and auto-update. Manual edits:

- `src/db/schema.ts:32` — comment says "max 200 chars" → 500.
- `src/features/logging/__tests__/formModel.test.ts:51-53` — test title says
  "over 200 chars"; the `'x'.repeat(201)` fixture must become `repeat(501)`.
- `CLAUDE.md` §6 — `notes (text, max 200 chars …)` → 500. (Also mirror the
  mentions in `docs/BUILD_PLAN.md:43,48` and `docs/ACCEPTANCE.md:65`.)
- `flows/01b-manual-entry.yaml` — header comment, the 210-char input (→ 510
  chars), and `assertVisible: "200/200"` → `"500/500"`. Authored-only (⏳).

Commit: `feat(logging): raise notes limit to 500 chars`

### 1.2 12-hour clock everywhere (display only)

Internal canonical formats stay exactly as they are — `HH:MM` form state,
`parseDateTime`, `parseClockTime`, epoch storage untouched. Only *rendered*
times change.

Add to `src/lib/datetime.ts` (+ unit tests in `src/lib/__tests__/datetime.test.ts`):

```ts
/** '3:07 PM' from epoch ms. 12-hour, no leading zero on hour. */
export function formatTime12h(epochMs: number): string
/** '3:07 PM' from hour/minute components (0–23 → 12h + AM/PM). */
export function formatClock12h(hour: number, minute: number): string
```

Edge cases to test: 00:xx → `12:xx AM`, 12:xx → `12:xx PM`, 23:59 → `11:59 PM`.

Display sites to convert:
- `src/features/logging/EntryRow.tsx:52` — `formatTimeInput(entry.loggedAt)` →
  `formatTime12h(entry.loggedAt)`.
- `src/components/date-time-field.tsx:76` — the time chip renders raw
  `timeInput`; render `parseClockTime(timeInput)` through `formatClock12h`
  (fall back to the raw string if parse fails).
- Settings reminder rows — handled by 1.3 (the new TimeField displays 12h).

Check `flows/` for assertions on `HH:MM`-style times (`g-datetime-picker.yaml`,
`01e-reminders.yaml`, `settings-smoke.yaml` are the likely ones) and update to
the new display format (authored-only ⏳).

Commit: `feat(ui): display times in 12-hour clock`

### 1.3 iOS time-picker dismissal bug + native picker for reminder times

**Confirmed root cause** (owner-verified on iOS): `handlePickerChange` in
`src/components/date-time-field.tsx:39-50` ignores `event.type` and
unconditionally calls `setPickerMode(null)`. On Android the native dialog fires
`onChange` once, so this works. On iOS the picker fires `onChange` on every
wheel pause, so the first pause commits + unmounts the picker.

Fix — platform-branch the picker rendering in `DateTimeField`:

- **Android (behavior unchanged):** conditional render, `display="default"`,
  onChange commits the value and closes (and closes without committing on
  `event.type === 'dismissed'`).
- **iOS:** render the picker *inline* below the chips with `display="spinner"`;
  `onChange` **commits the value but does not close**. Add a "Done" chip
  (accessibilityLabel "Done choosing date" / "Done choosing time") that closes
  the picker. Opening the other chip switches modes without losing state.

Then create `src/components/time-field.tsx` — a single chip + the same
platform-branched time picker — and replace the raw `HH:MM` `ThemedTextInput`s
in `src/app/(tabs)/settings.tsx:204-215` with it. Internal reminder state stays
`{hour, minute}`; the chip displays `formatClock12h`. Keep `commitTime`
semantics: committing a time on an enabled reminder reschedules it via
`enableReminder`.

Component tests: RNTL tests for `DateTimeField` with `Platform.OS` mocked to
`ios` — assert a change event does NOT unmount the picker and Done does; on
`android` assert change closes it. (Follow the existing async RNTL v14 pattern —
`await render(...)`.)

Update `flows/settings-smoke.yaml` / `01e-reminders.yaml` if they type into the
old reminder text inputs (they'll now tap chips) — authored-only ⏳.

Commits: `fix(form): keep iOS time picker open until Done` and
`feat(settings): native time picker for reminder times`

### 1.4 Recents: horizontal chips → searchable quick-add

Replace the horizontal `ScrollView` of chips on the Home screen
(`src/app/(tabs)/index.tsx:108-134`) with a searchable list:

- New pure helper `src/lib/recents.ts`: `filterRecents(entries: LogEntry[],
  query: string, limit = 6): LogEntry[]` — case-insensitive; empty query returns
  the first `limit` entries unchanged; otherwise rank prefix matches before
  substring matches, preserving recency order within each rank. Unit-test it
  (empty query, prefix-beats-substring, limit; dedupe stays upstream).
- Data: bump the existing `listRecentFoodEntries` call to `limit = 50` so
  search has depth (its dedupe-by-name logic already handles this).
- New component `src/features/logging/RecentFoodPicker.tsx`: a
  `ThemedTextInput` (placeholder "Search past foods…", accessibilityLabel
  "Search past foods") above a vertical list of up to 6 suggestion rows (food
  name + small secondary line, e.g. meal slot / kcal). Tapping a row calls the
  existing `handleRecentTap(entry)` prefill → `/entry/new` path unchanged. Keep
  `accessibilityLabel={'Re-log ' + entry.name}` on each row and add
  `testID={'recent-' + slug}` (Maestro needs id selectors). No dropdown/overlay
  library — a plain conditional list under the input, inside the existing
  ScrollView, is fine.
- Home screen: render `RecentFoodPicker` where the chips were; section heading
  stays "Recent".
- Component test: typing filters the rows; tapping fires the prefill callback.
- Update `flows/h-recent-foods.yaml` for the new interaction (tap search field →
  input text → tap `id: recent-<slug>`), authored-only ⏳.

Commit: `feat(home): searchable recents quick-add`

### 1.5 iOS app icon

**Confirmed root cause:** in `app.json`, `ios.icon` points at
`./assets/expo.icon` — a directory (Xcode `.icon` bundle) the build can't
resolve, so iOS falls back to the default Expo icon. Android's adaptive icon
config is correct; don't touch it.

- Point iOS at the generated PNG: set `ios.icon` to `./assets/images/icon.png`
  (or delete the `ios.icon` key so the correct top-level `icon` applies).
- iOS icons must be fully opaque. Check `scripts/generate-icons.mjs`: if
  `icon.png` renders with an alpha background, composite over the brand
  background (`#0D1C20`, same as the Android adaptive background) and
  regenerate via `npm run generate:icons`.
- Delete `assets/expo.icon/` only if nothing else references it (grep first).
- Verification available to you: `npm run bundle:check` green; the actual
  home-screen icon check is owner-on-device (EAS build) — say so in the summary.

Commit: `fix(ios): use generated PNG app icon instead of unresolvable .icon bundle`

### 1.6 Light-mode palette pass

Dark mode is the reference ("really nice") — do not change `Colors.dark` except
to add the two new tokens. Light mode's verified problems:
(a) cards barely separate from the white background (`#EDF6F6` on `#FFFFFF`);
(b) `linkPrimary` hardcodes `#3c87f7` (`src/components/themed-text.tsx:66`) —
~3.5:1 on white; (c) destructive/error red `#d9534f` hardcoded in
`src/components/form-fields.tsx:80` and `src/app/entry/[id].tsx:141`.

Changes in `src/constants/theme.ts`:

- Rework `Colors.light` to a "white cards on tinted canvas" scheme:
  `background: '#F2F7F7'` (soft teal-tinted off-white), `backgroundElement:
  '#FFFFFF'`, `border: '#D3E4E4'`, keep `backgroundSelected: '#C5E3E3'`,
  `primary`/`primaryText` unchanged. Shift `textSecondary` toward the teal-gray
  family (e.g. `#53696B`) for a homogenous feel — verify ≥4.5:1 on `#FFFFFF`
  and update the contrast-ratio comments honestly (compute, don't copy).
- Add tokens to BOTH palettes: `danger` (light `#B3261E`, dark `#FF8A80`) and
  `link` (light `#0F6E6C`, dark `#7FD4D2`).
- Replace the hardcoded `#3c87f7` (`linkPrimary`) and both `#d9534f` uses with
  the new tokens (themed-text needs the theme at that point — follow how other
  themed styles obtain it). Leave the justified hardcodes alone: scan-screen
  camera overlay, scan header in `_layout.tsx`, splash/animated-icon.
- Card-like surfaces get separation from `backgroundElement` + `border`: make
  sure card Pressables that currently set only `backgroundColor` also carry the
  hairline `borderColor: theme.border` (EntryRow does; check the insights
  `Card` and home quick actions).

Rungs + component tests only; the actual look is owner-on-device. Theme tokens
= "shared infra" per TEST_STRATEGY §6 — note in the summary that the next
device session must run the **full** flow suite.

Commit: `feat(theme): light-mode palette rework + danger/link tokens`

---

## Phase 2 — Meal builder: multi-scan grouped meals

**Owner intent:** nobody eats a whole can of peas. Scan several items, assume
one serving each, aggregate into ONE meal entry that carries a single
sentiment. Ingredient-level data must survive for correlation analysis.

**Architecture decision (do not deviate):** the meal stays **one `logEntry`
row** (existing type `'meal' | 'snack'`) whose nutrition columns hold the
*aggregate* and whose `tagsJson` holds the *union* of component tags.
Components live in a new child table. This keeps the Journal, edit screen,
backup, and every analysis function working on `logEntry` unchanged.

### 2.1 Schema (additive migration 0006)

New table in `src/db/schema.ts`:

```
mealComponent
  id           text PK
  entryId      text NOT NULL  → logEntry.id (index on entryId)
  name         text NOT NULL
  barcode      text nullable
  servings     real NOT NULL default 1
  servingG     real nullable          -- grams per single serving
  calories/fatG/saturatedFatG/carbsG/proteinG/fiberG/sugarG/sodiumMg
               real nullable          -- per ONE serving
  ingredientsText text nullable
  tagsJson     text nullable
  sortOrder    integer NOT NULL default 0
  createdAt    integer NOT NULL
```

Also add `componentCount integer` (nullable) to `logEntry` — denormalized so
`EntryRow` can label grouped meals without an N+1 query. Generate the migration
with `npm run db:generate` (never hand-edit the SQL); the `.sql` import goes
through `babel-plugin-inline-import`, so `npm run bundle:check` after wiring.

### 2.2 Pure aggregation lib

`src/lib/mealAggregate.ts` (+ tests):

- `aggregateComponents(components): NutritionValues` — per field: sum of
  `value × servings` over components that have the field; a field missing from
  **all** components stays `null` (don't fabricate zeros); round to 1 decimal.
- `unionComponentTags(components): string[]` — union of each component's
  `parseTagsJson(tagsJson)` **plus each component's normalized name**
  (`normalizeTag(name)`) so a component like "cheddar cheese" is correlatable
  even when OFF gave no ingredient text. Dedupe, preserve first-seen order.
- `defaultMealName(components): string` — first component's name for a single
  component, `"<first> + N more"` otherwise; user-editable on review.

### 2.3 Builder store + scan flow

- `src/features/logging/mealBuilderStore.ts` (zustand): `components:
  MealComponentDraft[]`, `addComponent`, `updateComponent(index, patch)`,
  `removeComponent(index)`, `clear`. A draft mirrors the table row minus
  id/entryId/createdAt.
- Scan flow change (`src/app/scan.tsx`): after a successful lookup (or manual
  fallback), land on a **component confirm** step with two save actions:
  - **"Add & scan next"** — push the draft into the builder store,
    `router.replace('/scan')`.
  - **"Finish meal"** — push the draft, go to `/meal/review`.
  Implement the confirm step as a new screen `src/app/meal/component.tsx`
  hosting the component-editable subset of the existing form (name, servings
  multiplier default 1, servingG, nutrition grid, ingredients) — reuse
  `LogEntryForm` internals/`FormField` pieces where practical, don't fork the
  whole form. The old direct scan→entry/new single-item path is replaced by
  this flow (a one-component meal degenerates to the same thing). The
  **manual** add path (Home → "Add an entry manually" → `entry/new`) is
  unchanged.
- `src/app/meal/review.tsx`: lists components (name, servings, kcal, remove
  button), live aggregate preview via `aggregateComponents`, then the
  meal-level fields: name (prefilled `defaultMealName`), type meal/snack, meal
  slot, date/time (`DateTimeField`), sentiment, notes. Save →
  `createMealWithComponents` → back to Home, builder store cleared. Every
  interactive element gets an accessibilityLabel; rows get
  `testID={'component-' + index}`. Keep dynamic text in single interpolated
  template literals (Maestro accessibility — see RESULTS.md session-4-D).

### 2.4 Repository + backup

- `createMealWithComponents(entry: CreateLogEntryInput, components:
  MealComponentDraft[]): Promise<LogEntry>` in `src/db/repository.ts` — single
  transaction: insert the entry (with `componentCount = components.length`,
  aggregate nutrition, union tags, `ingredientsText` = component names joined
  `", "`), insert component rows with `sortOrder` = array index.
- `getMealComponents(entryId): Promise<MealComponent[]>` ordered by `sortOrder`.
- Deleting an entry must remove its components — check how delete works today
  (FK cascade vs. manual) and keep it consistent.
- **Backup:** `src/lib/backup.ts` currently exports only `logEntry` rows.
  Extend the payload with a `mealComponents` array and accept BOTH the old
  shape (no components) and the new one on import. Unit-test the round-trip and
  the legacy-import path.

### 2.5 Display

- `EntryRow` subtitle for entries with `componentCount > 1`: append `· N items`
  (e.g. "Meal · lunch · 3 items · 640 kcal").
- `src/app/entry/[id].tsx`: when the entry has components, render a read-only
  "In this meal" list (name · servings · kcal) below the form (via
  `getMealComponents`). Editing aggregate fields directly stays allowed; v1
  does NOT support editing components after save (note as a known limitation).

### 2.6 Analysis compatibility check

No analyzer changes needed — they consume `logEntry` rows. Add one regression
test: a grouped meal built from two components (one tagged "milk", one "onion")
produces an entry whose `tagsJson` makes `analyzeIngredientSentiment` /
`analyzeTemporalTriggers` see both tags.

Maestro: multi-scan needs the camera → stays `· manual` (record in the summary
for the test-plan session; do NOT flow-author the camera).

Suggested commits: `feat(db): mealComponent table + componentCount (migration
0006)` · `feat(logging): meal builder store + aggregation lib` ·
`feat(logging): multi-scan component confirm + meal review screens` ·
`feat(db): createMealWithComponents + backup v2 round-trip` · `feat(logging):
grouped-meal display in journal and edit`.

---

## Phase 3 — Insights v2: baseline-relative stats, confidence, combinations, charts

**Owner directive (supersedes the old "insights stay simple" decision):** move
from absolute-threshold text summaries to baseline-relative, confidence-labeled
findings, add ingredient-combination analysis, and deliver data visually. Still
zero new dependencies — charts are plain `View` bars, stats are pure functions.

### 3.1 `src/lib/stats.ts` (pure, fully unit-tested)

- `mean`, `sd` (sample), `seMeanDiff` — standard error of a difference in means
  between two independent samples (Welch-style: `sqrt(s1²/n1 + s2²/n2)`).
- `wilsonLowerBound(successes, n, z = 1.96): number` — 95% lower bound for a
  proportion.
- `confidenceTier({n, effect, se}): 'low' | 'medium' | 'high'` — `high`
  requires n ≥ 10 AND |effect| ≥ 2·se; `medium` n ≥ 5 AND |effect| ≥ 1.5·se;
  else `low`. Export the thresholds as named constants.

### 3.2 Rework the analyzers in `src/features/analysis/insights.ts`

Keep every function pure and keep existing exported names where possible;
extend the finding shapes (update tests accordingly):

- **Ingredient & food findings become baseline-relative.** For each tag (or
  food name) with ≥ `MIN_TAG_OCCURRENCES` rated meals: compare its mean
  sentiment against the mean of all OTHER rated food entries (the user's own
  baseline). Surface when `delta ≤ -0.7` (new constant `DELTA_MARGIN`).
  Findings gain: `baselineAvg`, `delta`, `confidence` (via `confidenceTier`
  with the Welch SE), and `sentimentCounts: [n1,n2,n3,n4,n5]` (the tag's
  5-bucket histogram, for the chart). This fixes both failure modes of the
  current absolute `≤ 2.5` cutoff: the all-low rater (everything flagged) and
  the high-baseline rater whose real trigger sits at 2.6 (nothing flagged).
- **Temporal findings get Wilson gating.** Compute
  `wilsonLowerBound(hits, meals)`; `confidence` = `high` if the lower bound
  clears `baseRate`; `medium` if raw `hitRate ≥ baseRate + 0.15` with
  meals ≥ 5; else `low`. Surface medium+high; include low only when nothing
  better exists (cap 3, labeled clearly). Sort by `hitRate - baseRate` — note
  the current comparator's baseRate terms cancel; simplify it.
- **Nutrient analysis gets stricter:** `MIN_NUTRIENT_SAMPLES` 4 → 8 (≥4 per
  side of the median split) plus `confidenceTier` labeling; suppress sub-medium
  findings entirely (7 nutrients are tested simultaneously — comment this).
- **New: `analyzeTagPairs(entries): PairFinding[]`.** Consider only the 15 most
  frequent tags (bounds the pair space). For each unordered pair co-occurring
  in ≥ 3 rated meals: pair-meal mean vs baseline-without-pair, and require the
  pair delta to be at least `0.4` worse than BOTH single-tag deltas (an
  interaction, not just two bad ingredients sharing meals). Cap output at 5,
  each with `confidence`. This is the owner's "combination of ingredients" ask.
- **New: `weeklySentiment(entries, weeks = 8)`** in `src/lib/chartData.ts` —
  rolling 7-day buckets anchored on the current day (document the anchoring)
  with `{label, avg, count}` for the trend chart; buckets with no rated entries
  yield `avg: null`. Pure + tested (pass `now` in as a parameter — no
  `Date.now()` inside the pure fn).

### 3.3 Chart components (zero-dep, plain Views)

`src/components/charts/`: `MiniHistogram.tsx`, `BarMeter.tsx`, `TrendBars.tsx`.

- `MiniHistogram` — five thin vertical bars from `sentimentCounts`, colored by
  scale position via theme tokens (low → `danger`-ish, high → `primary`);
  rendered inside finding cards.
- `BarMeter` — horizontal bar pair for temporal findings: tag hit-rate vs base
  rate, labeled with percentages.
- `TrendBars` — 8 weekly bars of avg sentiment (height ∝ avg on the 1–5
  scale), null weeks rendered as empty slots; shown in a new "Trend" section
  at the top of the Insights tab.
- All charts take precomputed data (no logic inside), carry
  `accessibilityLabel`s summarizing the data in words (e.g. "Week of Jun 22:
  average sentiment 3.4 from 6 rated entries"), and get RNTL smoke tests.

### 3.4 Insights screen

Rework `src/app/(tabs)/insights.tsx`:

- Keep the disclaimer + summary header.
- Section order: **Trend** (TrendBars) → **Ingredients you react to** (cards
  show a delta sentence — "averages 2.1 vs your usual 3.6" — confidence chip,
  MiniHistogram) → **Combinations** (pair cards, same treatment) → **Foods you
  rate poorly** (delta-based) → **Timing patterns** (BarMeter +
  Wilson-informed confidence chip) → **Nutrients** (medium+ findings only).
- Confidence chip: small pill "Low/Medium/High confidence · n meals" using
  theme tokens (never hardcoded colors). Keep ALL user-visible dynamic text as
  single interpolated template literals in one `<ThemedText>` — mixed JSX
  children broke Maestro accessibility before (RESULTS.md session-4-D).
- Sentence helpers stay pure — unit-test the wording that encodes numbers.

Update `flows/03-insights.yaml` / `d-ingredient-insights.yaml` /
`e-temporal-insights.yaml` labels if section headings or summary strings change
(authored-only ⏳ — prefer NOT changing strings those flows assert unless the
redesign requires it; list any you change in the summary).

Suggested commits: `feat(lib): stats helpers (wilson, welch se, confidence
tiers)` · `feat(insights): baseline-relative findings with confidence labels` ·
`feat(insights): ingredient pair (combination) analysis` · `feat(insights):
zero-dep trend/histogram/rate charts` · `feat(insights): insights tab v2 layout`.

---

## After all phases (execute-session closeout)

1. Full rungs green + `npm run bundle:check` (Phase 2's migration makes this
   mandatory, not optional).
2. Summarize per TEST_STRATEGY: what shipped, known limitations (component
   editing v1, camera flows stay manual, owner-on-device items: iOS icon, iOS
   picker feel, light-mode look), and which flows were YAML-edited (⏳
   authored — a device test-execute session must follow, and the theme change
   means it should run the FULL suite).
3. Do not touch `docs/RESULTS.md` (test-execute owns it) or tick ACCEPTANCE
   boxes.
