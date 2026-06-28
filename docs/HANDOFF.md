# HANDOFF.md — for the next session

Read this first, then `CLAUDE.md` (the constitution) and `PROGRESS.md` (the ranked
roadmap). This doc gets you productive fast and specs the next task.

## TL;DR

TummyTracker is a **local-first food-sensitivity journal** (Expo SDK 56 / RN 0.85 /
React 19 / TS 6 / npm, Node 25). MVP (Phases 0–3) is **shipped and running on a Pixel 5**
via an EAS `preview` APK. 77 tests; all rungs + `bundle:check` green; `main` is clean.
Next up: **add saturated fat** (warm-up, fully specced below), then the flagship trio
**ingredient capture → ingredient/sentiment correlation → symptom logging → temporal
correlation**.

## How to work (the loop is the whole point)

- **Definition of done:** `npm run typecheck` · `npm run lint` · `npm test` all green.
- **Before any EAS build:** `npm run bundle:check` (runs `expo export` — the rungs never
  run Metro, so bundler/transform bugs hide from tsc/jest; this is the real gate).
- **Get it on device:** `eas build --profile preview --platform android` → download the
  APK → `adb install -r app.apk` over USB. (Corporate Wi-Fi blocks Metro; USB sidesteps
  it. See `docs/ACCEPTANCE.md` for the proxy/cert notes.)
- One logical change per commit; scoped imperative messages; end with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Model routing: Opus to plan/review, Sonnet to build, Haiku for mechanical edits.

## Architecture (where things live)

- **Pure logic carries the tests.** `src/lib/*`, the `features/**/formModel.ts`,
  `features/analysis/insights.ts` are React-free and fixture-tested — that's the
  verification leverage. UI components stay thin and bind to these.
- **Data:** `src/db/schema.ts` is the source of truth → `npm run db:generate` emits a
  migration into `src/db/migrations` (+ the Expo `migrations.js` bundle) → applied at
  runtime by `src/db/migrate.ts` (`useMigrations`, gated in `app-providers.tsx`).
  All DB access goes through `src/db/repository.ts`.
- **Navigation:** root `Stack` in `src/app/_layout.tsx`; a `(tabs)` group (Home =
  `index`, Journal = `explore`); modal/stack routes `entry/new`, `entry/[id]`, `bm/new`,
  `scan`, `settings`, `insights`.
- **Theme:** `src/constants/theme.ts` (`Colors.light/dark`, incl. a `border` token);
  `useTheme()`; `ThemedText` / `ThemedView` / `components/form-fields` /
  `components/segmented-control`.
- **Single-source enums:** sentiment (`features/sentiment/scale.ts`), Bristol
  (`features/bm/bristol.ts`). Add symptom types the same way.

## Gotchas (learned the hard way — don't relearn them)

- **RNTL v14 is async:** `await render(...)` and `await fireEvent.*(...)`, destructure
  queries from the awaited result; the global `screen` is unreliable under jest-expo.
  CSS imports are stubbed via `jest/style-mock.js`.
- **Drizzle `.sql` migrations** require `babel-plugin-inline-import` (`babel.config.js`)
  to inline as strings. `bundle:check` catches regressions tsc/jest can't.
- **Migrations are additive only** (ALTER ADD COLUMN; never drop/rebuild). The test in
  `src/db/__tests__/migrations.test.ts` enforces data preservation.
- **OFF nutriments are per-100g** — numbers land near the label but not exact (serving-
  size scaling, Tier 0, will fix).
- **Dark mode:** preserve contrast via the `border` token; selected states must be
  obviously distinct (we invert SegmentedControl chips). Don't let a caller `style`
  override themed colors (the bug that hid the date inputs).
- **EAS/login behind a corporate proxy:** `NODE_EXTRA_CA_CERTS` for Node (login/build
  CLI), import the corp CA into the JDK `cacerts` for local Gradle. `adb install` over
  USB avoids the network entirely.

## Recommended sequence

1. **Tier 0** quick wins (saturated fat → date picker → serving size → recent/favorites →
   backup). Cheap, and they make the app pleasant enough to generate real data.
2. **The product trio:** ingredient capture → ingredient/sentiment correlation → symptom
   logging → temporal correlation.
3. **Tier 2** payoff (charts, drill-down, confidence, PDF).

---

## NEXT TASK (fully specced): capture saturated fat

The ideal warm-up — it exercises the whole migration → lib → form → OFF → tests → bundle
loop. Touch points:

1. `src/db/schema.ts`: add `saturatedFatG: real('saturated_fat_g')` (after `fatG`).
2. `npm run db:generate` → new migration `0002_*` (an additive `ALTER TABLE ... ADD`).
   Confirm it's additive.
3. `src/lib/validation.ts`: add `'saturatedFatG'` to `NUTRITION_FIELDS` (after `fatG`).
4. `src/lib/nutrition.ts`: `NUTRITION_LABELS.saturatedFatG = 'Sat. fat (g)'`,
   `NUTRITION_NOUNS.saturatedFatG = 'saturated fat'`.
5. `src/lib/openFoodFacts.ts`: extend `OffNutrition` + `EMPTY_NUTRITION` + `mapOffResponse`
   to read `nutriments['saturated-fat_100g']` (round 1). (`nutritionToInputs` iterates
   `NUTRITION_FIELDS`, so it picks it up automatically.)
6. `src/features/logging/formModel.ts`: `BuiltLogEntry` and the object built in
   `buildLogEntry` **explicitly enumerate** nutrition keys — add `saturatedFatG` to both.
   (`logEntryToFormState` iterates `NUTRITION_FIELDS`, so it's automatic.)
7. Tests: extend `validation.test`, `formModel.test`, `openFoodFacts.test`. Add
   `"saturated-fat_100g": 10.6` to the `off-found.json` fixture and assert it maps.
8. `npm run typecheck && lint && test && bundle:check` → commit `feat(data): capture saturated fat`.

## Flagship design notes

**Ingredient capture + correlation**
- Schema (additive): `ingredientsText text` (raw OFF `ingredients_text`) and `tagsJson
  text` (JSON array of normalized tags = `allergens_tags` + `additives_tags` + tokenized
  ingredient words).
- OFF mapper: extract those fields → tags (pure, fixture-tested). Manual entry gets an
  optional free-text "ingredients" field, tokenized on save.
- Analysis: `analyzeIngredientSentiment(entries)` — mirror `analyzeFoodSentiment` but per
  tag; gate on min occurrences; surface low-average-sentiment tags with sample size +
  confidence label. New "Ingredients" section on the Insights screen.

**Symptoms (new loggable type)**
- Schema (additive): add `'symptom'` to `LOG_ENTRY_TYPES`; add `symptomType text` and
  `severity integer` (1 = mild … 5 = severe — *not* the inverse sentiment scale). Single-
  source `SYMPTOM_TYPES` list in `features/symptoms/`.
- Add `symptom/new` quick-add route + `SymptomForm` + edit-screen branch (mirror BMs).
  Extend `EntryRow` rendering and the Journal type filter.

**Temporal correlation (after the above exist)**
- Pure: for each ingredient/tag, association = outcomes within a window after meals
  containing it vs base rate; outcomes = rough BMs (Bristol 1/2/6/7) + symptoms
  (severity ≥ 3) + low meal sentiment. Gate on counts; fixtures with known timelines.

## Pointers

- `CLAUDE.md` — constitution (conventions, stack, §0 deviations log).
- `PROGRESS.md` — ranked roadmap + resolved decisions.
- `docs/BUILD_PLAN.md` — original phased spec.
- `docs/ACCEPTANCE.md` — on-device checklist + build/proxy notes.
