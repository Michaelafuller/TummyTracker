# HANDOFF.md — Cycle: Goals tab, part 2 — nutrient threshold goals + daily check-in

> **Read first:** root `CLAUDE.md` (auto-loaded). File paths are from the
> current tree; read the named files before editing.
>
> **Session type:** execute. Definition of done per CLAUDE.md §4:
> `npm run typecheck && npm run lint && npm test` green, tests ship with each
> change, one logical change per commit. **`npm run bundle:check` IS required**
> at closeout (this cycle adds migration 0008's `.sql`, which must survive
> Metro's babel inlining).
>
> **Source of these requirements:** owner feature spec 2026-08-15 (PROGRESS.md
> Tier 2 "Nutrient threshold goals + daily check-in"). Part 1 (the Goals tab +
> daily tally) shipped earlier today — this cycle builds on
> `src/lib/dailyTally.ts` and `src/app/(tabs)/goals.tsx`.

---

## Design contract (decided in planning — do not re-litigate)

- A **goal** is a per-nutrient threshold with a direction: a **floor** (≥,
  "at least 50g protein") or a **cap** (≤, "at most 20g fat"). At most one
  goal per nutrient (any of the 8 `NUTRITION_FIELDS`); setting again
  overwrites, removing deletes. Opt-in per nutrient — zero goals is a valid
  state.
- **Two alert channels with different semantics (owner-approved):**
  - **Floors → the daily check-in notification.** One global check-in time
    ("likely just once a day" — exactly one). The notification names each
    unmet floor with its shortfall.
  - **Caps → in-app, at the moment of the save that crosses them.** Only a
    save can move the total, and saves happen in-app, so a scheduled
    notification is the wrong tool. A cap notice must NEVER block saving —
    breaking an elimination/limit is the user's call and the journal must
    record it (same principle as the watchlist notice).
- **The check-in body is never stale** (local-first invariant): totals only
  change through the app, so recompute + reschedule on every food save, on
  every goal/check-in edit, and on app open. Fired-or-not is resolved by
  scheduling **one-shot** notifications (not DAILY repeats — see Phase 4).
- **Missing data counts as zero for evaluation** (a floor with nothing logged
  is fully open; a cap with nothing logged is fully within budget), and the
  Goals tab already discloses missing entries per nutrient (part 1), so the
  user can see why a number looks low.

---

## Phase 1 — schema, migration, repository

- `src/db/schema.ts`: new `goal` table:
  `id` (text pk), `nutrient` (text, not null, **unique** — one goal per
  nutrient, values are `NutritionField` strings), `direction` (text, not
  null — `'floor' | 'cap'`), `threshold` (real, not null), `createdAt`
  (int ms). Export inferred types + a `GOAL_DIRECTIONS` const tuple like the
  schema's other enums.
- Generate migration 0008 (`npm run db:generate`). Additive only.
- `src/db/repository.ts`: `listGoals()`, `upsertGoal(nutrient, direction,
  threshold)` (insert-or-replace on the nutrient key; keep original
  `createdAt` on replace only if trivial, else reset — either is fine,
  comment which), `removeGoal(nutrient)`.

**Commit:** `feat(db): add nutrient goal table and repository (migration 0008)`

---

## Phase 2 — pure evaluation + check-in model

- `src/lib/goals.ts` (new, pure): using `DailyTally` from `src/lib/dailyTally.ts`:

  ```ts
  export interface GoalEvaluation {
    goal: Goal;
    /** Tally total for the goal's nutrient, null coerced to 0 for judging. */
    total: number;
    met: boolean;            // floor: total >= threshold · cap: total <= threshold
    /** floor: amount still to go (0 when met) · cap: amount over (0 when within). */
    shortfall: number;
  }
  export function evaluateGoals(goals: readonly Goal[], tally: DailyTally): GoalEvaluation[]
  export function unmetFloors(evaluations: readonly GoalEvaluation[]): GoalEvaluation[]
  export function exceededCaps(evaluations: readonly GoalEvaluation[]): GoalEvaluation[]
  ```

  Validation helper `parseGoalThreshold(input: string): number | null`
  (positive finite number, else null) for the editor UI.
- `src/features/goals/checkInModel.ts` (new, pure — mirror
  `src/features/notifications/model.ts`'s style):
  - `CHECK_IN_SLOT = 'goal-check-in'` — stored in `content.data.slot` so the
    scheduled notification remains the source of truth for enabled/hour/minute,
    exactly like reminders (`remindersFromScheduled`). Add
    `checkInFromScheduled(scheduled)` reconstructing `{ enabled, hour, minute }`.
  - `nextCheckInFireDate(now: number, hour, minute, skipToday: boolean): Date`
    — today at hour:minute if that's still in the future and `!skipToday`,
    else tomorrow at hour:minute (local time via `Date` mutation).
  - Body builders (use `NUTRITION_NOUNS`/`NUTRITION_LABELS` from
    `src/lib/nutrition.ts`, units handled — no hand-written labels):
    `checkInBodyForToday(unmet: GoalEvaluation[])` → e.g.
    "Protein: 22g to go · Fiber: 5g to go";
    `checkInBodyForFreshDay(floors: Goal[])` → the all-floors-open copy used
    when scheduling for a future day ("Nothing logged yet — protein 50g and
    fiber 30g are still open."). Rationale (comment it): if the user never
    opens the app before that fire, nothing was logged, so this copy is
    *provably* accurate; any app interaction re-arms with fresh copy.
- **Tests** (`src/lib/__tests__/goals.test.ts`,
  `src/features/goals/__tests__/checkInModel.test.ts`): floor/cap met/unmet
  boundaries (exactly-at-threshold counts as met for both directions),
  null-total coercion, shortfall math, threshold parsing rejects 0/negative/
  NaN/empty; fire-date today-vs-tomorrow and `skipToday`, midnight edge;
  body copy for one and several floors, and the fresh-day variant.

**Commit:** `feat(goals): goal evaluation and check-in model helpers`

---

## Phase 3 — goals store + editor UI + tally progress states

- `src/features/goals/goalsStore.ts`: zustand store mirroring
  `watchlistStore` (`goals`, `load`, `upsert`, `remove` — write through the
  repository, then refresh). Hydrate in `app-providers.tsx`'s MigrationGate
  success effect alongside the existing loads.
- Goals tab (`src/app/(tabs)/goals.tsx`):
  - Tally rows gain goal-aware progress when a goal exists for that nutrient:
    show "total / threshold" with the unit label, and state coloring —
    floor met / cap within → the theme's positive/affirmative color; floor
    unmet → neutral/secondary; **cap exceeded → the theme's danger color**
    (find how existing screens express danger/error and reuse; no new
    constants unless none exists).
  - Below the tally: a **Goals section** listing all 8 nutrients; each row
    shows its goal ("≥ 50" / "≤ 20" with unit) or "No goal". Tapping a row
    expands an inline editor: direction toggle (≥ floor / ≤ cap — two
    buttons or a segmented pair, whichever matches existing UI idioms),
    numeric `TextInput` (`keyboardType="numeric"`) validated with
    `parseGoalThreshold`, Save + Remove actions. Every control gets an
    `accessibilityLabel` (e.g. "Set protein goal", "Goal direction: at
    least", "Remove fat goal").
- **Tests** (extend `src/app/(tabs)/__tests__/goals.test.tsx` + a store
  test): setting a floor persists via the mocked repository and shows on the
  row; cap-exceeded renders the danger state; invalid threshold rejected;
  remove clears the row back to "No goal".

**Commit:** `feat(goals): threshold editor and goal-aware tally states`

---

## Phase 4 — daily check-in notification + save-time cap notice

- `src/features/goals/checkInService.ts` (new — mirror
  `src/features/notifications/service.ts`'s structure; reuse its exported
  `ensureNotificationPermission`, and reuse the existing `'reminders'`
  Android channel rather than creating a new one):
  - `getCheckIn()` — reconstruct `{ enabled, hour, minute }` from scheduled
    notifications via `checkInFromScheduled`.
  - `disableCheckIn()` — cancel all notifications whose `data.slot ===
    CHECK_IN_SLOT`.
  - `refreshCheckIn(hour, minute)` — the single (re)scheduling entry point:
    cancel existing check-in notifications, then load today's entries +
    goals, evaluate, and schedule **one one-shot notification**
    (`SchedulableTriggerInputTypes.DATE`):
    - floors unmet and today's fire time still ahead → fire today,
      body = `checkInBodyForToday(unmet)`;
    - all floors met, or today's time already passed → fire at tomorrow's
      hour:minute, body = `checkInBodyForFreshDay(floors)`;
    - no floor goals at all → schedule nothing (caps never notify).
    Store `{ slot: CHECK_IN_SLOT, hour, minute }` in `content.data`.
    Comment the one-shot-vs-DAILY choice: a repeating DAILY trigger can't
    skip "just today" once floors are met; the one-shot re-arms on every
    save/app-open, and if the app is never opened the fresh-day copy is
    still accurate (nothing can have been logged).
  - `refreshCheckInIfEnabled()` — read `getCheckIn()`, no-op unless enabled,
    else `refreshCheckIn(hour, minute)`. This is the hook for save/app-open.
- **Wiring (fire-and-forget, never blocking):**
  - `src/components/app-providers.tsx` MigrationGate success effect: add
    `void refreshCheckInIfEnabled()` (handles day rollover re-arming).
  - Meal review save path (`src/app/meal/review.tsx`): after a successful
    save, `void refreshCheckInIfEnabled()`.
  - Goal edits: `goalsStore.upsert/remove` also call
    `refreshCheckInIfEnabled()` after the repository write.
- **Check-in UI** (Goals tab, below the Goals section): an enable switch +
  time control matching the reminders UI in `src/app/(tabs)/settings.tsx`
  (same `DateTimePicker` usage and permission flow — `enableReminder` there
  shows the pattern: request permission, return false → leave disabled).
  Persist nothing outside the scheduled notification itself.
- **Save-time cap notice** (`src/app/meal/review.tsx`): alongside the
  existing watchlist notice, evaluate what today's tally **plus the pending
  meal's aggregate** would be, and when a cap would be exceeded show a
  non-blocking notice ("Saving puts fat at 24g — over your 20g cap"). Reuse
  `aggregateComponents` for the pending nutrition and `tallyDailyNutrition`
  for today-so-far. Never gate the save button.
- **Tests:** service tests mocking `expo-notifications` (mirror how
  `src/features/notifications` is tested): refresh schedules today-with-body
  when floors unmet, tomorrow-with-fresh-day-body when met or time passed,
  nothing when no floors, disable cancels only the check-in slot (reminder
  notifications with other slots survive); review-screen test for the cap
  notice appearing/not and save proceeding with the notice visible.

**Commit:** `feat(goals): daily check-in notification and save-time cap notice`

---

## Explicitly out of scope (do not do these)

- Cap alerts on the entry **edit** screen (`entry/[id]`) — new-entry saves
  all route through meal review; note edit-path coverage as a follow-on.
- Per-goal check-in times, more than one check-in, weekly/trend views,
  notification deep links, snooze.
- Remote push of any kind (local notifications only, CLAUDE.md §9).
- Changes to reminders, watchlist, tally math, or analysis.
- PROGRESS/RESULTS edits — plan session's job.

## After the phases (execute-session closeout)

1. Full rungs green, **plus `npm run bundle:check`** (migration 0008).
2. Summarize per phase; call out any spec deviation explicitly.
3. Note for the next test-plan session: Maestro coverage owed for the goal
   editor (set floor → tally shows progress → remove) and the cap notice on
   review; the check-in notification itself needs a device session (owner
   checklist: set a check-in 2 minutes out, verify body copy, then log a
   meal meeting the floor and verify the notification is silently re-armed
   for tomorrow). Migration 0008 needs the real-database check.
