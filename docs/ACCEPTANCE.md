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

## Phase 0 — Scaffold
- [ ] App launches on the Pixel 5 (dev build) without a redbox. · auto `flows/00-launch.yaml`
- [ ] A placeholder home screen renders. · auto `flows/00-launch.yaml`

## Phase 1b — Manual entry
- [ ] Add a meal manually (now a two-screen flow: component confirm → meal review):
      name, ingredients, nutrition, then slot, time, notes, sentiment. · auto
      `flows/01b-manual-entry.yaml` (rewritten 2026-07-03 for the meal-builder
      chain; pending device run — see docs/E2E.md)
- [ ] The 500-char notes counter blocks overflow. · auto `flows/01b-manual-entry.yaml`
- [ ] Entry persists across an app restart (SQLite). · auto `flows/01b-manual-entry.yaml`

## Phase 1c — Barcode
- [ ] Scan a real product barcode; nutrition pre-fills from Open Food Facts. · manual (camera)
- [ ] Scan an unknown/again-no-network barcode; it drops into the component-confirm
      form with the barcode attached. · auto `flows/01c-barcode-fallback.yaml`
      (manual-fallback path only; assertion retargeted 2026-07-03 to
      "Component name" — pending device run)

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
- [ ] Insights summary correctly separates food / BM / symptom counts. · auto `flows/e-temporal-insights.yaml` (partial — below-fold flow fix applied 2026-07-03, re-run pending; see RESULTS.md)

---

## Post-MVP · 2026-07-02 cycle (bug batch + meal builder + insights v2)

### Notes / clock / theme (bug batch)
- [x] Notes accept up to 500 chars; counter blocks overflow. · auto `flows/01b-manual-entry.yaml`
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
- [ ] Home's "+ Add manually" now opens the component-confirm screen and chains
      into "Finish meal" the same as scanning. · auto `flows/01b-manual-entry.yaml`
      (rewritten 2026-07-03, pending device run)
