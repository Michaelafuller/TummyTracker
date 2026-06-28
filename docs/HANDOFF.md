# HANDOFF.md — for the next session

Read this first, then `CLAUDE.md` (the constitution) and `PROGRESS.md` (the ranked
roadmap). This doc gets you productive fast and specs the next task.

---

## TL;DR

TummyTracker is a **local-first food-sensitivity journal** (Expo SDK 56 / RN 0.85 /
React 19 / TS 6 / npm, Node 25). MVP (Phases 0–3) and the full **flagship trio** are
**shipped and running on a Pixel 5** via an EAS `preview` APK.

- **151 tests** · all rungs + `bundle:check` green · `main` is clean.
- **Tier-0 sprint complete (2026-06-28):** UX polish + serving-size scaling + native
  date/time picker + recent-foods quick-add + backup/export-import all committed.

**Next up:** `PROGRESS.md` Tier-1 — **Trigger watchlist / elimination mode** is the
highest-value remaining item. See NEXT TASK below.

---

## How to work (the loop is the whole point)

- **Definition of done:** `npm run typecheck` · `npm run lint` · `npm test` all green.
- **Before any EAS build:** `npm run bundle:check` (runs `expo export` — the rungs never
  run Metro, so bundler/transform bugs hide from tsc/jest; this is the real gate).
- **Get it on device:** `eas build --profile preview --platform android` → download APK →
  `adb install -r app.apk` over USB. (Corporate Wi-Fi blocks Metro; USB sidesteps it.)
- One logical change per commit; scoped imperative messages; end with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Model routing: Opus to plan/review, Sonnet to build, Haiku for mechanical edits.

---

## Architecture (where things live)

- **Pure logic carries the tests.** `src/lib/*`, `features/**/formModel.ts`,
  `features/analysis/insights.ts`, `features/analysis/temporal.ts` are React-free and
  fixture-tested — that's the verification leverage. UI components stay thin.
- **Data:** `src/db/schema.ts` is the source of truth → `npm run db:generate` emits a
  migration into `src/db/migrations/` → applied at runtime by `src/db/migrate.ts`.
  All DB access goes through `src/db/repository.ts`. Current schema has **6 migrations
  (0000–0005)**; any future schema change gets migration 0006+.
  - 0005 added `serving_g` (real, nullable) to `log_entry`.
- **Navigation:** root `Stack` in `src/app/_layout.tsx`; `(tabs)` group (Home = `index`,
  Journal = `explore`); modal routes `entry/new`, `entry/[id]`, `bm/new`, `symptom/new`,
  `scan`, `settings`, `insights`. All typed routes registered in `.expo/types/router.d.ts`
  — update it when adding a new screen.
- **Theme:** `src/constants/theme.ts` (`Colors.light/dark`, incl. `backgroundSelected`,
  `border`); `useTheme()`; `ThemedText` / `ThemedView` / `components/form-fields` /
  `components/segmented-control`.
- **Single-source enums:** sentiment (`features/sentiment/scale.ts`), Bristol
  (`features/bm/bristol.ts`), symptom types (`features/symptoms/symptomTypes.ts`),
  severity (`features/symptoms/severity.ts`). All follow the same pattern: values tuple →
  union type → options array → `BY_VALUE` map → type guard → label accessor.
- **Entry types:** `LOG_ENTRY_TYPES = ['meal','snack','bowel_movement','symptom']`.
  `FOOD_TYPES = ['meal','snack']` — use this allowlist everywhere `isFood` logic is needed;
  never use `type !== 'bowel_movement'` (breaks when new types are added).
- **Insights pipeline:** `features/analysis/insights.ts` → `analyzeNutrientSentiment`,
  `analyzeFoodSentiment`, `analyzeIngredientSentiment`, and `analyzeTemporalTriggers`
  (from `features/analysis/temporal.ts`) are all bundled by `computeInsights`.
- **Serving size:** `src/lib/nutrition.ts` has `scaleNutrition(per100g, servingG)`. The
  `LogEntryForm` stores `nutritionBase` (per-100g base from OFF) in form state and
  rescales on serving-size edits. `servingG` is persisted in `log_entry`.
- **Recent quick-add:** `src/db/repository.ts` → `listRecentFoodEntries(limit)` —
  returns most-recent distinct-by-name food entries; called from home screen on focus.
- **Backup:** `src/lib/backup.ts` — `entriesToJson` / `parseBackupJson` (pure, unit-tested).
  Settings screen uses `expo-file-system` new SDK 56 API (`File`/`Paths`) + `expo-sharing`.
- **Date/time picker:** shared `src/components/date-time-field.tsx` wraps
  `@react-native-community/datetimepicker`; wired into `LogEntryForm`, `BmForm`,
  `SymptomForm`.

---

## Gotchas (learned the hard way — don't relearn them)

- **RNTL v14 is async:** `await render(...)` and `await fireEvent.*(...)`, destructure
  queries from the awaited result; the global `screen` is unreliable under jest-expo.
  CSS imports are stubbed via `jest/style-mock.js`.
- **Drizzle `.sql` migrations** require `babel-plugin-inline-import` (`babel.config.js`)
  to inline as strings. `bundle:check` catches regressions tsc/jest can't.
- **Migrations are additive only** (ALTER ADD COLUMN; never drop/rebuild). The test in
  `src/db/__tests__/migrations.test.ts` enforces data preservation.
- **Expo typed routes:** when adding a new screen file, update `.expo/types/router.d.ts`
  with the new pathname in all three union members (`hrefInputParams`, `hrefOutputParams`,
  `href`). Otherwise `tsc` rejects `<Link href="/new-route">`.
- **`expo-file-system` SDK 56 uses a new API:** the legacy `FileSystem.cacheDirectory`,
  `FileSystem.writeAsStringAsync`, `FileSystem.readAsStringAsync` are NOT on the default
  import. Use `import { File, Paths } from 'expo-file-system'` → `new File(Paths.cache,
  'name.json')` → `file.write(text)` / `await file.text()` / `file.uri`. File picking is
  `await File.pickFileAsync({ mimeTypes: ['application/json'] })` — no need for
  `expo-document-picker`.
- **`useColorScheme()` returns `null`** on initial render (not `'unspecified'`). The
  `useTheme()` hook in `src/hooks/use-theme.ts` handles this: `scheme === 'dark' ? 'dark' : 'light'`.
  Never pass the raw `scheme` as a `Colors` key or it will be `undefined`.
- **Dark mode / theming:** preserve contrast via the `border` and `backgroundSelected`
  tokens. Selected states must be obviously distinct. Don't let a caller `style` override
  themed colors.
- **OFF nutriments are per-100g** — the `serving_g` column + `scaleNutrition` handle this
  now. `offProductToFormState` reads `serving_quantity` from the OFF product as the default.
- **EAS/login behind a corporate proxy:** `NODE_EXTRA_CA_CERTS` for Node (login/build
  CLI), import the corp CA into the JDK `cacerts` for local Gradle. `adb install` over
  USB avoids the network entirely.

---

## NEXT TASK — Tier-1: Trigger watchlist / elimination mode

This is the highest-value remaining item (see `PROGRESS.md` Tier-1). It directly enables
the therapeutic use case: mark a suspected ingredient, track whether entries containing it
correlate with worse outcomes.

### Goal

Let the user flag ingredients/foods they suspect are triggers. The app then:
1. **Flags entries** in the journal that contain a watchlisted ingredient (visual indicator on `EntryRow`).
2. **Reports in Insights** how watchlisted-ingredient entries compare to baseline (avg sentiment,
   outcome rate from `analyzeTemporalTriggers`).

### Approach (two phases, each its own commit)

**Phase A — Watchlist data layer** `feat(watchlist): ingredient watchlist data model`
- New table `watchlist_item` in `src/db/schema.ts`:
  - `id` (uuid, pk)
  - `term` (text, not null) — normalised ingredient term (lowercase, trimmed)
  - `createdAt` (integer, ms epoch)
- Migration 0006: `CREATE TABLE watchlist_item (...)`.
- Repository functions in `src/db/repository.ts`: `listWatchlistItems()`, `addWatchlistItem(term)`,
  `removeWatchlistItem(id)`.
- Pure helper in `src/lib/watchlist.ts`: `entryMatchesWatchlist(entry, watchlistTerms: string[]): boolean`
  — checks whether any term appears in `entry.tagsJson` (parsed) or `entry.ingredientsText`
  (split by comma/space). Unit-test with fixture entries.

**Phase B — UI wiring** `feat(watchlist): watchlist UI in Insights and EntryRow`
- **Insights screen** (`src/app/insights.tsx`): add a "Watchlist" section above/alongside
  existing insight cards. For each watchlisted term, show: entry count, avg sentiment vs baseline,
  outcome rate if available. Reuse `analyzeTemporalTriggers` filtered to watchlisted entries.
- **Add/remove watchlist terms**: a simple text-input + "Add" button in Settings (or a new
  `/watchlist` screen — prefer Settings first, simpler navigation).
- **EntryRow** (`src/features/logging/EntryRow.tsx`): show a small indicator (e.g. `⚠` or a
  colored dot) when `entryMatchesWatchlist` returns true. Keep it subtle — this is a flag, not
  an alarm.
- Tests: `entryMatchesWatchlist` unit tests (already done in Phase A); update Insights screen
  test for the new section; keep EntryRow test thin.

### Definition of done

`npm run typecheck && npm run lint && npm test` green after each commit. Migration 0006 is
registered in `migrations.js` and the migrations test stays green. Run `bundle:check` after
Phase A (schema change).

---

## Pointers

- `CLAUDE.md` — constitution (conventions, stack, §0 deviations log).
- `PROGRESS.md` — ranked roadmap + resolved decisions.
- `docs/BUILD_PLAN.md` — original phased spec.
- `docs/ACCEPTANCE.md` — on-device checklist (flagship trio accepted 2026-06-28,
  UX polish + Tier-0 sprint accepted 2026-06-28).
