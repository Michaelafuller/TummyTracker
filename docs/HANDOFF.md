# HANDOFF.md — Execute session: Medication reminders, GitHub #29

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§0: synchronous
> transactions; the #13 day check-in's action-button notifications and
> serialized refresh — this cycle mirrors them; medications #4–#11/#20/#26/#28).
> **You are on the burn-down branch (`worktree-agent-a93006f35a36fc943`) in
> its worktree** — #19–#26 and #28 are reviewed but unmerged; this cycle
> stacks on them. Never touch the main checkout.
>
> **JS/TS + one additive migration (owner-approved 2026-10-01)** — no
> dependency (`expo-notifications` is approved and already used), no new
> permission (notifications are pre-approved), no native change, no EAS build.

**Planned 2026-10-01 (Opus plan session, owner-reviewed) — GitHub
Michaelafuller/TummyTracker#29.** Owner-requested: local reminders from a
structured schedule; a reminder must never become a dose record by itself.
Owner decisions (2026-10-01):

1. **New table `medication_reminder`** (migration **0016**, backups
   **v10**): medication, time, weekdays, on/off. Several per medication.
2. **One notification per time, grouping every medication due then**
   ("Levothyroxine, Vitamin D"), with a **"Took them"** button that opens
   the app and saves ONE dose event at that moment (current default doses),
   then offers Undo. **Tapping the notification body** opens the dose entry
   form with those medications ticked.
3. **Set up in the medication's add/edit form** — a "Reminders" block.
4. **Any active medication** can have reminders; the **"Took them" button
   only appears when every medication due at that time has a default dose
   and unit** — otherwise the notification has only the tap-to-open path.

Plan-session judgments (flag them in your summary; owner may override):
- **Schedule shape:** one repeating `WEEKLY` trigger per (weekday, hour,
  minute) that has ≥ 1 enabled reminder of an **active** medication. A
  medication marked inactive keeps its reminder rows but they aren't
  scheduled; reactivating schedules them again.
- **Recheck at tap time:** "Took them" re-reads the medications listed in
  the notification; it logs only those still **active with a default dose
  + unit**, at their **current** defaults, `takenAt = now`, `timeKnown =
  true`, `reason = null`. If none qualify, it opens the prefilled entry form
  instead. Never logs from stale scheduling-time data.
- **Undo** = an `Alert`: "Logged Levothyroxine 50 mcg, Vitamin D 1000 unit
  at 8:02 AM." with [Undo] [OK]; Undo → `deleteMedicationEvent` of exactly
  that event.
- **Weekdays default to every day**; a reminder with no weekday selected
  is invalid ("Pick at least one day.").
- **Refresh points:** after a medication (with its reminders) is saved,
  marked active/inactive, after a backup import, and on app open/resume
  (next to `refreshDayCheckInIfEnabled` in `app-providers.tsx`).

---

## 0. Invariants — read twice

- **A reminder never writes a dose on its own.** Doses are written only by
  the "Took them" action handler (an explicit tap) through
  `createMedicationEvent`, or by the existing entry form.
- **Each (notification, action) is handled once** (copy the day check-in's
  `handled` key + `clearLastNotificationResponse` + `dismissNotificationAsync`).
- **Own slot only:** cancelling/rescheduling touches only notifications whose
  `content.data.slot === 'med-reminder'`; meal reminders, the day check-in,
  the Goals check-in and experiment reminders are untouched. The refresh is
  **serialized** like `refreshDayCheckIn` (two overlapping refreshes must
  not double-schedule).
- `opensAppToForeground: true` on the action (no background runner).
- Synchronous repository transactions; `accessibilityLabel` + `testID` on
  everything interactive; stage by path; LF; no `@ts-ignore` / lint
  disables / bare `any`.

## 1. Schema + migration 0016 + backup v10

```ts
export const medicationReminder = sqliteTable(
  'medication_reminder',
  {
    id: text('id').primaryKey(),
    medicationId: text('medication_id').notNull(),
    hour: integer('hour').notNull(),       // 0-23
    minute: integer('minute').notNull(),   // 0-59
    /** Bit 0 = Monday ... bit 6 = Sunday; 127 = every day. Never 0. */
    daysMask: integer('days_mask').notNull().default(127),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('medication_reminder_medication_id_idx').on(table.medicationId)],
);
```

`npm run db:generate` → CREATE TABLE + CREATE INDEX only (paste it).
Migration harness test. Backups v10: rows exported; `parseBackupJson`
normalises (drop rows with out-of-range hour/minute or a mask outside
1..127); restore preserves ids and skips an id that exists; v1–v9 import
with none. Tests: v10 round trip, v9 file, bad rows dropped.

Commit: `feat(db): medication_reminder table + additive migration 0016, backup v10`.

## 2. Pure model — `src/features/medications/reminderModel.ts`

- Constants: `MED_REMINDER_SLOT = 'med-reminder'`, two category ids
  (`MED_REMINDER_CATEGORY_TOOK` with the button, `MED_REMINDER_CATEGORY_PLAIN`
  without), `MED_REMINDER_TOOK_ACTION`.
- Weekday mask helpers (`maskHas`, `maskFromDays`, `daysFromMask`, labels
  M T W T F S S) and the mapping to expo's WEEKLY `weekday` (**1 = Sunday …
  7 = Saturday** — test it).
- `reminderSlots(meds, reminders): Slot[]` — group enabled reminders of
  active medications by (weekday, hour, minute) → `{ weekday, hour, minute,
  medicationIds (Meds-list order), canTake }` where `canTake` = every listed
  medication has `defaultDose > 0` and a non-empty unit.
- `reminderTitle/Body(names)` — "Medication reminder" / "Time for
  Levothyroxine and Vitamin D" (1, 2, 3+ names: "A, B and C").
- `parseMedReminderResponse(r)` → `{ kind: 'took' | 'open', medicationIds }`
  or null (other slots, unknown actions, bad data → null). Default tap →
  `open`; the took action → `took`.
- `tookDoses(meds, medicationIds)` → the `MedicationDoseInput[]` per the
  tap-time recheck rule (reuse #26's `regularDoses` rules for "has a dose";
  `reason: null`).
- `validateReminder` (hour/minute range, mask non-zero).

Tests for all of it, including grouping two meds at the same time, a
weekday only one of them has, an inactive med dropped, `canTake` false when
one lacks a dose, the Sunday mapping, and the parser's rejections.

Commit: `feat(meds): reminder model — weekdays, grouped slots, response parsing`.

## 3. Repository + form

- Repository: `listMedicationReminders()`, a live hook
  `useMedicationReminders()`, and `createMedication` / `updateMedication`
  accept `reminders: ReminderInput[]` and **replace** that medication's
  reminder rows in the **same** sync transaction as the medication write.
  Real-SQLite tests incl. atomicity (a failing reminder insert rolls back
  the medication write).
- `MedicationForm.tsx` + `formModel.ts`: a "Reminders" block —
  each row: `TimeField` (`src/components/time-field.tsx`), weekday chips
  (`testID="reminder-<i>-day-<0..6>"`, labels "Monday" … for a11y), an
  on/off switch (`testID="reminder-<i>-enabled"`), "Remove"
  (`testID="reminder-<i>-remove"`); "Add reminder" (`testID="reminder-add"`,
  default 08:00, every day). If the medication has no default dose + unit,
  a one-line hint: "Add a default dose to get a 'Took them' button on the
  reminder." Validation errors shown per row.
- New and edit medication screens pass the reminders through and call the
  refresh (§4) after a successful save and after Mark active/inactive.

Tests: form model round trip, validation, the form's add/remove/day toggle,
the hint, screens call the refresh.

Commit: `feat(meds): reminders in the medication form`.

## 4. Scheduling — `src/features/medications/reminderService.ts`

- `ensureMedReminderCategories()` — the two categories; the took category's
  single action `{ identifier: MED_REMINDER_TOOK_ACTION, buttonTitle: 'Took
  them', options: { opensAppToForeground: true } }`.
- `refreshMedicationReminders()` — **serialized** (copy the
  `refreshQueue` pattern): read meds + reminders, cancel own-slot
  notifications, `ensureAndroidChannel` + categories, then for every slot
  schedule a `WEEKLY` trigger (`weekday`, `hour`, `minute`, `channelId`),
  content = title/body, `categoryIdentifier` = took/plain per `canTake`,
  `data = { slot: MED_REMINDER_SLOT, medicationIds, hour, minute, weekday }`.
  When there are no slots it only cancels. It does not request permission
  (the form asks via the existing `ensureNotificationPermission` when the
  first reminder is added — if permission is denied, show the same notice
  meal reminders show and still save).
- Call sites: app open/resume in `app-providers.tsx` (fire-and-forget, next
  to the day check-in's), medication save / active toggle, backup import.

Tests (mock `expo-notifications` as the day check-in tests do): cancels
only its own slot, schedules one WEEKLY per slot with the right weekday
number and category, no slots → cancel only, two overlapping refreshes don't
double-schedule.

Commit: `feat(meds): schedule grouped medication reminders`.

## 5. Responses — `src/features/medications/useMedReminderResponses.ts`

Mounted on Home next to the other three hooks. For a parsed response:
- `took`: `tookDoses(current meds, medicationIds)`; if empty → navigate as
  `open`. Otherwise `createMedicationEvent({ takenAt: Date.now(), timeKnown:
  true, notes: null }, doses)`, then the Undo `Alert` (judgment above).
- `open`: `router.push({ pathname: '/medication/entry/new', params: {
  medicationIds: ids.join(',') } })`. `entry/new` gains support for that
  param: those active medications' lines start **selected** (unknown or
  inactive ids ignored); without the param, today's behaviour exactly.
- Both: the once-per-(identifier, action) guard, `dismissNotificationAsync`,
  `clearLastNotificationResponse` (best-effort, like the day check-in).

Tests: parser covered in §2; the hook logs exactly once for a took
response (re-render doesn't re-log), uses current defaults, skips an
inactive/no-dose med, falls back to `open` when none qualify, Undo deletes
that event id, `open` navigates with the ids, ignores other slots; entry/new
preselects from the param; Home test gains only the new hook's mock.

Commit: `feat(meds): "Took them" and tap-to-open from medication reminders`.

## 6. Definition of done

- `npm run typecheck`, `npm run lint` (0 warnings), `npm run bundle:check`.
- **Targeted Jest only (never the full suite)** — check `FAIL` lines and the
  `Test Suites:` count, not just `Tests:`: files you created/touched, all
  `src/db/__tests__/*`, `src/lib/__tests__/{backup,medications,medicationEntry}*`,
  `src/features/{medications,notifications,checkin,experiments,backup}/__tests__/*`,
  `src/app/medication/**/__tests__/*`, `src/components/__tests__/*` (if
  `app-providers` has tests), and via `--runTestsByPath`: Home
  `index.test.tsx`, Meds `meds.test.tsx`, `settings.test.tsx`, and the
  medication `[id]` tests.
- No deps, no schema change beyond §1. Don't run Maestro / EAS / `expo
  start` / adb; don't edit `flows/`, `CLAUDE.md`, `docs/`; don't push or merge.
- If an existing test must change, only because the spec changes that
  behaviour (backup 9 → 10, a mock gaining a function, Home's new hook
  mock) — list each with the reason.
- Commits as listed (stage by path), each ending
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- **Execute summary:** files per commit + hashes; the generated SQL
  verbatim; rung results; targeted Jest counts (suites + tests); a worked
  example from a test (two meds' reminders → the scheduled notifications);
  every existing test touched and why; deviations; review pointers (the
  once-only guard, the tap-time recheck, own-slot cancel, the weekday
  mapping, the serialized refresh).
