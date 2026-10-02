# CLAUDE.md — Project Constitution

> This file is read by Claude Code at the start of every session. It is the
> single source of truth for how this project is built, verified, and driven.
> Keep it current. If a convention here is wrong, fix it here first, then code.
>
> The original spec lives in `docs/` (`docs/CLAUDE.md`, `docs/BUILD_PLAN.md`,
> `docs/CLAUDE_CODE_WORKFLOW.md`). This root copy is the live, authoritative
> version and may diverge from `docs/CLAUDE.md` where reality required it — see
> §0 below for the running list of deviations.
>
> **Continuing the project?** Read only your session's *input contract*, not every
> doc — an **execute** session opens with `docs/HANDOFF.md`; a **plan** session
> opens with `PROGRESS.md` + `docs/RESULTS.md`. Each points onward to what it
> needs. The full per-session table and the cycle it serves are in
> `docs/TEST_STRATEGY.md` (§3 "Starting a session"). This file (`CLAUDE.md`) is
> auto-loaded every session — you never need to read it explicitly.

---

## 0. Build decisions & deviations from the original spec

- **Package manager: npm.** Keeps the §4 commands honest and is the best-supported
  Expo path.
- **Source layout: `src/`.** Expo SDK 56's default template nests routes under
  `src/app` with the `@/*` → `./src/*` path alias. We kept it and put `db/`,
  `features/`, `lib/`, `components/` under `src/` too. §5 reflects this.
- **Toolchain (pinned by `create-expo-app@latest`):** Expo SDK 56, React Native
  0.85, React 19.2, TypeScript 6, Jest via `jest-expo`. Node 25 (non-LTS) is in use
  and works.
- **EAS is config-only here.** `eas.json` + app identifiers are committed so the
  owner can `eas build` themselves. The agent never invokes EAS, never assumes a
  device. Device acceptance lives in `docs/ACCEPTANCE.md`.
- **`eas.json` has a strict schema — no unknown keys allowed.** Adding any field
  outside the EAS spec (e.g. a `_comment_deps` annotation) causes `eas build` to
  fail with "is not allowed". Document native deps in `CLAUDE.md §3` and commit
  messages; never in `eas.json`.
- **Component tests are async (RNTL v14).** `render(...)` and `fireEvent.*(...)`
  return promises — `await` them and destructure queries from the awaited result
  (the global `screen` proxy is unreliable under the jest-expo preset). CSS imports
  are stubbed via `jest/style-mock.js`. Pure logic in `lib/` is the primary test
  target; component tests cover interaction wiring.
- **`expo-file-system` SDK 56 uses a new API.** The legacy `FileSystem.cacheDirectory`,
  `writeAsStringAsync`, `readAsStringAsync` are NOT on the default import. Use
  `import { File, Paths } from 'expo-file-system'` → `new File(Paths.cache, 'name.json')`
  → `file.write(text)` / `await file.text()` / `file.uri`. File picking:
  `File.pickFileAsync({ mimeTypes: ['…'] })` — no `expo-document-picker` needed.
- **Device install strategy (owner-decided 2026-08-15).** When a cycle is pure
  JS/TS (no new dependency, no native/config/icon change), no build at all:
  `adb reverse tcp:8081 tcp:8081` + `npx expo start` into the installed dev
  client. When an .apk is needed: cloud `eas build --profile preview --platform
  android`, delivered over USB with `eas build:run --platform android --latest`
  (or `adb install -r`) instead of the QR download. Note `eas build --local`
  (zero quota) is **macOS/Linux-only** — on this Windows machine it requires
  WSL2; set that up only if build cadence ever makes quota feel tight. Reserve
  cloud builds for real .apk needs, distribution rehearsals, and the iOS pass. **Signing caveat:** Android
  refuses in-place updates on a signature mismatch, and the forced uninstall
  wipes the on-device journal (local-first SQLite) — never install a debug- or
  unknown-signed .apk over the real install; export an in-app backup first when
  in doubt. `bundle:check` still gates every EAS build, local or cloud.
- **The three rungs don't bundle the app — run `npm run bundle:check` before an EAS
  build.** `tsc`/`lint`/`jest` never run Metro, so bundler/transform config bugs
  slip past them (e.g. Drizzle's `.sql` imports needed `babel-plugin-inline-import`
  in `babel.config.js` to be inlined as strings; without it the production bundle
  failed parsing SQL as JS). `bundle:check` runs `expo export` — the same step EAS
  does — and is the real gate before any cloud build.
- **Dev/prod app-identity split (2026-08-21).** All three EAS profiles used to
  build the same Android package, so the dev client and any preview/production
  install displaced each other on-device and Maestro's `clearState` could wipe
  the owner's real journal. Dev builds now get their own identity —
  `TummyTracker (dev)` / `com.tummytracker.app.dev` / `tummytracker-dev` — via
  `APP_VARIANT=development` set on the `eas.json` `development` profile's `env`;
  config now lives in `app.config.ts` (deleted `app.json`). **The
  `resolveAppIdentity` resolver is INLINED directly in `app.config.ts`, not
  imported from `src/lib/`** — `@expo/config` only runs the entry config file
  itself through TypeScript transpilation; a nested same-repo `.ts` import
  falls through to Node's plain CJS resolver afterward, which only resolves
  `.ts` on Node >= 23.6 (native type-stripping) and throws a bare
  `SyntaxError: Unexpected token 'export'` on older Node — a real risk since
  EAS cloud build workers may run an older/LTS Node than this dev machine's
  Node 25. Keeping `app.config.ts` free of any runtime import (only a
  type-only `import type { ExpoConfig } from 'expo/config'`, erased before
  execution) sidesteps this entirely. The resolver is still unit-tested, now
  at `__tests__/app.config.test.ts` (repo root, importing the named
  `resolveAppIdentity` export and driving the default export end-to-end).
- **`react-native-keyboard-controller` seam is a SYNC TurboModule probe, not
  haptics' async dynamic import (2026-08-28).** `src/lib/keyboard.ts` calls
  `TurboModuleRegistry.get('KeyboardController')` directly at import time and
  returns null on the current (pre-cycle) dev client — no `await import(...)`,
  because `KeyboardProvider` has to wrap the app tree synchronously at mount
  (a provider can't render behind a resolved promise without an extra loading
  frame), whereas the haptics/print seam only needs a value inside an async
  event handler and can afford `await import(...)`. Same discipline (never
  call into a native module the installed client doesn't have; fall back
  cleanly), different mechanism because of *where* in the render lifecycle the
  value is needed. `FormScrollView`/`KeyboardShiftView`
  (`src/components/keyboard-aware-screen.tsx`) consume the seam and fall back
  to today's plain `ScrollView`/`KeyboardAvoidingView` behavior when the probe
  returns null.
- **Per-meal sentiment removed, outcome-based correlation adopted
  (owner-directed 2026-08-28).** Rating a bowel movement or symptom is a real,
  dated event; rating a *meal* asked the user to self-diagnose causation at
  write time, which both biased and duplicated what the correlation engine
  exists to compute. `isOutcome` v2 (bad BM Bristol 1/2/6/7, OR BM feel ≤2, OR
  symptom severity ≥3) replaced the old food-sentiment arm entirely — food
  entries are never outcomes. The `sentiment` DB column is RETAINED (additive-
  migrations rule, §9): history and old backups import unchanged, and it still
  stores the BM feel-afterward rating. See §1, §6, §7.
- **Day check-in is coverage, not an outcome (owner-decided 2026-09-27,
  GitHub #13).** A one-tap "fine day / rough day" answer per local day
  (`day_check_in`, §6). It feeds only the Insights "days covered" line; the
  correlation engine and `isOutcome` do not read it, and Rough only prompts
  "add a symptom". It has its own opt-in notification (Settings, separate
  from the Goals check-in, which only fires for unmet floor goals). The
  Fine/Rough buttons use `opensAppToForeground: true` because there is no
  background task runner (`expo-task-manager` is not approved) — our JS only
  runs once the app opens. An answer is always recorded for the day the
  notification asked about (`content.data.date`), never "now". A notification
  answer shows a 4 s "✓ Rough day recorded" banner on Home (+ success haptic;
  `checkInFeedbackStore`, only after the write succeeded — owner idea
  2026-10-02).
- **Automatic backup = daily-on-open to a user-picked folder (2026-09-27,
  GitHub #14).** No background runner is approved, so on Android the app
  writes one backup per local day when it opens or resumes, into a folder
  chosen with `Directory.pickDirectoryAsync()` (a persisted SAF grant — no
  manifest permission; survives uninstall). Rules: always a **new** timestamped
  file (some SAF providers don't truncate on rewrite); prune only our own
  `tummytracker-auto-*.json` names, newest 7 kept, deleting the **File objects
  `list()` returns** — a SAF child's URI can't be built from folder + name;
  a failure deletes nothing and only records `autoBackupError`. iOS gets the
  nudge + share export only (folder persistence unverified). Backup state
  lives in prefs, not the DB.
- **Repository transactions must be synchronous (2026-09-27, GitHub #18).**
  `drizzle-orm/expo-sqlite`'s `db.transaction()` runs `BEGIN`, calls the
  callback, and `COMMIT`s as soon as it *returns* — it never awaits. An
  `async` callback commits before its awaited queries run, so nothing inside
  was atomic until this fix. Rule: inside `db.transaction((tx) => …)` use only
  the sync builders (`.run()`, `.all()`, `.get()`), never `await`; compute ids
  and timestamps before the transaction. The repository tests
  (`src/db/__tests__/repository.atomicity.test.ts`) fail if this regresses.
- **Elimination experiments (owner-decided 2026-09-27, GitHub #19).** One
  active experiment at a time (enforced in the repository transaction) on an
  ingredient **term** (watchlist matching). Protocol: 14-day baseline read
  from past logs, 7/14/21/28-day avoidance, 3 challenge + 3 observation days.
  All day math by local calendar day. Experiment **rough day** = an
  `isOutcome` entry **or** a "rough" check-in (the correlation engine still
  ignores check-ins). Verdict ladder in `src/features/experiments/engine.ts`
  — inconclusive on too many slips, no challenge exposure, too few covered
  days, **the suspect never eaten in the baseline** (review 2026-09-28), or
  no baseline rough days; "likely not a trigger" is never high confidence.
  Finishing freezes the verdict in `verdictJson`. Copy never diagnoses.
  Cycle B (2026-09-28): phase reminders at 09:00 local on each challenge day,
  the first observation day and the ready day — own slot `experiment-phase`,
  serialized refresh (same pattern as the day check-in), never a record; tap
  opens the experiment. History, the watchlist's "Last experiment" line and
  the PDF read only the frozen verdict. Device verdict path:
  `node scripts/make-experiment-fixture.mjs` → `adb push` → import (flows
  `za-…`, `zb-…`).
- **Medications in the correlation engine (owner-decided 2026-09-28, GitHub
  #20).** A separate day-level module (`src/features/analysis/medications.ts`)
  — the food engine's numbers are untouched. Exposure = each logged dose's
  day + the next day; a built-in antibiotic name list
  (`src/lib/medicationClasses.ts`, heuristic) counts 7 days after each dose.
  Rough day = an `isOutcome` entry only (check-ins count as coverage, never
  roughness — the #13 rule). Only covered days are compared; "taken nearly
  every day" and "too few days" get notes, not findings. Confounders are a
  **caveat only** on food/ingredient/combination cards ("N of the M meals
  followed by a rough outcome were eaten while you were taking X"), shown
  when ≥ 2 and ≥ half of the hit meals fall in one medication's window.
  Insights only (not the PDF or "What came before").
- **Reaction latency + a second window (owner-decided 2026-09-28, GitHub
  #21).** Every existing finding stays at 24 h. Latency ("Usually about 5 h
  later (3–8 h)") = nearest-rank median + 25th–75th percentile of hours from
  each hit meal to its first rough outcome, shown with ≥ 3 hits (Insights
  cards, finding detail, PDF). One extra window only: **"Slower patterns
  (within 48 h)"** lists ingredient/food/combination findings that reach
  medium/high at 48 h and aren't shown at 24 h — never low (trying windows
  per food finds spurious triggers by chance; long windows push the baseline
  toward 100 %). The detail screen's 6/24/48/72 h timing profile is context
  only and never creates findings. Everything else (What came before,
  medication caveats, experiments, watchlist, PDF findings) stays at 24 h.
- **Dose-response (owner-decided 2026-09-30, GitHub #22).** Spike: food,
  ingredient and combination findings were amount-blind (the engine reads only
  entry name + union tags; servings live on `mealComponent`). Amount =
  component `servings` (missing → 1; food = the meal's total, ingredient = the
  servings of components carrying the tag). Each food/ingredient finding's
  meals split at the median amount, snapped to an amount actually eaten; both
  sides need ≥ 4 meals. Cards show a line only when larger is ≥ 20 points
  worse; the finding detail shows the split numbers whenever there's enough
  data. Not in the PDF; no existing number changes.
- **Daily confounders (owner-decided 2026-09-30, GitHub #23).** Table
  `day_factor` (0012, one row per local day, every factor nullable — the
  check-in's NOT NULL status couldn't be relaxed additively); backups v6.
  Sleep/stress/alcohol/caffeine, plus period **only when Settings → Track
  period is on** (hidden everywhere otherwise, rows kept). Entry: "Add
  details" chips in the Home check-in card; tapping a selected chip clears
  it to unknown. Flagged days: stress 4–5, poor sleep, any alcohol (that day
  and the next), "more" caffeine, period. Findings compare flagged days with
  days the factor was **logged and not flagged** (never "all other days");
  rough = `isOutcome` only. Caveats on food cards like #20's. A factor-only
  day counts as covered (#13 line, #20 pools). **The chips live on their own
  screen** `/day-details?date=` (`DayFactorChips`), opened from the card's
  details row (device run 2026-10-02: inline chips overflowed Home — which
  doesn't scroll — and hid the Period row behind the tab bar).
- **"By chance" check on findings (owner-decided 2026-09-30, GitHub #24).**
  `src/features/analysis/chance.ts`. Every Insights finding card gets one
  line: how many findings at that card's tier **or better** luck alone
  would produce in its section, plus "could easily be chance" when
  `round(expected) >= found`. Expected = the mean over up to 30 slides
  (≥ 3 positions from zero; < 10 possible slides → "needs a couple of
  weeks of logs") of the SAME analysis re-run with outcomes slid by whole
  days: meal-level families move outcome entries among **logged days**
  (never the calendar — a gap or a stray backdated entry would push slides
  into empty time and understate chance; review 2026-09-30), keeping the
  time of day; medications/factors rotate the rough flags among covered
  days. Counts use each family's uncapped `*Candidates` / `compare*Days`
  lists (no low-only fallback, no cap) on the real journal and on every
  slide alike. Display-only: no number, tier, order or visibility changes;
  Insights only (not the PDF or the detail screen). Deterministic.
  **Look-alikes count once** (owner-decided 2026-10-02): candidates covering
  exactly the same meals/days (a signature of sorted unit ids, returned
  next to each family's candidates) are one finding at their best tier —
  otherwise a meal tagged lactose+pasta+milk+cheese was four findings and
  the warning depended on how many tags a meal carries.
- **Saved meals / "My meals" (owner-decided 2026-09-30, GitHub #25).**
  Templates live in `saved_meal` + `saved_meal_component` (0013, backups
  v7) and never are, or link to, a log entry. Created with "Save as my
  meal" on meal review; listed A–Z on Home above Recent; tapping one
  copies its items into the builder (time = now) like a Recent row;
  "Edit" opens review in **template mode** (builder store
  `editingSavedMealId`; no date/notes/cap notice; Save changes / Delete my
  meal). Names unique case-insensitively (`nameKey`); a clash asks to
  Replace. Review items are editable in place (tap the name). **Opt-in
  backfill** after a template save whose items carry ingredient tags:
  past same-name food entries whose tags are **only names** (their own or
  their items' — `createMealWithComponents` always adds item names, so
  "no tags at all" would match nothing since the builder; review
  2026-09-30) get the template's tags merged in, in one transaction; text
  only fills an empty `ingredientsText`. Restore: the device's template
  wins an id or name clash.
- **Faster logging (owner-decided 2026-10-01, GitHub #26).** Favourites
  = My meals, ordered for the meal slot (Home: by time of day, 05–11
  breakfast / 11–16 lunch / 16–22 dinner; quick log: the reminder's slot).
  Tapping a breakfast/lunch/dinner reminder opens `/quick-log?slot=…`
  (`useMealReminderResponses`, navigation only — a notification is never a
  record); a meal opened there takes that slot. **Regular medications:**
  `medication.isRegular` (0014, backups v8) requires a default dose + unit;
  "Took my regular meds" (`RegularMedsButton`, Meds tab + quick log)
  writes ONE event through `createMedicationEvent` with each active regular
  med's default dose, on an explicit tap only; then "Logged at … · Undo"
  (Undo deletes that event). The Undo offer ends on **blur**, not unmount —
  tabs stay mounted (review 2026-10-01).
- **Medication adherence + as-needed reasons (owner-decided 2026-10-01,
  GitHub #28).** Logged days only — never "missed", "skipped" or a
  percentage (a day without a log is unknown). Regular meds still in use:
  "Logged on N of the last M days", M = local days from the later of the
  30-day window start and the **first logged dose** up to today ("Logged
  today" when M = 1). The stated start/end dates are notes and never clip
  (review 2026-10-01: end-date clipping made "the last M days" false); a
  regular med whose end date has passed, and every as-needed med, reads
  "Logged on N days in the last 30". Lines on Meds tab rows + a dose
  calendar on each medication's screen. `medication_dose.reason` (0015,
  backups v9): asked on as-needed lines, chips from that med's past
  reasons, shown as "Ibuprofen 200 mg — headache" via the one dose-label
  formatter (the PDF amounts column stays amount-only).
- **Medication reminders (owner-decided 2026-10-01, GitHub #29).** Table
  `medication_reminder` (0016, backups v10): medication, hour, minute,
  `daysMask` (bit 0 = Monday … bit 6 = Sunday), enabled — edited in the
  medication form and replaced in the same transaction as the medication.
  Scheduling (`reminderService.ts`, serialized, own slot `med-reminder`
  only): one WEEKLY trigger per (weekday, time) grouping every **active**
  med due (expo weekday 1 = Sunday). The **"Took them"** button (only
  when every med due has a default dose + unit; `opensAppToForeground`)
  re-reads the meds at tap time and writes ONE event at current defaults,
  then an Undo alert; a body tap opens `/medication/entry/new?medicationIds=`
  with those lines ticked. A reminder never writes a dose by itself.
  **Response guards key on the firing, not the identifier**
  (`responseHandledKey`: identifier + delivery time + action) — a
  repeating DAILY/WEEKLY trigger keeps its identifier, and keying on it
  alone ignored every later firing while Home stayed mounted (review
  2026-10-02; also fixed #26's meal-reminder tap).
- **Watchlist in backups (owner-decided 2026-10-02, backup v11).** A restore
  used to drop the watched ingredients. `watchlistItems` are exported and
  restored (`insertWatchlistItemsPreservingIds`; terms re-normalised; the
  device's own item wins an id or term clash), then the watchlist store
  reloads.
- **Real-SQLite repository tests (2026-09-27, GitHub #18).** `jest/expo-sqlite-node.ts`
  is a Jest-only fake `expo-sqlite` backed by Node's built-in `node:sqlite`
  (**Node ≥ 22.13 to run the tests**; no dependency). A DB test file starts
  with `jest.mock('expo-sqlite', () => jest.requireActual('<path>/jest/expo-sqlite-node'))`,
  then uses `src/db/testUtils/testDb.ts` (`migrateTestDb`, `resetTestDb`,
  `closeTestDb`) — the real client, schema, migrations and repository run
  against an in-memory database. Helpers live outside `__tests__/` because
  Jest collects every file there as a suite. Never import either from app code.

## 1. What this project is

A **local-first food-sensitivity journal** for mobile. The user logs meals and
snacks, logs symptoms and bowel movements (each rated — symptom severity 1–5;
BM Bristol type + feel-afterward 1–5), and over time the app surfaces
correlations between what was eaten and a rough outcome (a bad BM or a
significant symptom) within 24 hours. Nutritional tracking (fats, carbs,
protein, etc.) is a first-class bonus, not the primary purpose.

Primary data ingestion is **barcode scan → nutrition lookup**, with **manual
entry** as the always-available fallback.

**Distribution:** Expo. Android first (sideload/dev build to a Pixel 5), iOS
later via EAS Build + TestFlight.

## 2. Project philosophy

The human owner is an experienced .NET developer deliberately using this project
to learn **autonomous, agentic coding workflows** with Claude Code. Therefore:

- **Optimize for a tight, automated feedback loop.** Every change should be
  verifiable by a command, not by vibes. See §4.
- **Prefer small, reviewable steps** with green checks over large speculative
  rewrites.
- **Never trade away the hard-stop billing safety.** Do not suggest enabling
  pay-as-you-go / "extra usage" credits.

## 3. Tech stack (locked for MVP)

| Concern        | Choice                                               |
|----------------|------------------------------------------------------|
| Framework      | Expo (managed) + React Native + **TypeScript**       |
| Routing        | `expo-router` (file-based, under `src/app`)          |
| Local DB       | `expo-sqlite` + **Drizzle ORM** (typed queries)      |
| UI state       | `zustand` (keep it minimal)                          |
| Data fetching  | `@tanstack/react-query` for the barcode lookup       |
| Barcode scan   | `expo-camera` (built-in barcode scanning)            |
| Nutrition API  | **Open Food Facts** (product lookup `world.openfoodfacts.org` + search `search.openfoodfacts.org`, no key) |
| Notifications  | `expo-notifications` (**local scheduled** reminders) |
| Calendar       | `expo-calendar` (native calendar interop)            |
| Calendar UI    | `react-native-calendars` for day/week/month picker   |
| Date/time pick | `@react-native-community/datetimepicker` (native OS picker) |
| Keyboard       | `react-native-keyboard-controller` (owner-approved 2026-08-28; graceful seam `src/lib/keyboard.ts`, sync TurboModule probe; native module ships with the next dev build) |
| File export    | `expo-file-system` (SDK 56 `File`/`Paths` API) + `expo-sharing` |
| PDF report     | `expo-print` (owner-approved 2026-08-24; **dynamic import only** until the next dev build ships it) |
| Haptics        | `expo-haptics` (owner-approved 2026-08-21; **dynamic import only**, graceful no-op wrapper `src/lib/haptics.ts`) |
| Tests          | Jest (`jest-expo`) + `@testing-library/react-native` |
| Lint/format    | `expo lint` (ESLint) + Prettier                      |
| Builds         | EAS Build (dev/preview/production)                   |

Do not introduce a backend, auth, or cloud sync in the MVP. All data is on-device.
If a new runtime dependency outside this table seems necessary, propose it before
adding it.

## 4. Verification rungs — the definition of "done"

A task is **done only when all of these exit clean.** Run them yourself before
claiming completion.

```bash
npm run typecheck     # tsc --noEmit         — no type errors
npm run lint          # expo lint            — no lint errors
npm test              # jest                 — all tests pass
```

Rules:
- If you write a feature, you write or update its tests in the same change.
- If a check fails, read the actual error and fix it; do not silence it
  (no `// @ts-ignore`, no disabling lint rules) without explicit owner approval.
- Never mark a task complete with a red check. "It should work" is not done.

## 5. Repository layout

```
src/
  app/                # expo-router routes (screens)
    entry/[id].tsx    # view/edit a single log entry
  components/         # reusable presentational components
  db/
    schema.ts         # Drizzle schema (source of truth for the data model)
    client.ts         # sqlite + drizzle setup
    migrations/       # generated migrations
  features/
    logging/          # add/edit meal & snack flow
    barcode/          # scan + Open Food Facts lookup + manual fallback
    sentiment/        # the 1–5 emoji scale component + enum
    calendar/         # day/week/month views
    notifications/    # local reminder scheduling
    analysis/         # (Phase 3) correlation logic
  lib/                # pure helpers (no React) — easiest to unit-test
drizzle.config.ts     # drizzle-kit config
eas.json              # EAS build profiles (owner-driven)
```

Keep pure logic (nutrition math, correlation math, sentiment mapping) in `src/lib/`
as plain functions. Pure functions are trivial to test and are where the loop's
verification leverage lives.

## 6. Data model (Drizzle is the source of truth — edit `src/db/schema.ts`)

MVP entities:

- **logEntry**
  - `id` (uuid, pk)
  - `type` — `'meal' | 'snack'` (Phase 2 adds `'bowel_movement'`)
  - `mealSlot` — `'breakfast' | 'lunch' | 'dinner' | 'snack' | null`
  - `name` (text)
  - `barcode` (text, nullable)
  - `loggedAt` (timestamp — when the meal happened, editable)
  - `sentiment` (int 1–5, nullable — see §7; **written only by the BM
    feel-afterward rating since 2026-08-28**; retained on meal/snack rows
    purely for history and old-backup imports, never written or read by the
    current meal/snack forms)
  - `notes` (text, **max 500 chars** — enforce in validation, not just UI)
  - nutrition: `calories, fatG, carbsG, proteinG, fiberG, sugarG, sodiumMg`
    (all real, nullable)
  - `createdAt`, `updatedAt` (timestamps)

- **dayCheckIn** (`day_check_in`, since migration 0010 — GitHub #13)
  - `id` (uuid, pk)
  - `date` (text `'YYYY-MM-DD'`, local calendar day, **unique** — one row per
    day; answering again updates `status`)
  - `status` — `'fine' | 'rough'`
  - `createdAt`, `updatedAt` (timestamps)
  - Written only by an explicit tap (Home card / notification button) or a
    backup restore (device's own row for a day wins). Never an outcome (§0).

- **experiment** (`experiment`, migration 0011 — GitHub #19)
  - `id`, `term` (normalized watch term), `startDate` ('YYYY-MM-DD', first
    avoidance day), `baselineDays`, `eliminationDays`, `challengeDays`,
    `observationDays`, `status` — `'active' | 'completed' | 'abandoned'`
    (≤ 1 active), `verdictJson` (frozen verdict at finish, else null),
    `endedAt`, `createdAt`, `updatedAt`. Backups v5.

- **dayFactor** (`day_factor`, migration 0012 — GitHub #23)
  - `id`, `date` ('YYYY-MM-DD', **unique**), `sleep` (`poor|ok|good`),
    `stress` (1–5), `alcohol` (`none|some|a_lot`), `caffeine`
    (`none|usual|more`), `period` (boolean; shown/analysed only when
    Track period is on) — all nullable (null = not logged), `createdAt`,
    `updatedAt`. Backups v6.

- **medication** additions: `isRegular` (boolean, default false — migration
  0014, GitHub #26; needs a default dose + unit). **medicationDose**
  addition: `reason` (text, nullable — migration 0015, GitHub #28).
  Backups v8 / v9.

- **medicationReminder** (`medication_reminder`, migration 0016 — GitHub
  #29): `id`, `medicationId`, `hour` (0–23), `minute`, `daysMask`
  (1–127, bit 0 = Monday), `enabled`, `createdAt`, `updatedAt`. Backups
  v10.

- **savedMeal** (`saved_meal`, migration 0013 — GitHub #25)
  - `id`, `name`, `nameKey` (trimmed lowercase, **unique**), `type`
    (`meal|snack`), `mealSlot` (nullable), `createdAt`, `updatedAt`.
  - Items in `saved_meal_component`: every `meal_component` column with
    `savedMealId` instead of `entryId`. A template is never a log entry.
    Backups v7.

Conventions:
- Timestamps stored as Unix epoch (ms) integers.
- `loggedAt` is user-editable (they may backfill or correct a meal's time).
- The BM feel-afterward rating can be set on creation **or** added/updated
  later — design every write path to allow a later edit. Meal/snack write
  paths deliberately carry no sentiment field at all.

## 7. Feel-afterward scale (BM rating only)

Single enum, 1–5, low = bad digestive experience, high = great. Since
2026-08-28 this scale feeds only the bowel-movement "How did it feel?"
rating (which in turn feeds `isOutcome`, §0) and renders historical
meal/snack `sentiment` values saved before that date — it is never shown on
a meal/snack form:

| value | meaning          | emoji |
|-------|------------------|-------|
| 1     | very unhappy     | 😖    |
| 2     | unhappy          | 🙁    |
| 3     | neutral          | 😐    |
| 4     | satisfied        | 🙂    |
| 5     | very satisfied   | 😄    |

Define this **once** in `src/features/sentiment/scale.ts` as the single source of
truth (value ↔ label ↔ emoji). Never hard-code emojis in screens.

## 8. Conventions

- TypeScript strict mode on. No `any` without a `// reason:` comment.
- Functional components + hooks. No class components (single exception:
  `src/components/root-error-boundary.tsx` — React exposes error boundaries
  only via class lifecycles).
- Validation lives in `src/lib/` as pure functions and is unit-tested (e.g.
  `validateNotes`, `validateNutrition`).
- Accessibility: every interactive element gets an `accessibilityLabel`.
- Commit messages: imperative mood, scoped (e.g. `feat(logging): add snack form`).
- One logical change per commit so checkpoints/rewinds stay clean.

## 9. Guardrails — ask the owner before:

- Adding any new runtime dependency outside the §3 table.
- Adding any network call beyond the Open Food Facts lookup.
- Requesting a device permission not already justified (camera, notifications,
  calendar are pre-approved; anything else is not).
- Changing the data schema after Phase 1 ships (write a migration, don't mutate).
- Enabling remote push infrastructure (MVP uses local notifications only).

## 10. Model routing

- **Planning / architecture / reviewing a diff:** Opus.
- **Bulk implementation, test writing, refactors:** Sonnet.
- **Cheap mechanical edits / quick lookups:** Haiku.
