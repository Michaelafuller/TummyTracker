# HANDOFF.md — Cycles: check-in persistence fix · dictation-safe inputs · light-theme palette pass · splash/notification palette

> **Read first:** root `CLAUDE.md` (auto-loaded). File paths are from the
> current tree; read the named files before editing.
>
> **Session type:** execute — four independent cycles, in order (each is
> shippable alone; commit per logical change). Definition of done per
> CLAUDE.md §4: `npm run typecheck && npm run lint && npm test` green, tests
> ship with each change. Cycles A–C are pure JS/TS (no new deps, no `.sql`).
> **Cycle D touches `app.json` (native config, baked at build time), so run
> `npm run bundle:check` at closeout** — the owner's next EAS preview build
> will carry this cycle plus the already-pending icon-layer fix.
>
> **Source of these requirements:** owner bug reports + preference direction
> 2026-08-16 (plan session). Root causes below were verified against the code
> during planning — trust the file:line cites but re-read each file before
> editing.

---

## Cycle A — Goals check-in: persist enabled state (bug fix)

**Owner-reported bug:** the daily check-in behaves as a one-off — it fires
once, then the toggle reads OFF and it never fires again. Planning confirmed
this is a real statefulness bug, not a UI bug.

**Root cause (verified):** the user's "check-in enabled" intent is stored
nowhere except as the pending OS notification itself.
`getCheckIn()` (`src/features/goals/checkInService.ts:23-26`) reconstructs
state from `getAllScheduledNotificationsAsync()` via `checkInFromScheduled`
(`src/features/goals/checkInModel.ts:34-42`). Firing consumes the scheduled
notification, so on the next app open `refreshCheckInIfEnabled`
(`checkInService.ts:101-105`) reads `enabled: false` and early-returns — the
re-arm gate is keyed on state that the fire event destroys. The same
conflation causes the known quirk where the toggle won't hold with zero floor
goals (`refreshCheckIn` schedules nothing → toggle snaps back OFF in
`CheckInSection.tsx:44-45`) and silently kills the check-in when the last
floor goal is deleted (`goalsStore.ts:40`).

### Design contract (decided in planning — do not re-litigate)

1. **Persisted prefs become the source of truth for "enabled".** Extend
   `AppPrefs` (`src/lib/prefs.ts`) with flat fields
   `checkInEnabled: boolean`, `checkInHour: number`, `checkInMinute: number`
   (match the existing flat-field style; defaults: disabled, and whatever
   default time `CheckInSection` currently uses). Add a
   `setCheckIn(enabled, hour, minute)` action to
   `src/features/prefs/prefsStore.ts` that sets state + `savePrefs`.
   The service layer (non-React) reads fresh via `loadPrefs()` directly;
   the UI reads via the store. Writes always go through the store setter.
2. **One-time adoption:** if prefs carry no check-in fields (pre-existing
   install) but `checkInFromScheduled` finds a pending check-in, adopt its
   `{hour, minute}` with `enabled: true` and persist. Otherwise default
   disabled. After this, `checkInFromScheduled` is demoted to that adoption
   path only — no runtime state derivation from the OS schedule.
3. **`refreshCheckInIfEnabled` gates on the persisted flag.** The existing
   app-open hook (`src/components/app-providers.tsx:39`), meal-save hook
   (`src/app/meal/review.tsx:109`), and goal-edit hooks
   (`goalsStore.ts:35,40`) then correctly re-arm the day after a fire.
4. **Multi-day continuity — schedule a 7-day horizon, not a single one-shot.**
   Today the reminder dies if the app isn't opened after the fire day (re-arm
   requires app code to run). Fix inside `refreshCheckIn`: after the existing
   cancel-all-check-in-slot step, schedule **today's precise one-shot** (same
   skip-today/body logic as now, `checkInService.ts:63-94`) **plus generic
   one-shots for the following 6 days** using `checkInBodyForFreshDay(floors)`
   — accurate by the local-first invariant (floors only change through the
   app, and any app use re-runs the refresh). All tagged `CHECK_IN_SLOT` so
   the existing cancel sweep clears the whole horizon on every refresh.
   Every app open/save/goal edit slides the horizon forward. Keep the
   one-shot `DATE` trigger design — the doc comment's rationale
   (`checkInService.ts:48-56`) still holds; update that comment to describe
   the horizon and the persisted flag.
5. **Toggle semantics with zero floors:** enabling with no floor goals keeps
   the switch ON (flag persists true; nothing is scheduled since caps never
   notify). `CheckInSection` shows a hint like "Add a floor goal to get
   check-ins." Deleting the last floor while enabled keeps the flag —
   notifications stop, and adding a floor later re-arms via the existing
   goalsStore hook. This resolves the "Known v1 quirk" in PROGRESS.md.

### Files

- `src/lib/prefs.ts` — new fields + defaults (pure, unit-tested).
- `src/features/prefs/prefsStore.ts` — `setCheckIn` action.
- `src/features/goals/checkInService.ts` — `getCheckIn` reads prefs (+
  adoption), `refreshCheckInIfEnabled` gates on flag, `refreshCheckIn`
  schedules the 7-day horizon, `disableCheckIn` persists `enabled: false`.
- `src/features/goals/CheckInSection.tsx` — toggle drives the store setter;
  no-floors hint; state no longer re-derived from the OS schedule.
- `src/features/goals/checkInModel.ts` — `checkInFromScheduled` kept for
  adoption only (update its doc comment).

### Tests (the regression that matters most)

- **`refreshCheckInIfEnabled` with persisted `enabled: true` and
  `getAllScheduledNotificationsAsync` returning `[]` (the post-fire state)
  MUST schedule.** This is the exact untested gap: the current
  `checkInService.test.ts` `beforeEach` mocks the scheduled list empty and
  nothing asserts behavior there.
- Horizon: refresh schedules 7 notifications (or 6 when today is skipped),
  all slot-tagged; a second refresh cancels all before rescheduling.
- Toggle ON with zero floors persists true and stays ON; disable persists
  false; deleting last floor keeps flag; adoption path (no prefs + pending
  notification → adopted and persisted).
- Update: `checkInService.test.ts`, `goals.test.tsx` (CheckInSection),
  `goalsStore.test.ts` as needed; add `prefs` unit coverage for new fields.

**Commits:** `fix(goals): persist check-in enabled state in prefs` ·
`fix(goals): schedule 7-day check-in horizon for missed-open continuity`
(split if natural, one is fine too).

---

## Cycle B — Dictation-safe text inputs (bug fix)

**Owner-reported bug:** speech-to-text (Apple keyboard dictation) doubles the
text — the streamed transcription appears, then the final commit is inserted
again on unfocus.

**Root cause (verified):** every text input in the app is fully controlled
(`value` + `onChangeText`) through the single shared wrapper
`ThemedTextInput` (`src/components/form-fields.tsx:38-55`). iOS dictation
inserts provisional *marked text*; each streamed update triggers
onChangeText → setState → re-render → RN pushes `value` back into the native
field, invalidating the marked-text session, so the final recognition
*inserts* instead of *replaces*. This is the long-standing RN
controlled-input/dictation issue (New-Architecture era included). The app's
own handlers are clean — no `onEndEditing`, no append-on-blur anywhere
(grep-verified), so the fix belongs entirely in the wrapper. Android voice
typing benefits too.

### Fix (one place fixes all call sites)

Make `ThemedTextInput` uncontrolled during user editing, synced natively only
on programmatic change:

- Render with `defaultValue={value}` (initial) instead of `value`; hold a
  `ref` to the `TextInput`.
- Wrap `onChangeText` to record the last user-reported text in a ref, then
  forward.
- Effect: when the incoming `value` prop differs from the last user-reported
  text (a *programmatic* write), push it natively via
  `ref.current?.setNativeProps({ text: value })` and update the ref.
- No call sites change. The programmatic-write paths that must keep working:
  OFF search-result fill (`src/features/logging/ComponentForm.tsx:89-92`),
  serving-size rescale (`ComponentForm.tsx:111-128` + the `LogEntryForm`
  equivalent), and form resets.
- **Fallback** if `setNativeProps({text})` proves unreliable under Fabric in
  tests: keep `defaultValue` and force a remount on programmatic change via a
  `key` derived from a programmatic-write counter. Pick whichever passes the
  test contract below; note the choice in the commit message.

### Tests

- `fireEvent.changeText` cannot reproduce dictation (native marked-text
  behavior) — tests assert the **wrapper contract** instead:
  user-typed changes round-trip through `onChangeText` without the wrapper
  pushing text back; a programmatic `value` change does reach the input.
- Existing form tests (`ComponentForm.test.tsx`, `component.test.tsx`,
  `review.test.tsx`, `entry/[id].test.tsx`, etc.) use
  `fireEvent.changeText` and RNTL display-value queries — update any that
  assert the controlled `value` prop directly.
- Real confirmation is device-only: an ACCEPTANCE.md manual line is owed
  ("dictate into Name and Notes — text appears exactly once"), both iOS
  dictation and Android voice typing. Flag it for the next test-plan session.

**Commit:** `fix(components): stop controlled re-renders clobbering dictation
in ThemedTextInput`.

---

## Cycle C — Light-theme palette pass (owner preference)

**Owner direction:** (1) replace black text in light mode with the darkest
palette color if accessible; (2) action buttons should come from the palette,
not black/white (discretion delegated — decisions below); (3) find other
theme-translation gaps, especially the purples the owner loves that are
missing from light mode.

**Audit findings (verified during planning):** the palette
(`src/constants/theme.ts`) has no black — body text already uses
`text #1A1016` (near-black plum, the darkest palette color: 18.6:1 on white
cards, 17.2:1 on the `#F2F7F7` canvas — AAA, so ask 1 is satisfied by
construction). The *actual* black-text source is `src/app/_layout.tsx:10`,
which hands react-navigation its **stock** themes — light-mode stack headers
render stock white/near-black/iOS-blue instead of the palette. The "black
buttons" are the inverted-fill idiom: `backgroundColor: theme.text` + label
`color: theme.background` at ~10 sites. The only purple anywhere is dark
mode's `textSecondary #B7ADCF`; light mode replaced that hue with teal-gray.

### Design contract (decided in planning — do not re-litigate)

1. **Navigation themes from the palette** (`src/app/_layout.tsx`): build
   custom themes by spreading `DefaultTheme`/`DarkTheme` and overriding
   `colors.{primary, background, card, text, border}` from `Colors.light`/
   `Colors.dark` (use `link` for `primary` — the nav tint must work as text;
   teal `#5BC0BE` is only 2.16:1 on white and must never be light-mode
   text/icon color). Replace the scan-screen header hardcodes
   (`_layout.tsx:30-32`) with `Colors.dark` tokens (it stays always-dark
   over the camera — that's deliberate; keep the code comment).
2. **New `accent`/`accentText` tokens** in both modes — this is how purple
   arrives in light mode:
   - light: `accent #4F4370` (deep violet), `accentText #FFFFFF` — 8.86:1.
   - dark: `accent #B7ADCF` (the existing lavender), `accentText #1A1016`
     — ≈8.8:1.
3. **Light `textSecondary` → `#5C4E6E`** (dark plum: 7.58:1 on white, 7.01:1
   on canvas — AAA). Dark mode unchanged. Inactive tab tint, chart mid-bands
   (`MiniHistogram`, `BarMeter`), placeholders inherit automatically.
4. **Primary CTAs → `primary`/`primaryText`** (`#5BC0BE`/`#0D2426`, 7.50:1,
   already the styles of the home CTA and insights badges — this unifies the
   app's two competing CTA styles). Extract a shared **`PrimaryButton`**
   component (Pressable + label, disabled opacity, `accessibilityLabel`
   passthrough) — the five submit buttons are near-identical copies. Sites:
   `LogEntryForm.tsx:215-216`, `ComponentForm.tsx:255,263-264` (secondary
   button border → `theme.border`), `BmForm.tsx:94-95`,
   `SymptomForm.tsx:99-100`, `review.tsx:240-242`, `GoalsSection.tsx:152-153`,
   `WatchlistSection.tsx:115-116`, `scan.tsx:61-62` ("Grant access"), and the
   scan screen's "Enter manually" pill (`scan.tsx:153,164`) → primary fill
   (reticle/hint stay white over the camera).
5. **Selected states → `accent`** (purple where the eye lingers):
   `segmented-control.tsx:45-46,52` (selected chip fill), goal-direction
   chips `GoalsSection.tsx:118-119,125`, and the calendar in
   `(tabs)/explore.tsx:62,72-74` (selected-day background, dots, arrows —
   currently `theme.text`, i.e. black circles in light mode).
6. The off-palette splash/notification blues are **Cycle D** (owner rolled
   them into this release 2026-08-16).

### Tests

- `goals.test.tsx:132-153` asserts `Colors.light.*` values on chips — update
  to `accent`. Add `PrimaryButton` interaction/render tests; update any test
  asserting the old inverted-fill styles.
- Rungs green; **visual verification is owner-owed on device** (light + dark
  walkthrough). The theme touches shared infra, so a full Maestro re-run is
  owed after this cycle (Tier 4 note already covers this; flows assert
  text/testIDs, not colors, so YAML changes are unlikely).

**Commits (suggested split):** `feat(theme): accent tokens + plum secondary
for light mode` · `feat(theme): palette-driven navigation themes` ·
`refactor(components): shared PrimaryButton on primary tokens` ·
`feat(theme): accent selected states (chips, calendar)`.

---

## Cycle D — Splash & notification colors onto the palette (owner preference)

**Owner direction:** replace the template-leftover blues (`#208AEF` family)
with palette colors; color choice delegated — decisions below.

**Verified state:** the native splash (`app.json` expo-splash-screen plugin,
line 45) is blue `#208AEF`; the JS splash overlay
(`src/components/animated-icon.tsx:129`, `backgroundSolidColor`) is the same
blue and MUST stay identical to the native splash or boot visibly clashes.
`assets/images/splash-icon.png` is a white stomach-logo silhouette (checked
visually — it needs a colored field behind it). The `expo-notifications`
plugin color (`app.json:62`) is also `#208AEF`, while the top-level
`notification.color` (`app.json:37`) is already correct teal `#5BC0BE`.
The `AnimatedIcon` component (blue gradient + `expo-logo.png`) is **dead
code** — grep-verified: only `AnimatedSplashOverlay` is imported anywhere
(`_layout.tsx:4`).

### Design contract (decided in planning — do not re-litigate)

1. **Splash background → `#0D1C20`** (the palette's dark background) in BOTH
   places, exactly matching: `app.json` expo-splash-screen `backgroundColor`
   AND `animated-icon.tsx` `backgroundSolidColor`. This matches the adaptive
   icon background (`app.json:20`), making launcher-tap → splash seamless,
   and the white logo silhouette sits on it cleanly. One dark brand splash
   for both modes — no `dark` variant config needed.
2. **`expo-notifications` plugin color → `#5BC0BE`** (align with
   `notification.color` at `app.json:37`).
3. **Delete the dead `AnimatedIcon` export** rather than recoloring its
   gradient: remove `AnimatedIcon` from `animated-icon.tsx` and
   `animated-icon.web.tsx`, plus whatever becomes unreferenced with it
   (`animated-icon.module.css` gradient, `expo-logo.png`, `logo-glow.png`,
   the unused keyframes) — verify each is truly unreferenced (grep, then
   rungs) before deleting; keep `AnimatedSplashOverlay` working on both
   platforms. If anything turns out to be referenced after all, recolor its
   gradient to `#5BC0BE → #0F6E6C` instead and note it in the summary.

### Tests / verification

- Rungs green + **`npm run bundle:check`** (this cycle's changes are exactly
  the kind the three rungs can't see).
- Splash/notification colors are baked at build time — **visible only after
  the owner's next EAS preview build** (which also delivers the pending
  icon-layer fix). Flag in the execute summary.

**Commits (suggested):** `feat(assets): palette splash and notification
colors` · `chore(components): remove dead AnimatedIcon template leftovers`.

---

## Closeout

- All three rungs green at HEAD, plus `npm run bundle:check` (Cycle D).
- Brief execute summary (what shipped, deviations, anything discovered) for
  the next test-plan session, which owes: check-in re-arm live test update
  (the PROGRESS "live check-in test" steps change — re-arm is now
  horizon-based), dictation manual ACCEPTANCE line, light/dark visual pass,
  full Maestro re-run after the theme change, and the splash/notification
  visual check after the owner's next EAS build.
