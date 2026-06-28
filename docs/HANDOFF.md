# HANDOFF.md — for the next session

Read this first, then `CLAUDE.md` (the constitution) and `PROGRESS.md` (the ranked
roadmap). This doc gets you productive fast and specs the next two tasks.

---

## TL;DR

TummyTracker is a **local-first food-sensitivity journal** (Expo SDK 56 / RN 0.85 /
React 19 / TS 6 / npm, Node 25). MVP (Phases 0–3) and the full **flagship trio** are
**shipped and running on a Pixel 5** via an EAS `preview` APK.

- 127 tests · all rungs + `bundle:check` green · `main` is clean.
- UAT signed off 2026-06-28 with three known UX issues logged in `docs/ACCEPTANCE.md`.

**Next up (two tasks in order):**
1. **UX polish sprint** — fix the three UAT backlog items before adding any new feature.
2. **Tier-0 dependency sprint** — native date picker · serving-size scaling · recent/favorites · backup/export.

---

## How to work (the loop is the whole point)

- **Definition of done:** `npm run typecheck` · `npm run lint` · `npm test` all green.
- **Before any EAS build:** `npm run bundle:check` (runs `expo export` — the rungs never
  run Metro, so bundler/transform bugs hide from tsc/jest; this is the real gate).
- **Get it on device:** `eas build --profile preview --platform android` → download APK →
  `adb install -r app.apk` over USB. (Corporate Wi-Fi blocks Metro; USB sidesteps it.)
- One logical change per commit; scoped imperative messages; end with
  `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- Model routing: Opus to plan/review, Sonnet to build, Haiku for mechanical edits.

---

## Architecture (where things live)

- **Pure logic carries the tests.** `src/lib/*`, `features/**/formModel.ts`,
  `features/analysis/insights.ts`, `features/analysis/temporal.ts` are React-free and
  fixture-tested — that's the verification leverage. UI components stay thin.
- **Data:** `src/db/schema.ts` is the source of truth → `npm run db:generate` emits a
  migration into `src/db/migrations/` → applied at runtime by `src/db/migrate.ts`.
  All DB access goes through `src/db/repository.ts`. Current schema has 5 migrations
  (0000–0004); any future schema change gets migration 0005+.
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
- **OFF nutriments are per-100g** — numbers land near the label but not exact (serving-
  size scaling, Tier 0, will fix this).
- **Dark mode / theming:** preserve contrast via the `border` and `backgroundSelected`
  tokens. Selected states must be obviously distinct. Don't let a caller `style` override
  themed colors. Three UAT theming issues are now in the backlog.
- **EAS/login behind a corporate proxy:** `NODE_EXTRA_CA_CERTS` for Node (login/build
  CLI), import the corp CA into the JDK `cacerts` for local Gradle. `adb install` over
  USB avoids the network entirely.

---

## NEXT TASK 1 — UX polish sprint

Three issues found in UAT 2026-06-28. Fix all three in a single commit:
`fix(ux): entry name overflow, scan button visibility, theming polish`

### UX-1 · Long entry names in EntryRow

**File:** `src/features/logging/EntryRow.tsx`

`entry.name` is rendered with `numberOfLines={1}` already — but the subtitle line
(`subtitle(entry)`) has no line clamp, and on some entries it wraps. Also audit that
the name and subtitle use `ellipsizeMode="tail"`.

Fix:
- Add `numberOfLines={1}` and `ellipsizeMode="tail"` to the subtitle `<ThemedText>`.
- Verify the outer row flex layout can't force the body to overflow its `flex: 1` bounds.

### UX-2 · Theming inconsistencies

**Files:** `src/app/scan.tsx` (or wherever the scan screen renders its UI) and any
component where dark-mode selected / unselected contrast is insufficient.

Audit approach:
1. Read `src/app/scan.tsx` — are the overlay controls using `theme.text` /
   `theme.backgroundElement` or hardcoded colors?
2. Read `src/components/segmented-control.tsx` — does the unselected label use
   `theme.textSecondary` or a hardcoded color?
3. Swap to dark mode on the device and screenshot — use that to prioritise.

Fix whatever is hardcoded to use the appropriate theme token.

### UX-3 · Invisible scan button on camera viewfinder

**File:** `src/app/scan.tsx`

The shutter/confirm/action button for the barcode scanner sits on top of the live
camera preview and becomes invisible (dark button on dark scene, or vice versa).

Fix:
- Give the button a high-contrast background: white circle with a light shadow, or a
  border-radius pill using `Colors.light.background` / `'rgba(255,255,255,0.9)'`.
- Add `shadowColor`, `shadowOpacity`, `elevation` so it lifts off the viewfinder.
- No accessibility label change needed (it already has one), but confirm it.

**Verification:** `npm run typecheck && lint && test` (no schema change → no
`bundle:check` required). Then on-device, point the camera at a dark shelf and confirm
the button is visible.

---

## NEXT TASK 2 — Tier-0 dependency sprint

Do these after UX-1/2/3 are committed. Each subtask below is one commit.

> Before adding any `⚠ new dependency`, confirm the package with the owner (check
> `CLAUDE.md §9`). The two items marked ⚠ below are pre-approved in principle but
> need a `npm install` + `eas.json` note.

### 2a · Serving-size scaling  *(no new dependency)*

OFF returns nutrients per 100g. Let the user enter a serving size (g/ml) and scale
all nutrition values accordingly before they land in the form.

Touch points:
- `src/lib/openFoodFacts.ts` — `offProductToFormState` could accept a `servingG`
  parameter (default 100). `mapOffResponse` already has `serving_quantity` on the OFF
  product — read it as the default serving size.
- `src/features/barcode/` — after a successful lookup, show a "Serving size (g)"
  editable field before confirming; the confirmed serving size scales the nutrition.
- `src/lib/nutrition.ts` — pure `scaleNutrition(nutrition, servingG, per100g)` helper.
- Tests: unit-test `scaleNutrition` with known values.

Commit: `feat(barcode): serving-size scaling for OFF nutrition`

### 2b · Native date/time picker  *(⚠ `@react-native-community/datetimepicker`)*

Replace the manual `YYYY-MM-DD` / `HH:MM` text inputs in `LogEntryForm`, `BmForm`,
and `SymptomForm` with the native picker. The `formatDateInput` / `formatTimeInput`
helpers in `src/lib/datetime.ts` stay — they back the display string.

Touch points:
- All three `*Form.tsx` files: replace the date/time `ThemedTextInput` + Now button
  with a `<DateTimePicker>` (or a Pressable that opens one as a modal).
- `src/lib/datetime.ts` — `parseDateTime` can be simplified since the native picker
  always returns a valid `Date`; keep it for the edit/backfill path (manual override).
- Update all form tests — the UI interaction changes, but `buildLogEntry` /
  `buildBmEntry` / `buildSymptomEntry` logic is unchanged and tests there stay green.

Commit: `feat(ux): native date/time picker in all log forms`

### 2c · Recent / Favorites quick-add  *(no new dependency)*

One-tap re-log of a previously logged food entry. This is the #1 adherence driver —
people eat the same things every day.

Approach:
- `src/db/repository.ts` — `listRecentFoodNames(limit = 10)`: `SELECT DISTINCT name,
  MAX(logged_at)` from food-type entries, order by `MAX(logged_at) DESC`.
- Home screen (`src/app/(tabs)/index.tsx`) — a "Recent" section below the CTAs,
  rendered as a horizontal scroll of name chips. Tapping one opens `/entry/new` with
  that name pre-filled (pass via query param or zustand).
- The `LogEntryForm` already accepts `initial?: Partial<LogEntryFormState>`; just
  pass `{ name: recentName }`.
- Tests: unit-test the repository query with an in-memory Drizzle instance or a
  fixture; keep component tests thin.

Commit: `feat(logging): recent foods quick-add on home screen`

### 2d · Backup / export + import  *(⚠ `expo-file-system` + `expo-sharing`)*

Local-first = no cloud. Before asking users to log for months, protect their data.

Approach:
- **Export:** `src/lib/backup.ts` (pure) — `entriesToJson(entries)` / `entriesToCsv(entries)`.
  A "Export data" button in Settings calls `listLogEntries()` → serialize → write to a
  temp file with `expo-file-system` → share with `expo-sharing`.
- **Import:** parse JSON (CSV is optional v1), validate each row's shape (reuse
  `LogEntry` type), call `createLogEntry` for each row not already present (match on
  `id`). Show a count summary: "Imported 42 entries (3 already existed)".
- **Tests:** unit-test the serialization/parse roundtrip with a fixture. Device acceptance:
  export → share to Files app → import from Files app → counts match.

Commit: `feat(data): JSON backup export and import in Settings`

---

## Pointers

- `CLAUDE.md` — constitution (conventions, stack, §0 deviations log).
- `PROGRESS.md` — ranked roadmap + resolved decisions.
- `docs/BUILD_PLAN.md` — original phased spec.
- `docs/ACCEPTANCE.md` — on-device checklist (flagship trio accepted 2026-06-28,
  three UX issues noted).
