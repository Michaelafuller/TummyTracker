# ACCEPTANCE.md — On-device checklist (owner-driven)

The autonomous build verifies everything machine-checkable (`typecheck`, `lint`,
`test`). The items below **cannot** be automated by the agent — they need the
Pixel 5, an EAS build, and your hands/eyes. Run them after the autonomous run (or
at any boundary you like).

## How to get a build on the Pixel 5

```bash
npm install              # if not already
npm run bundle:check     # runs `expo export` — same bundling EAS does; catches
                         # Metro/Babel config bugs the test/typecheck/lint rungs miss
eas login                # your Expo account (set NODE_EXTRA_CA_CERTS behind a proxy)
eas build --profile preview --platform android   # standalone APK, runs offline
# download the .apk, then over USB (no Wi-Fi/proxy needed):
adb install -r path/to/app.apk
```

For live-reload development instead of a standalone APK, build the `development`
profile and run `npx expo start --dev-client`. On a corporate network the device
often can't reach Metro over Wi-Fi — tunnel it over USB with
`adb reverse tcp:8081 tcp:8081` then connect to `http://localhost:8081`.

(`eas.json` profiles are committed. The agent never runs these — they touch your
account and device.)

---

## Phase 0 — Scaffold
- [ ] App launches on the Pixel 5 (dev build) without a redbox.
- [ ] A placeholder home screen renders.

## Phase 1b — Manual entry
- [ ] Add a meal manually: name, slot, time, a couple nutrition fields, notes, sentiment.
- [ ] The 200-char notes counter blocks overflow.
- [ ] Entry persists across an app restart (SQLite).

## Phase 1c — Barcode
- [ ] Scan a real product barcode; nutrition pre-fills from Open Food Facts.
- [ ] Scan an unknown/again-no-network barcode; it drops into the manual form with
      the barcode attached.

## Phase 1d — Browse & edit
- [ ] Entries are grouped by day.
- [ ] Day / week / month calendar toggle works.
- [ ] Open a past entry, add/change its sentiment, save; the change sticks.

## Phase 1e — Reminders
- [ ] Configure a reminder time; the OS permission prompt appears.
- [ ] Receive the local notification at the scheduled time; tapping it opens the app.

## Phase 2 — Bowel-movement tracking
- [ ] Quick-add a bowel movement (optional Bristol 1–7).
- [ ] It renders distinctly in the list/calendar.
- [ ] Filter by type (meals / BMs / both) works.
- [ ] Pre-existing entries still load after the migration.

## Phase 3 — Insights
- [x] With some seeded data, the Insights screen shows a sensible finding and its
      supporting sample size.
- [x] Findings read as observations, never medical advice.

---

## Post-MVP · Sat fat + Flagship Trio  *(accepted 2026-06-28)*

### A · Saturated fat
- [x] Sat. fat (g) appears in the nutrition grid between Fat and Carbs.
- [x] Entered value persists across app restart.
- [x] Barcode scan pre-fills saturated fat when OFF has the value.
- [x] Blank value saves without errors.

### B · Ingredient capture
- [x] Manual-entry form has "Ingredients (optional)" text area above the Nutrition section.
- [x] Manually typed ingredients persist on re-open.
- [x] Barcode scan pre-fills ingredients from OFF.
- [x] Type selector shows Meal and Snack only (no Symptom/BM leak).

### C · Symptom logging
- [x] 🤢 Log symptom button present on Home screen.
- [x] Symptom form opens as a modal with When, Symptom type (9 chips), Severity (1–5), Notes.
- [x] All fields optional; saving with nothing selected produces an entry named "Symptom".
- [x] Saving with a type produces the correct name (e.g. "Bloating").
- [x] Symptom entries show 🤢 prefix and correct subtitle in the journal list.
- [x] Journal Symptom filter works; Food filter excludes symptoms.
- [x] Edit flow loads saved type and severity.
- [x] Existing meal/BM entries unaffected.

### D · Ingredient → sentiment correlation
- [x] "Ingredients you react to" section appears in Insights when threshold is met.
- [x] Cards cite average sentiment and number of meals.
- [x] Well-rated tags do not appear.

### E · Temporal meal → outcome correlation
- [x] "Timing patterns" section appears in Insights when a tag's hit rate exceeds baseline.
- [x] Card body quotes hit count, meal count, hit %, and baseline %.
- [x] Tags where hit rate equals baseline are suppressed.
- [x] Section carries "Observation only" framing.
- [x] Insights summary correctly separates food / BM / symptom counts.

---

## Post-MVP · UX polish sprint  *(2026-06-28)*

### UX-1 · Home title wrapping
- [ ] Open the app on any screen width — "TummyTracker" renders on one line (font shrinks to fit; the last "r" no longer wraps).

### UX-2 · Theming
- [ ] Segmented-control (journal filter): unselected chips are visibly lower-emphasis than the selected chip in **both** light and dark mode.
- [ ] No transparent/invisible themed element visible in dark mode on the home or settings screens.

### UX-3 · Scan screen
- [ ] Scan screen header close/back button legible (dark header background, white tint).
- [ ] "Enter manually" pill button visible on the live camera viewfinder — floats with shadow, not invisible against a dark scene.
- [ ] "Scan barcode" primary CTA on the Home screen visible in dark mode (was transparent before the null-scheme fix).

---

## Post-MVP · Tier-0 sprint  *(2026-06-28)*

### F · Serving-size scaling
- [ ] Scan a barcode; if the product has a `serving_quantity`, the serving field defaults to it (not 100 g).
- [ ] Edit the serving size field; all nutrition values rescale proportionally.
- [ ] Serving size persists — reopen the entry and the value is unchanged.
- [ ] Entering serving size 0 or blank does not crash; nutrition is left as-is.

### G · Native date/time picker
- [ ] Tap the date chip in any log form (meal, BM, symptom) — the OS native date picker appears.
- [ ] Tap the time chip — the OS native time picker appears.
- [ ] "Now" button sets both chips to the current date and time.
- [ ] Chosen date/time persists after saving.

### H · Recent foods quick-add
- [ ] Log two different meals. Return to the Home screen — a "Recent" row of chips appears below the CTAs.
- [ ] Tap a chip — the new-entry form opens pre-filled with that food's name, nutrition, ingredients, and notes; the date/time defaults to *now* (not the original log time).
- [ ] Save the pre-filled entry — it appears as a new distinct entry in the journal.
- [ ] The Recent row shows at most 10 distinct food names (no duplicates by name).

### I · Backup export + import
- [ ] Settings screen shows "Export data" and "Import data" buttons.
- [ ] Tap Export — the OS share sheet appears offering the `tummytracker-backup.json` file. Save it to Files.
- [ ] Open the saved JSON in a text editor — it contains all log entries with correct structure.
- [ ] Clear app data (or install fresh). Tap Import → choose the JSON file → a summary dialog shows the import count.
- [ ] After import, all entries appear in the journal exactly as before.
