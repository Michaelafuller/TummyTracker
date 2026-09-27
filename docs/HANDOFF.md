# HANDOFF.md — Execute session: Day check-in ("fine day / rough day"), GitHub #13

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§4 rungs, §6,
> §8 conventions, §9 guardrails). This cycle touches `src/db/schema.ts` + one
> **generated** migration, `src/db/repository.ts`, `src/lib/backup.ts`,
> `src/lib/prefs.ts`, `src/features/prefs/prefsStore.ts`, new
> `src/lib/dayCoverage.ts`, new `src/features/checkin/*`,
> `src/components/app-providers.tsx`, `src/app/(tabs)/index.tsx`,
> `src/app/(tabs)/insights.tsx`, `src/app/settings.tsx`, and tests.
>
> **Pure JS/TS + one additive migration (owner-approved 2026-09-27)** — no new
> dependency, no native change, no EAS build. `expo-notifications` (already
> installed, already in the dev client) provides the action buttons.

**Planned 2026-09-27 (Opus plan session) — GitHub
Michaelafuller/TummyTracker#13. Owner decisions, all 2026-09-27, "keep it
minimal":**

1. **Its own notification** — "How was today?" with **Fine day / Rough day**
   buttons, its own switch + time in **Settings** (off by default). The Goals
   check-in is **not touched**.
2. **Fine day** = a confirmed "nothing went wrong" day. **Rough day** marks the
   day covered but is **not an outcome** — it only prompts "add a symptom?".
3. **Coverage only this cycle** — Insights shows "X of Y days covered"; the
   correlation engine (`src/features/analysis/*`) is **unchanged**.
4. **Additive table** `day_check_in`, one row per local day; backup → v4.
   No stress/confounder fields (that's GH #23, later).
5. Same flow as before: Sonnet executes, Opus reviews, device test later.

---

## 0. Invariants — read twice

- **The engine does not change.** No edits under `src/features/analysis/`,
  `src/lib/chartData.ts`, `src/lib/report.ts`, or to `isOutcome`. A check-in is
  never an outcome and never a log entry.
- **One row per local day** (`date` = `'YYYY-MM-DD'`, unique). Answering again
  the same day **updates** that row's status (Fine ↔ Rough); it never inserts
  a second row. There is no delete path this cycle.
- **An answer is recorded for the day the notification asked about** —
  `content.data.date` — never `Date.now()`'s day. Tapping yesterday's
  notification after midnight records yesterday.
- **Nothing is inferred.** Only an explicit tap (Home card or notification
  action) or a backup restore writes `day_check_in`. A day with no answer has
  no row.
- **Other notifications are untouched.** The day check-in uses its own slot;
  its cancel step filters on that slot only (reminders + Goals check-in keep
  their own). Scheduling never requests permission — only the Settings switch
  does.
- **Additive migration only** (CLAUDE.md §9): the generated SQL must be only
  `CREATE TABLE` / `CREATE UNIQUE INDEX` for the new table. If drizzle-kit
  emits anything touching an existing table, **stop and report**.
- Stage files by path — never `git add -A` / `git add .`.

## 1. Schema + migration

In `src/db/schema.ts`, after the medication tables:

```ts
/** A day check-in answer (GitHub #13). */
export const DAY_STATUSES = ['fine', 'rough'] as const;
export type DayStatus = (typeof DAY_STATUSES)[number];

export const dayCheckIn = sqliteTable('day_check_in', {
  id: text('id').primaryKey(),
  // Local calendar day 'YYYY-MM-DD' (formatDateInput) — one row per day.
  date: text('date').notNull().unique(),
  status: text('status', { enum: DAY_STATUSES }).notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
export type DayCheckIn = typeof dayCheckIn.$inferSelect;
export type NewDayCheckIn = typeof dayCheckIn.$inferInsert;
```

Add a doc comment in the file's style stating the invariants above (one row per
day, answer = the notification's day, never an outcome, rough ≠ symptom).

Run **`npm run db:generate`** and commit everything it produces:
`src/db/migrations/0010_*.sql`, `meta/0010_snapshot.json`, `meta/_journal.json`,
`migrations.js`. Read the SQL — it must be exactly the new table + its unique
index (see §0).

## 2. Repository + live hook

In `src/db/repository.ts`:

- `upsertDayCheckIn(date: string, status: DayStatus): Promise<void>` — insert
  with `createId()` + `createdAt/updatedAt = Date.now()`,
  `.onConflictDoUpdate({ target: dayCheckIn.date, set: { status, updatedAt } })`.
  Validate `date` with the same `YYYY-MM-DD` shape check as §4 (throw on bad
  input — callers only pass generated keys).
- `listAllDayCheckIns(): Promise<DayCheckIn[]>` (for export).
- `insertDayCheckInsPreservingIds(rows): Promise<{ inserted; skipped }>` —
  mirrors `insertMedicationsPreservingIds` (chunked by `RESTORE_CHUNK_SIZE`),
  but **skip a row if its `date` already exists on the device *or* its `id`
  does** — the device's own answer for a day wins over a backup's. Also
  de-duplicate by `date` within `rows` (first wins) before inserting.

New `src/features/checkin/useDayCheckIns.ts`: `useDayCheckIns(): DayCheckIn[]`
via `useLiveQuery`, newest date first — mirrors `useAllEntries`.

## 3. Pure logic (main test targets)

### 3.1 `src/features/checkin/dayCheckInModel.ts` (no expo-notifications import)

```ts
export const DAY_CHECK_IN_SLOT = 'day-check-in';           // content.data.slot
export const DAY_CHECK_IN_CATEGORY = 'day-check-in';       // categoryIdentifier
export const DAY_CHECK_IN_ACTIONS = { fine: 'day-check-in-fine', rough: 'day-check-in-rough' } as const;
export const DAY_CHECK_IN_TITLE = 'How was today?';
export const DAY_CHECK_IN_BODY = 'Fine day or rough day? One tap keeps your insights honest.';

/** Fire dates for the one-shot horizon: today at hour:minute when that's still
 *  ahead of `now` and today isn't answered yet, then each of the next 6 days —
 *  anchored on "today at hour:minute" exactly like checkInService.refreshCheckIn
 *  (DST-safe Date mutation). */
export function dayCheckInFireDates(now: number, hour: number, minute: number,
  answeredToday: boolean): Date[]

/** The minimal response shape we read. Returns null for anything that isn't one
 *  of OUR two action buttons (a plain tap on the notification body, another
 *  slot, a malformed/missing data.date → null). */
export interface ResponseLike {
  actionIdentifier: string;
  notification: { request: { identifier: string; content: { data?: Record<string, unknown> | null } } };
}
export function parseDayCheckInResponse(r: ResponseLike): { date: string; status: DayStatus } | null
```

### 3.2 `src/lib/dayCoverage.ts`

```ts
export const COVERAGE_WINDOW_DAYS = 28;
export interface DayCoverage { covered: number; total: number; checkedIn: number }
export function dayCoverage(
  entries: readonly { loggedAt: number }[],
  checkIns: readonly { date: string }[],
  now: number,
  windowDays = COVERAGE_WINDOW_DAYS,
): DayCoverage | null
```

- Window = the last `windowDays` **local calendar days ending today**
  (inclusive), built by stepping a `Date` back with `setDate` (DST-safe), keyed
  with `formatDateInput`.
- **Clip the window's start** to the earliest day with any activity (earliest
  entry day or earliest check-in date, `'YYYY-MM-DD'` compares as a string) —
  someone who started 10 days ago sees "of 10", not "of 28".
- `covered` = window days with ≥ 1 entry **or** a check-in; `checkedIn` =
  window days with a check-in. Entries/check-ins after today are ignored.
- `null` when there's no activity at all (the UI hides the line).

## 4. Backup v4 (`src/lib/backup.ts` + `settings.tsx`)

- `BackupFile.dayCheckIns?: DayCheckIn[]` ("Absent before v4 … treated as []").
  `entriesToJson(…, dayCheckIns = [])` writes `version: 4`.
- `parseBackupJson` reads it like the medication arrays: `isValidDayCheckIn`
  (non-empty string `id`; `date` matches `/^\d{4}-\d{2}-\d{2}$/`; `status` in
  `DAY_STATUSES`; numeric `createdAt`/`updatedAt`) — invalid → `ok:false`,
  `"Day check-in at index N has an invalid shape."`. `ParseResult` gains
  `dayCheckIns`. v1/v2/v3 files still import (missing key → []).
- `settings.tsx`: export includes `listAllDayCheckIns()`; import calls
  `insertDayCheckInsPreservingIds(parsed.dayCheckIns)` after the medication
  restore and appends `" Imported N day check-in(s) (M already existed)."` to
  the summary only when the file had any (same shape as `medSummary`).

## 5. Notification service — `src/features/checkin/dayCheckInService.ts`

Model it on `src/features/goals/checkInService.ts` (read it first), minus the
adoption logic (this is new — prefs are simply the source of truth).

- Prefs (`src/lib/prefs.ts` + `prefsStore.ts`): `dayCheckInEnabled: false`,
  `dayCheckInHour: 21`, `dayCheckInMinute: 0` (21:00 so it never collides with
  the Goals check-in's 20:00 default). Store action
  `setDayCheckIn(enabled, hour, minute)` — sets + persists in one call, like
  `setCheckIn`.
- `ensureDayCheckInCategory()` — `Notifications.setNotificationCategoryAsync(
  DAY_CHECK_IN_CATEGORY, [{ identifier: fine, buttonTitle: 'Fine day',
  options: { opensAppToForeground: true } }, { identifier: rough, buttonTitle:
  'Rough day', options: { opensAppToForeground: true } }])`.
  **`opensAppToForeground: true` is required**: there's no background task
  runner (no `expo-task-manager`, not approved), so our JS only runs if the
  app opens.
- `refreshDayCheckIn(hour, minute)` — cancel every scheduled notification whose
  `content.data.slot === DAY_CHECK_IN_SLOT`; look up whether today is already
  answered (repository: `getDayCheckIn(date)` — add it); `ensureAndroidChannel()`
  (reuse `CHANNEL_ID`, no new channel); `ensureDayCheckInCategory()`; then
  schedule each `dayCheckInFireDates(...)` date as a one-shot
  (`SchedulableTriggerInputTypes.DATE`, `channelId: CHANNEL_ID`) with
  `title/body` from the model, `categoryIdentifier: DAY_CHECK_IN_CATEGORY`,
  `data: { slot, date: formatDateInput(fireDate), hour, minute }`.
- `disableDayCheckIn()` — cancel the slot only.
- `refreshDayCheckInIfEnabled()` — reads prefs; no-op when disabled.
  Fire-and-forget at call sites.
- `recordDayCheckIn(date, status)` — `upsertDayCheckIn` then
  `void refreshDayCheckInIfEnabled()` (answering today drops today's pending
  notification from the horizon).

Call `void refreshDayCheckInIfEnabled()` in `MigrationGate`'s success effect
next to `refreshCheckInIfEnabled()`.

## 6. Handling the buttons — `src/features/checkin/useDayCheckInResponses.ts`

```ts
export function useDayCheckInResponses(): void
```

- `const response = Notifications.useLastNotificationResponse();` in an effect:
  `parseDayCheckInResponse(response)` → null ⇒ do nothing (a body tap just
  opens the app, as today). Otherwise, **once per
  `request.identifier + actionIdentifier`** (track in a `useRef<Set>`):
  `await recordDayCheckIn(date, status)`, then
  `Notifications.dismissNotificationAsync(request.identifier)` (Android leaves
  the notification up after an action tap) and
  `Notifications.clearLastNotificationResponse()` (so a relaunch doesn't
  re-apply it). Swallow + ignore errors from dismiss/clear; a failed record
  must not crash the screen.
- **Mounted from the Home screen** (`(tabs)/index.tsx`), not the root: Home is
  the initial tab, so it's mounted whenever the app is, and only after the
  migration gate — the write can't race the migrations. No navigation on
  answer (keep it minimal; the Home card reflects the answer).

## 7. Screens

- **Home card** — new `src/features/checkin/DayCheckInCard.tsx`, rendered in
  `(tabs)/index.tsx` between the action buttons and "Recent":
  - Props `{ date: string }`. Home computes today's key in its existing
    `useFocusEffect` (state, not `Date.now()` in render) so a day rollover
    refreshes on focus. The card reads today's row via `useDayCheckIns()`.
  - Heading "How was today?" + two side-by-side toggle buttons **"Fine day"**
    / **"Rough day"** (`accessibilityRole="button"`,
    `accessibilityState={{ selected }}`, labels **"Mark today as a fine day"**
    / **"Mark today as a rough day"**, `testID="day-check-in-fine"` /
    `"day-check-in-rough"`). The selected one is filled (theme `primary` /
    `primaryText`, like the Scan CTA); tapping the other switches. Tap →
    `recordDayCheckIn(date, status)` + `haptics` light tap if the wrapper
    exposes one (`src/lib/haptics.ts`).
  - When today is **rough**: one secondary line "Rough day noted." + a link
    button **"Add a symptom"** (`accessibilityLabel="Add a symptom for today"`)
    → `router.push('/symptom/new')`. ⚠ Do **not** reuse the label/text
    "Log a symptom" — the existing 🤢 button owns it and Maestro flows tap it.
  - Keep it compact (one row of buttons); no emoji (CLAUDE.md §7 scale is for
    BM feel only).
- **Settings** (`src/app/settings.tsx`) — a **"Day check-in"** section right
  after the meal reminders: one line of copy ("An evening notification asking
  whether today was a fine day or a rough day — answering takes one tap."),
  a `Switch` (`accessibilityLabel="Day check-in"`) and a `TimeField`
  (`accessibilityLabel="Day check-in time"`). Switch on → request permission
  via `ensureNotificationPermission` (Alert on decline, same copy style as the
  reminders), `setDayCheckIn(true, …)`, `refreshDayCheckIn`. Off →
  `setDayCheckIn(false, …)`, `disableDayCheckIn`. Time change →
  persist, refresh if enabled. Read state from `usePrefsStore`.
  ⚠ Never name anything "Daily check-in" — that's the Goals tab's switch.
- **Insights** (`(tabs)/insights.tsx`) — in the "Your journal so far" block,
  under the existing counts line, when `dayCoverage(entries, checkIns, now)` is
  non-null: `"Days covered: 19 of 28 (last 28 days) · 6 checked in"` (use the
  real `total` in both places; singular "day" when total is 1), then a
  `textSecondary` line "A day counts when you logged something or answered the
  day check-in." `checkIns` from `useDayCheckIns()`. **Nothing else on the
  screen changes.**

## 8. Tests (same change, CLAUDE.md §4)

- `src/lib/__tests__/dayCoverage.test.ts` — null with no activity; clip to
  first activity; entries-only, check-ins-only and both on one day count once;
  `checkedIn` counts; future items ignored; a DST-crossing window has exactly
  `windowDays` keys (use a fixed `now`).
- `src/features/checkin/__tests__/dayCheckInModel.test.ts` — fire dates: today
  included only when ahead **and** unanswered; always 6 following days; hour/
  minute honored. `parseDayCheckInResponse`: both actions; body tap
  (`DEFAULT_ACTION_IDENTIFIER`-style id) → null; other slot → null; bad/missing
  `date` → null.
- `src/features/checkin/__tests__/dayCheckInService.test.ts` (mock
  `expo-notifications`, repository, prefs like `checkInService.test.ts`) —
  cancels only its own slot (a reminder + a goal check-in survive); schedules
  7 or 6 one-shots with `categoryIdentifier` + `data.date`; answered today ⇒
  no today fire; disabled ⇒ `refreshDayCheckInIfEnabled` schedules nothing;
  `recordDayCheckIn` upserts then refreshes.
- `useDayCheckInResponses` test — a fine action records the notification's
  `date` (not today's), dismisses + clears; the same response twice records
  once; a body tap records nothing.
- `DayCheckInCard` test — tap Fine records `('<date>','fine')`; selected state;
  rough shows "Add a symptom" → push `/symptom/new`.
- `backup.test.ts` — v4 round-trip; v3 file (no key) → `dayCheckIns: []`;
  invalid status/date → error message with index.
- Update, don't weaken: `index.test.tsx` (mock the card + responder hook),
  `insights.test.tsx` (coverage line shown/hidden), `settings.test.tsx`
  (switch → permission + refresh; export includes check-ins; import summary),
  `prefsStore`/`prefs` tests for the new fields.

## 9. Definition of done

- `npm run typecheck` && `npm run lint` clean; **`npm run bundle:check`** (the
  new migration is imported through `migrations.js` — Metro must inline it).
- **Targeted Jest only (owner instruction — never the full suite):** every test
  file you created or touched + `backup`, `checkInService`, `checkInModel`,
  `prefs`, `prefsStore`, `settings`, `index`, `insights`, `goals`.
  `(tabs)` paths via `npx jest --runTestsByPath "<path>"` (plain path args
  silently skip them).
- No `@ts-ignore`, no lint disables, no `any` without `// reason:`, no new
  deps, no schema change beyond §1 (if you think you need one, stop and
  report).
- Do NOT run Maestro, EAS, or `npx expo start` (Metro runs on 8081 — leave
  it). Do NOT edit `flows/`. Do NOT edit `CLAUDE.md` / `docs/` (the review
  session updates them).
- Commits (stage by path), suggested split:
  `feat(db): day_check_in table + additive migration 0010` ·
  `feat(checkin): day check-in model, repository, coverage helper` ·
  `feat(backup): include day check-ins (backup v4)` ·
  `feat(checkin): day check-in notification with Fine/Rough actions + Settings switch` ·
  `feat(checkin): Home check-in card and Insights day coverage` —
  each ending `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
  Do NOT push.
- Execute summary: files per commit, hashes, the generated SQL verbatim, rung +
  bundle:check results, targeted Jest counts, deviations with reasons,
  review/device-test pointers.

## 10. After this (review + test session)

- Opus review: invariants (§0), migration SQL, slot isolation, the
  answer-date rule, restore precedence; re-run rungs + bundle:check.
- Update `CLAUDE.md` §6 (new entity) + §0 (decision note), `docs/PROGRESS.md`.
- New Maestro flow (Opus writes it): Home card Fine → Rough → "Add a symptom"
  opens the form → back; Insights shows the coverage line; Settings Day
  check-in switch + time. Notification action buttons are a **manual** device
  check (Maestro can't drive the shade reliably): enable, set time 1–2 min
  ahead, tap "Rough day" from the shade → app opens, Home card shows Rough.
- Regression (targeted): the Home flows (recent re-log, keyboard dismissal),
  `nav-tabs`, the settings/backup flow, the Goals check-in flow.
