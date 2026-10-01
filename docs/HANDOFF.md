# HANDOFF.md — Execute session: Faster logging, GitHub #26

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§0: synchronous
> transactions; #19's notification-response pattern; #25 My meals — this
> cycle builds on them). **You are on the burn-down branch
> (`worktree-agent-a93006f35a36fc943`) in its worktree** — #19–#25 are
> reviewed but unmerged; this cycle stacks on them. Never touch the main
> checkout.
>
> **JS/TS + one additive migration (owner-approved 2026-10-01)** — no
> dependency, no permission, no native change, no EAS build.

**Planned 2026-10-01 (Opus plan session, owner-reviewed) — GitHub
Michaelafuller/TummyTracker#26.** Done-when (issue): "favourites exist, the
reminder notification opens a quick log, and regular medications can be
logged with one tap." Owner decisions (2026-10-01):

1. **Favourites = My meals (#25), ordered by meal time.** No new concept.
   Where a meal slot is known — from a reminder, or from the time of day on
   Home — saved meals with that slot come first.
2. **Tapping a breakfast/lunch/dinner reminder opens a quick-log screen** for
   that slot: matching My meals first, then the other My meals, then Recent.
   Tapping one opens the prefilled review with the slot set and time = now.
   The notification itself does not change.
3. **A "Regular" switch per medication** — additive column, migration
   **0014**. A regular medication must have a default dose and unit.
   "Took my regular meds" logs exactly the **active** regular medications.
4. **One tap saves at once, with Undo** — one dose event (time = now, each
   medication's default dose + unit). The button is on the Meds tab and the
   quick-log screen.

Plan-session judgments (flag them in your summary; owner may override):
- **Time-of-day slot on Home:** 05:00–10:59 breakfast, 11:00–15:59 lunch,
  16:00–21:59 dinner, otherwise none (plain A–Z). Read once per mount.
- **Quick-log sets the slot:** a meal opened from the quick-log screen gets
  the screen's slot even if the saved meal has another one (the user said
  "this is breakfast" by tapping the breakfast reminder).
- **Undo = delete that one event** (`deleteMedicationEvent`), offered
  inline until the user leaves the screen. After a successful log the button
  is replaced by the "Logged … · Undo" line, so a double tap can't log twice.
- **Backups → v8** (medication rows carry `isRegular`; absent = false).
- Already-scheduled reminders keep working: the tap handler keys on the
  existing `content.data.slot`, so no reschedule is needed.

---

## 0. Invariants — read twice

- **A notification is never a record.** Tapping a reminder only navigates.
  Nothing is logged until the user taps a meal and saves, or taps "Took my
  regular meds".
- **Doses are only ever written by an explicit tap** (CLAUDE.md §0,
  medications): "Took my regular meds" writes one event through the existing
  `createMedicationEvent` — never on a schedule, never from `frequency`.
  Each dose snapshots the medication's default dose/unit at tap time.
- **Copy, never link** for meals (as #25): the quick log copies a template's
  or a past entry's items into the builder.
- Existing behaviour unchanged: Home's existing buttons, Recent, My meals tap/
  Edit, reminders scheduling, the check-in and experiment notification
  handlers.
- Synchronous repository transactions; every interactive element has an
  `accessibilityLabel` and a `testID`; stage by path; LF; no `@ts-ignore` /
  lint disables / bare `any`.

## 1. Schema + migration 0014

`medication.isRegular` — `integer('is_regular', { mode: 'boolean' }).notNull().default(false)`
(mirror how `isActive` is declared). `npm run db:generate` → `0014_*.sql`
must be a single `ALTER TABLE \`medication\` ADD \`is_regular\` …` (paste it
in your summary). Migration harness test like the previous ones.

Backup **v8**: medication rows serialise `isRegular`; `parseBackupJson`
defaults a missing/non-boolean `isRegular` to `false`; v1–v7 files import
unchanged. Tests: v8 round trip, a v7 medication imports as not regular.

Commit: `feat(db): medication is_regular + additive migration 0014, backup v8`.

## 2. Regular medications — pure + repository + form

- `src/lib/medications.ts` (or the closest existing pure module):
  `regularDoses(meds: Medication[]): MedicationDoseInput[]` — active AND
  regular AND `defaultDose > 0` AND a non-empty `doseUnit`, in the order the
  Meds tab lists them; `{ medicationId, dose: defaultDose, doseUnit }`.
- `validateMedication` / the form model: a new `isRegular` boolean in the
  form state and the built medication; **regular requires a default dose and
  a unit** — error on the dose field: "A regular medication needs a default
  dose and unit." (or the unit field when only that's missing; your call,
  say which).
- `MedicationForm.tsx`: a "Regular — I take this every day" switch
  (`accessibilityLabel="Regular medication"`, `testID="medication-regular"`),
  with a one-line hint that it powers "Took my regular meds". Create/update
  pass it through.
- Repository: create/update accept `isRegular`; nothing else changes.

Tests: `regularDoses` (inactive, not regular, missing dose/unit, order),
validation, form switch round trip, repository create/update with the flag.

Commit: `feat(meds): regular medications`.

## 3. "Took my regular meds" — `src/features/medications/RegularMedsButton.tsx`

A self-contained component used on the Meds tab and the quick-log screen:

- Renders nothing when `regularDoses(activeMeds)` is empty.
- Otherwise a button "Took my regular meds" (`testID="regular-meds-log"`,
  accessibilityLabel "Took my regular meds: <names>") with a one-line list
  of what it will log ("Levothyroxine 50 mcg · Vitamin D 1000 unit").
- Tap → in-flight guard → `createMedicationEvent({ takenAt: now, timeKnown:
  true, notes: null }, regularDoses(meds))` → the button is replaced by
  "Logged at 8:02 · Undo" (`testID="regular-meds-undo"`, Undo
  accessibilityLabel "Undo regular meds log"). Undo →
  `deleteMedicationEvent(event.id)` → back to the button. Errors → an Alert,
  nothing else changes.
- Meds tab: place it at the top of the screen's content, above the list.

Tests: hidden with none; tap writes exactly one event with the right doses
(and only active regular ones); a second tap while in flight writes nothing;
Undo deletes that event id; failure shows an Alert.

Commit: `feat(meds): one-tap "Took my regular meds" with Undo`.

## 4. Meal-time ordering + shared launchers

- Pure (`src/lib/savedMeals.ts`): `slotForHour(hour: number): MealSlot | null`
  per the judgment above; `orderSavedMealsForSlot(items, slot)` — items whose
  `meal.mealSlot === slot` first (A–Z), then the rest (A–Z); `slot = null` →
  unchanged A–Z.
- Extract Home's `handleRecentTap` / `handleMyMealTap` / `handleMyMealEdit`
  into a hook `src/features/logging/useBuilderLaunchers.ts` (same in-flight
  guard, same Alert on failure) with an optional `slot` override applied to
  the review prefill's `mealSlot`. Home uses it with no override (behaviour
  identical — existing Home tests must pass unmodified) and orders My meals
  by `slotForHour(new Date(now).getHours())`.

Tests: `slotForHour` boundaries (04:59, 05:00, 10:59, 11:00, 15:59, 16:00,
21:59, 22:00), ordering, the hook's override.

Commit: `feat(logging): meal-time ordering for My meals; shared builder launchers`.

## 5. Quick-log screen + reminder tap

- Route `src/app/quick-log.tsx` (`/quick-log?slot=breakfast`, registered in
  `_layout.tsx` like the other stack screens, title "Log breakfast" etc.).
  Invalid/missing slot → behave as no slot (title "Quick log").
  Content, top to bottom: `RegularMedsButton`; "My meals" (ordered for the
  slot, rows like Home's but without Edit, testID `quick-my-meal-<slug>`);
  "Recent" (`RecentFoodPicker`, same data source as Home); and the two
  existing ways in ("Scan barcode", "Add an entry manually") — those clear
  the builder and also carry the slot into the review prefill (check how the
  scan/manual path builds its prefill; if carrying the slot there needs more
  than a small change, leave them as plain links and say so).
  Tapping a meal → `useBuilderLaunchers({ slot })` → `/meal/review`.
- `src/features/notifications/useMealReminderResponses.ts`, sibling of
  `useExperimentNotificationResponses` (copy its once-per-identifier guard
  and `clearLastNotificationResponse`): a **default tap** on a notification
  whose `content.data.slot` is a `ReminderSlot` → `router.push({ pathname:
  '/quick-log', params: { slot } })`. Pure parser
  `parseMealReminderResponse` in `notifications/model.ts`. Mounted on Home
  next to the other two hooks. Ignores every other slot / action.

Tests: parser (each slot, other slots, non-default action, bad data);
hook navigates once per identifier; quick-log screen renders sections,
orders for the slot, applies the slot to the prefill, hides meds button
with no regular meds; Home still passes unmodified (add the new hook's mock
the way the other two are mocked — that's the only allowed Home-test edit).

Commit: `feat(logging): quick-log screen opened by meal reminders`.

## 6. Definition of done

- `npm run typecheck`, `npm run lint` (0 warnings), `npm run bundle:check`.
- **Targeted Jest only (never the full suite):** files you created/touched,
  all `src/db/__tests__/*`, `src/lib/__tests__/{backup,savedMeals,medications,validation}*`,
  `src/features/{medications,notifications,logging,checkin,experiments}/__tests__/*`,
  `src/app/medication/__tests__/*`, `src/app/meal/__tests__/*`, and via
  `--runTestsByPath`: Home `index.test.tsx`, Meds `meds.test.tsx`,
  `settings.test.tsx` (export/import call sites), plus any new screen test.
- No deps, no schema change beyond §1. Don't run Maestro / EAS / `expo
  start` / adb; don't edit `flows/`, `CLAUDE.md`, `docs/`; don't push or merge.
- If an existing test must change, only because the spec changes that
  behaviour (e.g. backup version 7 → 8, a mock gaining a function) — list
  each one with the reason.
- Commits as listed (stage by path), each as soon as its tests pass, each
  ending `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- **Execute summary:** files per commit + hashes; the generated SQL
  verbatim; rung results; targeted Jest counts; every existing test touched
  and why; deviations; review pointers (the in-flight/Undo guard, the slot
  override path, the response hook's guard).
