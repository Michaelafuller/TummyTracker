# ACCEPTANCE.md — On-device checklist

## Where this fits in the development cycle

TummyTracker development runs as a repeating **plan → execute → test-plan →
test-execute** loop, each step in a fresh Claude session with no shared context.
`docs/TEST_STRATEGY.md` is the canonical description; the summary:

| # | Session | Model | Role |
|---|---------|-------|------|
| 1 | **Plan** | Opus (`opusplan`) | Reads `PROGRESS.md` + `docs/RESULTS.md` + codebase → writes `docs/HANDOFF.md` |
| 2 | **Execute** | Sonnet (Auto) | Reads `HANDOFF.md` → implements feature + Jest tests → rungs green → writes brief summary |
| 3 | **Test-plan** | Opus/Sonnet | Reads Session 2 summary + `docs/E2E.md` → updates this file's structure + writes a *test-backfill* `HANDOFF.md` |
| 4 | **Test-execute** | Sonnet (Auto) | Reads test `HANDOFF.md` + `docs/E2E.md` → writes Maestro flows → runs `npm run e2e` on Pixel 5 → reads `flows/results.xml` → writes `docs/RESULTS.md` → flips `[ ]`→`[x]` below |

> Flow authoring is **step 4**, not bundled into Execute (step 2) — the Execute
> session has no device to run flows on. See `docs/TEST_STRATEGY.md §2`.

**Automated items** — marked `· auto` below — are driven by Maestro and updated by
the **test-execute** session (step 4) without human intervention. See `docs/E2E.md`
for the full flow map and run protocol.

**Manual items** — marked `· manual` — need the owner's eyes or hands (camera,
notification timing, visual contrast). They stay `[ ]` until you verify them.

---

## Building and deploying

```bash
npm install
npm run bundle:check       # expo export — catches Metro/Babel bugs the rungs miss
eas login                  # set NODE_EXTRA_CA_CERTS if behind a corporate proxy
eas build --profile preview --platform android   # standalone APK, runs offline
adb install -r path/to/app.apk                   # over USB — no Wi-Fi needed
```

For JS-only changes (no native rebuild needed):
```bash
npx expo start --dev-client
adb reverse tcp:8081 tcp:8081   # tunnel Metro over USB (corporate Wi-Fi often blocks it)
```

(`eas.json` profiles are committed. Claude never runs EAS — those commands touch
your account and device.)

## How the test-execute session (step 4) updates this file

```bash
maestro test flows/ --format junit --output flows/results.xml
```

The test-execute session reads `flows/results.xml`. Each passing `<testcase>` flips
`[ ]` → `[x]` for the matching item below. Failures get a one-line note and go in
`docs/RESULTS.md`. Manual items stay `[ ]`.

---

> **2026-08-16/17 test-execute run (second resume): 23/23 flows passed, 0
> failed.** The app-bug from the prior blocked run (dev-mode `Slot` crash on
> array-style props) was fixed at `283d147` and is confirmed resolved. This
> run also discovered and fixed a dev-client connection gap (Maestro's
> `launchApp` never left the dev client auto-connected to Metro — every flow
> needed an explicit reconnect step, added via `flows/_helpers/reconnect-dev-client.yaml`)
> plus three flow-bugs unrelated to the app-bug or the reconnect gap. None of
> these were app regressions — see `docs/RESULTS.md` for the full breakdown.
> All `[ ]` → `[x]` flips below are backed by a passing `<testcase>` in
> `flows/results.xml` from this run.

## Phase 0 — Scaffold
- [x] App launches on the Pixel 5 (dev build) without a redbox. · auto `flows/00-launch.yaml`
- [x] A placeholder home screen renders. · auto `flows/00-launch.yaml`

## Phase 1b — Manual entry
- [x] Add a meal manually (now a two-screen flow: component confirm → meal review):
      name, ingredients, nutrition, then slot, time, notes, sentiment. · auto
      `flows/01b-manual-entry.yaml`
- [x] The Notes field's live char counter tracks what's typed (e.g. "67/500").
      · auto `flows/01b-manual-entry.yaml` — the 500-char maxLength clamp
      itself is Jest-covered (`src/lib/__tests__/validation.test.ts`
      `validateNotes`), not re-verified on-device: injecting 500+ chars via
      Maestro's `inputText` hit a deterministic ~400-char ceiling on this
      device/IME (see docs/RESULTS.md), so the flow types a short realistic
      note and asserts the counter instead.
- [x] Entry persists across an app restart (SQLite). · auto `flows/01b-manual-entry.yaml`

## Phase 1c — Barcode
- [ ] Scan a real product barcode; nutrition pre-fills from Open Food Facts. · manual (camera)
- [x] Scan an unknown/again-no-network barcode; it drops into the component-confirm
      form with the barcode attached. · auto `flows/01c-barcode-fallback.yaml`
      (manual-fallback path only)

## Phase 1d — Browse & edit
- [x] Entries are grouped by day. · auto `flows/01d-browse-edit.yaml`
- [x] Day / week / month calendar toggle works. · auto `flows/01d-browse-edit.yaml` · auto `flows/journal-calendar.yaml` (toggle + collapse/expand)
- [x] Open a past entry, add/change its sentiment, save; the change sticks. · auto `flows/01d-browse-edit.yaml`

## Phase 1e — Reminders
- [x] Configure a reminder time; the OS permission prompt appears. · auto `flows/01e-reminders.yaml`
- [ ] Receive the local notification at the scheduled time; tapping it opens the app. · manual (timing)

## Phase 2 — Bowel-movement tracking
- [x] Quick-add a bowel movement (optional Bristol 1–7). · auto `flows/02-bm-tracking.yaml`
- [x] It renders distinctly in the list/calendar. · auto `flows/02-bm-tracking.yaml`
- [x] Filter by type (meals / BMs / both) works. · auto `flows/02-bm-tracking.yaml`
- [x] Pre-existing entries still load after the migration. · auto `flows/02-bm-tracking.yaml`

## Phase 3 — Insights
- [x] With some seeded data, the Insights screen shows a sensible finding and its
      supporting sample size. · auto `flows/03-insights.yaml`
- [x] Findings read as observations, never medical advice. · auto `flows/03-insights.yaml`

---

## Post-MVP · Sat fat + Flagship Trio  *(accepted 2026-06-28)*

### A · Saturated fat
- [x] Sat. fat (g) appears in the nutrition grid between Fat and Carbs.
- [x] Entered value persists across app restart. · auto `flows/ab-satfat-ingredients.yaml`
- [x] Barcode scan pre-fills saturated fat when OFF has the value.
- [x] Blank value saves without errors.

### B · Ingredient capture
- [x] Manual-entry form has "Ingredients (optional)" text area above the Nutrition section.
- [x] Manually typed ingredients persist on re-open. · auto `flows/ab-satfat-ingredients.yaml`
- [x] Barcode scan pre-fills ingredients from OFF.
- [x] Type selector shows Meal and Snack only (no Symptom/BM leak).

### C · Symptom logging
- [x] 🤢 Log symptom button present on Home screen.
- [x] Symptom form opens as a modal with When, Symptom type (9 chips), Severity (1–5), Notes.
- [x] All fields optional; saving with nothing selected produces an entry named "Symptom".
- [x] Saving with a type produces the correct name (e.g. "Bloating").
- [x] Symptom entries show 🤢 prefix and correct subtitle in the journal list. · auto `flows/c-symptom-logging.yaml`
- [x] Journal Symptom filter works; Food filter excludes symptoms. · auto `flows/c-symptom-logging.yaml`
- [x] Edit flow loads saved type and severity. · auto `flows/c-symptom-logging.yaml`
- [x] Existing meal/BM entries unaffected. · auto `flows/c-symptom-logging.yaml`

### D · Ingredient → sentiment correlation
- [x] "Ingredients you react to" section appears in Insights when threshold is met. · auto `flows/d-ingredient-insights.yaml`
- [x] Cards cite average sentiment and number of meals. · auto `flows/d-ingredient-insights.yaml`
- [x] Well-rated tags do not appear.

### E · Temporal meal → outcome correlation
- [x] "Timing patterns" section appears in Insights when a tag's hit rate exceeds baseline. · manual (timing-dependent — 24h window can't be constructed deterministically in clearState)
- [x] Card body quotes hit count, meal count, hit %, and baseline %.
- [x] Tags where hit rate equals baseline are suppressed.
- [x] Section carries "Observation only" framing.
- [x] Insights summary correctly separates food / BM / symptom counts. · auto `flows/e-temporal-insights.yaml`

---

## Post-MVP · 2026-07-02 cycle (bug batch + meal builder + insights v2)

### Notes / clock / theme (bug batch)
- [x] Notes accept up to 500 chars; counter blocks overflow. · unit-tested
      (`src/lib/__tests__/validation.test.ts` `validateNotes`); the counter's
      live wiring is flow-verified but the exact 500-char overflow is not
      re-driven on-device — see the Phase 1b note above and docs/RESULTS.md.
- [ ] All displayed times use a 12-hour clock (e.g. "3:07 PM") across journal, forms, reminders. · manual (visual)
- [ ] Light mode reads as one cohesive palette (white cards on tinted canvas; links/errors use theme tokens). · manual (visual)
- [ ] iOS app icon shows the TummyTracker icon (not the default Expo icon). · manual (iOS device / EAS build)

### Meal builder · multi-scan grouped meals
- [ ] Scan an item → confirm (one serving assumed) → "Add & scan next" chains another scan. · manual (camera)
- [ ] "Finish meal" opens the review screen with aggregated nutrition and one meal-level sentiment. · manual (camera)
- [ ] Saved grouped meal shows "· N items" in its journal subtitle. · manual (camera path to create; render is `flows`-adjacent)
- [ ] Editing the meal shows a read-only "In this meal" component list. · manual (camera path to create)
- [ ] Migration 0006 applies cleanly over an existing on-device database. · manual (device)
- [ ] Backup export/import round-trips grouped meals (and still imports v1 backups). · manual (file round-trip)

### Insights v2
- [x] Insights tab renders (Trend / findings / confidence chips) without redbox. · auto `flows/03-insights.yaml`
- [ ] Ingredient/food findings are baseline-relative with a confidence chip + mini-histogram. · manual (needs seeded data volume)
- [ ] "Combinations" surfaces an ingredient pair worse than either alone. · manual (needs seeded data volume)
- [ ] Trend chart shows weekly average sentiment. · manual (visual)

## Post-MVP · UX polish sprint  *(2026-06-28)*

### UX-1 · Home title wrapping
- [ ] Open the app on any screen width — "TummyTracker" renders on one line (font shrinks to fit; the last "r" no longer wraps). · manual (visual)

### UX-2 · Theming
- [ ] Segmented-control (journal filter): unselected chips are visibly lower-emphasis than the selected chip in **both** light and dark mode. · manual (visual)
- [ ] No transparent/invisible themed element visible in dark mode on the home or settings screens. · manual (visual)

### UX-3 · Scan screen
- [ ] Scan screen header close/back button legible (dark header background, white tint). · manual (visual)
- [ ] "Enter manually" pill button visible on the live camera viewfinder — floats with shadow, not invisible against a dark scene. · manual (visual)
- [ ] "Scan barcode" primary CTA on the Home screen visible in dark mode (was transparent before the null-scheme fix). · auto `flows/ux3-scan-screen.yaml` (presence; contrast is manual)

---

## Post-MVP · Tier-0 sprint  *(2026-06-28)*

### F · Serving-size scaling
- [ ] Scan a barcode; if the product has a `serving_quantity`, the serving field defaults to it (not 100 g). · manual (camera)
- [ ] Edit the serving size field; all nutrition values rescale proportionally. · manual (requires barcode pre-fill)
- [x] Serving size persists — reopen the entry and the value is unchanged. · auto `flows/f-serving-size.yaml`
- [x] Entering serving size 0 or blank does not crash; nutrition is left as-is. · auto `flows/f-serving-size.yaml`

### G · Native date/time picker
- [x] Tap the date chip in any log form (meal, BM, symptom) — the OS native date picker appears. · auto `flows/g-datetime-picker.yaml`
- [x] Tap the time chip — the OS native time picker appears. · auto `flows/g-datetime-picker.yaml`
- [x] "Now" button sets both chips to the current date and time. · auto `flows/g-datetime-picker.yaml`
- [x] Chosen date/time persists after saving. · auto `flows/g-datetime-picker.yaml`
- [ ] iOS: the time picker stays open while scrolling and commits only on "Done" (no premature dismissal). · manual (iOS device)

### H · Recent foods quick-add (searchable, 2026-07-02)
- [x] Log two different meals. Return to the Home screen — a "Recent" search field + suggestion rows appear below the CTAs. · auto `flows/h-recent-foods.yaml`
- [x] Type in the search field to filter; tap a suggestion — the new-entry form opens pre-filled with that food's name, nutrition, ingredients, and notes; the date/time defaults to *now* (not the original log time). · auto `flows/h-recent-foods.yaml`
- [x] Save the pre-filled entry — it appears as a new distinct entry in the journal. · auto `flows/h-recent-foods.yaml`
- [ ] The suggestions dedupe by name and are ranked prefix-before-substring. · manual (ranking check)

### I · Backup export + import
- [x] Settings screen shows "Export data" and "Import data" buttons. · auto `flows/i-backup.yaml` · auto `flows/settings-smoke.yaml`
- [x] Tap Export — the OS share sheet appears offering the `tummytracker-backup.json` file. Save it to Files. · auto `flows/i-backup.yaml` (no-crash only; file content is manual)
- [ ] Open the saved JSON in a text editor — it contains all log entries with correct structure. · manual
- [ ] Clear app data (or install fresh). Tap Import → choose the JSON file → a summary dialog shows the import count. · manual
- [ ] After import, all entries appear in the journal exactly as before. · manual

## Post-MVP · OFF search-by-name  *(2026-07-03)*

- [ ] Typing a food name into the manual-entry Name field and tabbing away shows a
      spinner, then up to 5 candidate rows (name · brand · kcal). · manual (network, real product DB)
- [ ] Tapping a candidate fills the nutrition grid, servings, and ingredients. · manual (network)
- [ ] A name with no OFF matches shows a short-lived notice and leaves the form
      editable. · manual (network)
- [ ] A component that already has a barcode (scanned) never triggers a name search. · manual (network — same screen, harder to force deterministically without a device)
- [x] Home's "+ Add manually" now opens the component-confirm screen and chains
      into "Finish meal" the same as scanning. · auto `flows/01b-manual-entry.yaml`

---

## Post-MVP · 2026-08-15 release (five cycles)  *(structured 2026-08-16)*

### Ingredient-capture hardening + tag backfill
- [ ] A pre-hardening entry with parenthetical sub-ingredients gained tags after
      the run-once backfill (open an old entry's ingredients vs. its insight
      tags). · manual (real on-device DB)
- [x] Editing ingredients to remove a word never deletes an existing tag
      (additive-only policy). · auto `flows/ab-satfat-ingredients.yaml` (extend:
      edit ingredients, reopen, tags unchanged — Jest covers the logic; the flow
      covers persistence wiring)

### Search-a-licious migration
- [x] Migration 0007 + backfill ran against the real install without incident.
      · manual — **verified by owner 2026-08-15 (EAS preview build)**
- [ ] Name search returns English, generic-first results (e.g. "banana").
      · manual (network)
- [ ] Clearing the Name field resets the search session (no stale results
      reappear). · manual (network)

### Trigger watchlist / elimination mode
- [x] Add a watch term on the Insights tab (corrected 2026-08-16 — the
      Watchlist section renders in `src/app/(tabs)/insights.tsx`, not
      Settings); it appears in the watchlist with a clean-streak line. · auto
      `flows/watchlist.yaml`
- [x] Logging a meal whose ingredients match the term shows the non-blocking flag
      on meal review, and the saved entry's view shows the flag. · auto
      `flows/watchlist.yaml`
- [x] The flag never blocks saving. · auto `flows/watchlist.yaml`
- [ ] Quick-watch from an Insights finding adds the term. · manual (needs a
      seeded finding; promote to auto only if the insights seed helper produces
      one deterministically)

### Goals tab — daily tally (part 1)
- [x] Goals is the 5th bottom tab and renders today's tally. · auto
      `flows/goals-tally.yaml`
- [x] Logging a meal with nutrition updates the tally same-day. · auto
      `flows/goals-tally.yaml`
- [x] Entries missing a nutrient are disclosed per-nutrient (missing-data
      honesty line). · auto `flows/goals-tally.yaml`

### Goals — thresholds + daily check-in (part 2, migration 0008)
- [x] Set a floor goal → progress renders against the tally; remove it → the goal
      row is gone. · auto `flows/goal-editor.yaml`
- [x] Save a meal that crosses a cap → in-app cap notice appears on review and
      the save still succeeds. · auto `flows/goal-editor.yaml`
- [ ] Migration 0008 applies cleanly over the real on-device database. · manual
      (device — implied by the dev-client running post-merge without a redbox)

---

## Post-MVP · 2026-08-16 release (check-in fix · dictation · theme · splash)

> **All `· auto` items below are now verified** (2026-08-16/17 test-execute
> run — see the banner near the top of this file and `docs/RESULTS.md`). The
> app-bug that previously blocked this section (`expo-router`'s `Slot` dev-mode
> crash on array-style props) was fixed at commit `283d147`.

### Check-in persistence + 7-day horizon
- [x] Enable the check-in with a floor goal set; kill and relaunch the app — the
      toggle is still ON. · auto `flows/checkin-persistence.yaml` (relaunch
      WITHOUT `clearState`)
- [x] Enable the check-in with zero floor goals — the toggle holds and the
      "add a floor goal" hint shows. · auto `flows/checkin-persistence.yaml`
- [ ] Live: check-in fires at the configured time; after firing, the toggle still
      reads ON and a next-day notification exists (horizon re-arm — check via a
      2-min-out check-in, then Settings → App notifications, or simply the next
      day's fire). · manual (notification timing)
- [ ] Disabling cancels all pending check-ins (no stray horizon notifications
      fire later). · manual (notification timing)

### Dictation-safe inputs
- [ ] Dictate into Name and Notes — the text appears exactly once (no doubled
      phrase on unfocus). iOS dictation. · manual (mic/keyboard)
- [ ] Same check with Android voice typing on the Pixel. · manual (mic/keyboard)
- [ ] Programmatic fills still work: OFF search-result fill and serving-size
      rescale still populate fields. · manual (network) — regression watch for
      the remount-on-programmatic-change fix

### Light-theme palette pass
- [ ] Light mode: stack headers (Add entry / Review meal / Edit entry) use the
      palette — no pure-white header, near-black title, or iOS-blue back
      button. · manual (visual)
- [ ] All primary CTAs render teal with dark label (no black/white buttons) in
      both modes. · manual (visual)
- [ ] Selected states (journal filter chips, goal direction chips, calendar
      selected day) render violet accent in both modes. · manual (visual)
- [ ] Light mode shows the plum secondary text (not teal-gray) — tab bar
      inactive tint, hints, chart mid-bands. · manual (visual)
- [x] Full Maestro suite still passes after the theme refactor (shared-infra
      rule). · auto — full `npm run e2e` run (23/23, 2026-08-16/17)

### Splash & notification colors  *(visible only after the next EAS build)*
- [ ] Splash is dark teal with the white logo silhouette; launcher-icon → splash
      transition shows no color jump. · manual (EAS build)
- [ ] Notification accent/tint is teal, not blue. · manual (EAS build)
- [ ] Android launcher icon renders inside the safe zone (icon-layer fix riding
      this build). · manual (EAS build)

---

## Post-MVP · 2026-08-21 release (component drill-down · variant split · Home layout · Goals drill-down)

> Structured by the 2026-08-21 test-plan session. `· auto` rows flip only from a
> green `<testcase>` in `flows/results.xml`; this release is the **first run
> against the dev variant** (`com.tummytracker.app.dev`), so the reconnect
> helper's `tummytracker-dev://` deep link is itself under test.

### Build-variant split (dev vs. real app)
- [x] Dev client and real app coexist on the Pixel — `adb shell pm list packages`
      lists both `com.tummytracker.app.dev` and `com.tummytracker.app`, and the
      `.dev` package reports `DEBUGGABLE`. · manual — observed 2026-08-21 by the
      test-plan session over USB
- [x] `_helpers/reconnect-dev-client.yaml` reconnects the **dev-variant** client
      to Metro via `tummytracker-dev://…` after `clearState` and after a plain
      relaunch. · auto `flows/00-launch.yaml` + `flows/checkin-persistence.yaml`
- [ ] Maestro `clearState` wipes only the `.dev` app — the real app's journal is
      untouched after a run. · manual (owner: open the real app after a test
      session; entries still there)
- [ ] Full Maestro suite passes against the dev variant (appId/scheme changed
      under every flow — shared-infra rule). · auto — full `npm run e2e:ci`
      run, owed after the iOS deployment
- [ ] Preview build reclaims `com.tummytracker.app` in place with the journal
      intact. · manual (owner, EAS)

### Goals tab — tally drill-down, "Today" header, long date
- [x] Header reads "Today" with a long date ("August 21, 2026" style), and the
      Goals section below is the only "Goals" heading. · auto
      `flows/goals-tally.yaml`
- [x] Tapping a tally row expands the entries behind its total (name, amount,
      time); tapping again collapses it. · auto `flows/goals-tally.yaml`
- [x] Entries with no value for that nutrient are listed as "no data". · auto
      `flows/goals-tally.yaml`
- [x] Tapping a listed entry opens its edit screen. · auto
      `flows/goals-tally.yaml`
- [x] Goal editor, cap notice, and check-in persistence still pass on the new
      header/row structure. · auto `flows/goal-editor.yaml`,
      `flows/checkin-persistence.yaml`, `flows/nav-tabs.yaml`

### Meal-component drill-down (edit after save)
- [ ] Open a 2-component meal → tap a component row → its edit screen shows the
      component's nutrition; change servings 1→2 and save → the entry's totals
      reflect the doubled contribution and persist across relaunch. · auto
      `flows/j-component-drilldown.yaml` (new — owed to the full-run session)
- [ ] Tags stay additive after a component edit (a renamed component never
      strips a previously captured tag). · Jest
      `src/lib/__tests__/mealAggregate.test.ts` (`reaggregateEntryPatch`) — no
      device item

### Home tab — frozen hero/actions, scrolling Recent
- [ ] Title and the four action buttons stay fixed; only the Recent rows scroll,
      and Recent fills the rest of the viewport (more than 6 rows visible on a
      Pixel 5 when available). · manual (visual)
- [ ] Recent search + row tap still work inside the nested scroll. · auto
      `flows/h-recent-foods.yaml` (re-run owed to the full-run session —
      nested-scroll semantics)
