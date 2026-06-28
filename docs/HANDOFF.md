# HANDOFF.md — Backfill the missing Maestro E2E flows (Sonnet 4.6 execute session)

Read this file first, then `CLAUDE.md` (the constitution) and `docs/E2E.md`
(the Maestro protocol, conventions, and Coverage table). You are **Session 2
(Execute)** of the *test-backfill* cycle — see `docs/TEST_STRATEGY.md` for where
this sits in the loop.

This is a **test-only session**: no new features, no UI changes, no component
edits. You are writing **Maestro flow YAML files only** (plus their `_helpers/`
seed flows), and updating two doc tables. If you find yourself wanting to edit a
`.tsx`/`.ts` file, stop — that means an accessibility label is missing, which is
a finding to report, not a thing to fix here (see "If a label is missing" below).

---

## TL;DR

Many shipped features have Jest tests and ticked ACCEPTANCE boxes but **no
Maestro flow**. The three rungs (`typecheck`/`lint`/`test`) never run the app, so
these features have zero automated *on-device* coverage. Your job: write the
missing flows so the next test-execute session (`npm run e2e`) actually exercises
them.

**Current Maestro flows (already exist — do not rewrite):**
`00-launch`, `01b-manual-entry`, `01c-barcode-fallback`, `01d-browse-edit`,
`01e-reminders`, `02-bm-tracking`, `03-insights`, `f-serving-size`,
`g-datetime-picker`, `h-recent-foods`, `i-backup`, `ux3-scan-screen`, plus
`_helpers/seed-two-meals` and `_helpers/seed-meals-for-insights`.

**Flows to write this session (8 new files + up to 2 helpers):** see the table
in "What to build".

---

## How to work

- **You cannot run Maestro in this session** (no Pixel 5 attached here). Your gate
  is *authoring correct flows*, not green Maestro runs — the next session
  (test-execute) runs them on the device and writes `RESULTS.md`. So:
  - Make every `tapOn`/`assertVisible` target a string you have **verified exists
    in the source** (label/text/testID). Do not invent labels.
  - Keep the three rungs green anyway: `npm run typecheck && npm run lint && npm test`
    must still pass after your commit (you're only adding YAML + docs, so they
    should stay green — confirm it).
- **Verify every label against the component before using it.** The "Verified
  label reference" section below has file:line for each, but labels drift — open
  the file and confirm. A flow that targets a stale label is worse than no flow:
  it fails in Session 3 and looks like a regression.
- Commit in **one commit** (or ≤3 split by feature group). End commit messages
  with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- After writing flows, update **`docs/E2E.md`** (Coverage table) and
  **`docs/ACCEPTANCE.md`** (add `· auto flows/<file>` markers to the items your
  flows now cover) — but **do not tick `[ ]`→`[x]`**. Ticking is Session 3's job,
  driven by `flows/results.xml`. You only wire the `· auto` pointer.

---

## Maestro conventions in this repo (learned from existing flows)

- Every standalone flow starts with:
  ```yaml
  appId: com.tummytracker.app
  # one-line purpose comment
  ---
  - launchApp:
      clearState: true
  ```
  `clearState: true` makes flows independent and order-free. Keep it.
- **`tapOn:` matches both visible text AND `accessibilityLabel`.** Existing flows
  tap `"Log a bowel movement"` (the accessibilityLabel) even though the visible
  text is `"💩 Log bowel movement"`. Prefer the accessibilityLabel when it's
  cleaner; either works.
- Use `id:` for testIDs (the tab bar): `tab-home`, `tab-journal`, `tab-insights`,
  `tab-settings`.
- Long forms need `scrollUntilVisible:` before `tapOn:` for below-the-fold fields
  (see `01b-manual-entry.yaml`). The sentiment selector buttons are `id: sentiment-1`
  … `id: sentiment-5`.
- After a save/navigation, add `- waitForAnimationToEnd`.
- Seed data lives in `flows/_helpers/*.yaml` and is pulled in with
  `- runFlow: _helpers/<name>.yaml`. Helpers assume the app is already launched and
  on the Home screen (they do **not** `launchApp`).
- SQLite-persistence checks: `- stopApp` then `- launchApp` (no `clearState`) and
  re-assert.

---

## What to build

| # | Flow file | Covers (ACCEPTANCE item) | Automatable? |
|---|-----------|--------------------------|--------------|
| 1 | `flows/c-symptom-logging.yaml` | **C** — symptom log, renders in journal, Symptom filter, edit loads type/severity | ✅ Full |
| 2 | `flows/ab-satfat-ingredients.yaml` | **A** sat-fat persist (manual path) + **B** ingredient persist on reopen | ✅ Full |
| 3 | `flows/d-ingredient-insights.yaml` (+ `_helpers/seed-ingredient-reactions.yaml`) | **D** — "Ingredients you react to" appears, cites avg sentiment + meal count | ✅ Full |
| 4 | `flows/e-temporal-insights.yaml` | **E** — "Timing patterns" / summary food·BM·symptom counts | ⚠️ Partial (see note) |
| 5 | `flows/journal-calendar.yaml` | 1d day/week/month toggle + collapse/expand calendar | ✅ Full |
| 6 | `flows/nav-tabs.yaml` | 4-tab nav reachable (Home/Journal/Insights/Settings) | ✅ Full |
| 7 | `flows/settings-smoke.yaml` | Offline-mode toggle + Data/Reminders/App sections present, no crash | ✅ Smoke only |
| 8 | `flows/01d-browse-edit` **(extend, don't replace)** | confirm Symptom now coexists — only if not already covered | optional |

Build 1–7. #8 is optional polish — only touch `01d` if it's a one-line add and
you're confident; otherwise leave it.

---

### 1. `flows/c-symptom-logging.yaml` — the biggest gap (8 ACCEPTANCE items)

Symptom logging shipped fully (migration 0004) with **zero** Maestro coverage.
Cover the whole loop: log → renders in journal → filter → edit reloads state.

Spec:

```yaml
appId: com.tummytracker.app
# Flagship C — Symptom logging:
#   - Log a symptom (type chip + severity), save
#   - Renders distinctly (🤢 prefix, "Symptom · <type> · Severity N") in Journal
#   - Symptom filter shows only symptoms; Food filter excludes them
#   - Edit flow reloads the saved type + severity
---
- launchApp:
    clearState: true

# Seed a food entry so the Food filter has something to keep / symptom filter excludes
- runFlow: _helpers/seed-two-meals.yaml

# --- Log a symptom ---
- tapOn: "Log a symptom"          # accessibilityLabel; visible text is "🤢 Log symptom"
- waitForAnimationToEnd
- tapOn: "Bloating"               # SymptomTypePicker chip (accessibilityLabel == label)
- tapOn: "Severity 3: Significant" # SeveritySelector accessibilityLabel
- tapOn: "Save"                   # SymptomForm submit (accessibilityLabel == submitLabel, default "Save")
- waitForAnimationToEnd

# --- Journal: symptom renders distinctly ---
- tapOn:
    id: "tab-journal"
- assertVisible: "Bloating"       # entry name == symptom type label
- assertVisible: "Severity 3"     # subtitle: "Symptom · Bloating · Severity 3"

# --- Filter: Symptom only ---
- tapOn: "Symptom"
- waitForAnimationToEnd
- assertVisible: "Bloating"
- assertNotVisible: "Oatmeal"
- assertNotVisible: "Pizza slice"

# --- Filter: Food excludes symptoms ---
- tapOn: "Food"
- waitForAnimationToEnd
- assertVisible: "Oatmeal"
- assertNotVisible: "Bloating"

# --- Edit reloads saved type + severity ---
- tapOn: "All"
- waitForAnimationToEnd
- tapOn: "Bloating"               # opens entry/[id] edit screen
- waitForAnimationToEnd
- assertVisible: "Severity 3: Significant"  # severity reselected; confirm the edit screen shows it
```

Verify before relying on it:
- That tapping a symptom row in the journal opens the **edit screen** and that the
  edit screen renders the `SymptomForm` (check `src/app/entry/[id].tsx` for the
  symptom branch). The last assertion depends on the selected severity being
  visibly marked — if the SeveritySelector marks selection via
  `accessibilityState` rather than a separate label, assert on the visible
  severity label text instead, or assert the symptom type chip is selected.
- That a symptom with a type is **named** after the type ("Bloating"). If it's
  named "Symptom" with the type only in the subtitle, adjust the assertions to
  match `EntryRow` (`src/features/logging/EntryRow.tsx`).

---

### 2. `flows/ab-satfat-ingredients.yaml` — A + B persistence

`01b-manual-entry` *enters* ingredients and nutrition but never **reopens** the
entry to prove the values round-tripped through SQLite. This flow does.

Spec:
- `launchApp: clearState: true`.
- `tapOn: "Add an entry manually"`.
- Name it something searchable, e.g. `"Sat Fat Test"`.
- Enter ingredients: `scrollUntilVisible` `text: "Ingredients (optional)"` (label) →
  `tapOn` the field (accessibilityLabel `"Ingredients"`) → `inputText: "butter, cream"`.
- Enter saturated fat: `scrollUntilVisible` `text: "Sat. fat (g)"` →
  `tapOn` → `inputText: "12"`.
- `scrollUntilVisible "Save entry"` → `tapOn: "Save entry"` → `waitForAnimationToEnd`.
- Reopen: `tapOn: id: tab-journal` → `tapOn: "Sat Fat Test"` → `waitForAnimationToEnd`.
- Assert persisted: `scrollUntilVisible` then `assertVisible: "butter, cream"` and
  `assertVisible: "12"` (the sat-fat field value). Confirm the edit screen renders
  these as editable field values you can assert on.

Verify: that the manual-entry **edit** screen (`entry/[id]`) shows the ingredients
text and the sat-fat value as visible content. If the field shows the number
without a guaranteed-unique string, assert on the ingredients (which are unique)
and treat sat-fat as covered by the Jest unit test (`scaleNutrition` /
nutrition lib) — note that in the E2E.md Coverage row.

---

### 3. `flows/d-ingredient-insights.yaml` (+ seed helper)

`analyzeIngredientSentiment` gates on **`MIN_TAG_OCCURRENCES = 3`** — a tag must
appear in ≥3 rated food entries before it surfaces. So the seed needs ≥3 low-
sentiment meals sharing one ingredient.

Write `flows/_helpers/seed-ingredient-reactions.yaml` modeled on
`_helpers/seed-meals-for-insights.yaml`, but **fill the Ingredients field** each
time. For each of ≥3 meals:
```yaml
- tapOn: "Add an entry manually"
- tapOn: "Entry name"
- inputText: "Onion Dish"
- hideKeyboard
- tapOn:
    id: "sentiment-1"
- scrollUntilVisible:
    element:
      text: "Ingredients (optional)"
    direction: DOWN
- tapOn: "Ingredients"
- inputText: "onion, garlic"
- hideKeyboard
- scrollUntilVisible:
    element:
      text: "Save entry"
    direction: DOWN
- tapOn: "Save entry"
- waitForAnimationToEnd
```
Then the flow:
```yaml
- launchApp:
    clearState: true
- runFlow: _helpers/seed-ingredient-reactions.yaml
- tapOn:
    id: "tab-insights"
- waitForAnimationToEnd
- assertVisible: "Insights"
- scrollUntilVisible:
    element:
      text: "Ingredients you react to"
    direction: DOWN
- assertVisible: "Ingredients you react to"
- assertVisible: "onion"          # the normalized tag the card cites
```

**Critical to verify:** that the **manual** Ingredients field actually feeds
`extractTags`/`normalizeTag` into `tags_json` (not just `ingredients_text`).
Check `src/features/logging/formModel.ts` (the `buildLogEntry` path). If manual
ingredients are NOT tag-extracted, this flow can't trigger the section — in that
case, report it as a finding (the feature may only tag from barcode scans) and
mark D as "not E2E-automatable (manual ingredients not tagged)" instead of
shipping a flow that will always fail. Also confirm the normalized tag's display
casing (`onion` vs `Onion`) and assert the real one.

---

### 4. `flows/e-temporal-insights.yaml` — partial / best-effort

`analyzeTemporalTriggers` does a 24h windowed join: a food entry must be
**followed within 24h** by a bad outcome (bad BM, severe symptom, or low food
sentiment). In a `clearState` Maestro run every entry is logged "now", so you
**cannot** naturally create the time gap without driving the native date/time
picker — which is exactly why `03-insights.yaml` left the "Observation only"
temporal path as a **manual** check.

Do the achievable part automatically:
- Seed: a few food entries + a symptom (or use the date/time picker — see
  `g-datetime-picker.yaml` for how to drive it — to backdate the meal so it
  precedes the symptom within 24h, if you can make that reliable).
- Navigate to Insights and assert the **summary counts** line renders and
  separates types: the "Your journal so far" line shows
  `"<n> entries · <n> food · <n> BM · <n> rated"` (and symptom count if present —
  confirm exact format in `src/app/(tabs)/insights.tsx` lines ~77–85).
- Only assert `"Timing patterns"` is visible **if** you can reliably construct the
  windowed data via the date picker. If you can't make it deterministic, do
  **not** assert it — instead assert the summary counts only, and document in
  E2E.md that "Timing patterns" stays **manual** (timing-dependent), same as the
  Observation-only note in `03-insights`.

Honesty rule: a flaky assertion is worse than a documented manual item. Prefer
the smaller deterministic flow + a `· manual` note.

---

### 5. `flows/journal-calendar.yaml` — 1d calendar modes + collapse

`01d-browse-edit` covers grouping + sentiment edit but the spec calls out
**day/week/month toggle** and the **collapsible** calendar (UI/UX sprint) which
aren't explicitly asserted.

Spec:
```yaml
appId: com.tummytracker.app
# 1d / UI-UX — Journal calendar: day/week/month segmented toggle + collapse/expand.
---
- launchApp:
    clearState: true
- runFlow: _helpers/seed-two-meals.yaml
- tapOn:
    id: "tab-journal"
- assertVisible: "Journal"

# Mode toggle (SegmentedControl options: Day / Week / Month)
- tapOn: "Month"
- waitForAnimationToEnd
- tapOn: "Week"
- waitForAnimationToEnd
- tapOn: "Day"
- waitForAnimationToEnd

# Calendar starts collapsed (week view) → expand → collapse
- assertVisible: "Expand calendar"   # accessibilityLabel when collapsed
- tapOn: "Expand calendar"
- waitForAnimationToEnd
- assertVisible: "Collapse calendar"
- tapOn: "Collapse calendar"
- waitForAnimationToEnd
- assertVisible: "Expand calendar"
```
Note: "Day"/"Week"/"Month" and "Food"/"BM" both render as segmented chips — if
Maestro finds an ambiguous match, scope with `id` or assert nearby text. Verify
the "Expand calendar"/"Collapse calendar" labels in `explore.tsx:110`.

---

### 6. `flows/nav-tabs.yaml` — 4-tab smoke

The 4-tab bar (Home | Journal | Insights | Settings) shipped with the nav sprint;
nothing asserts all four are reachable.

```yaml
appId: com.tummytracker.app
# Nav — all four bottom tabs reachable and render their landmark heading.
---
- launchApp:
    clearState: true
- tapOn:
    id: "tab-journal"
- assertVisible: "Journal"
- tapOn:
    id: "tab-insights"
- assertVisible: "Insights"
- tapOn:
    id: "tab-settings"
- assertVisible: "Settings"        # confirm the Settings screen has a "Settings" heading/title
- tapOn:
    id: "tab-home"
- assertVisible: "TummyTracker"
```
Verify the Settings screen renders a literal "Settings" string; if not, assert on
a section heading like "Data" instead.

---

### 7. `flows/settings-smoke.yaml` — offline toggle + sections

A `Switch`'s on/off state isn't reliably assertable in Maestro, so keep this a
**smoke** flow: the controls exist, tapping the toggle doesn't crash, sections
render.

```yaml
appId: com.tummytracker.app
# Settings — offline-mode toggle present + tappable (no crash); Data/Reminders/App sections render.
---
- launchApp:
    clearState: true
- tapOn:
    id: "tab-settings"
- assertVisible: "Data"
- assertVisible: "Reminders"
- assertVisible: "App"
- assertVisible: "Export data"
- assertVisible: "Import data"
- scrollUntilVisible:
    element:
      text: "Offline mode"
    direction: DOWN
- tapOn: "Offline mode"            # accessibilityLabel on the Switch
- waitForAnimationToEnd
# Toggle back; no assertion on switch value (not reliably queryable) — this is a no-crash smoke.
- tapOn: "Offline mode"
- waitForAnimationToEnd
- assertVisible: "App"             # still on the Settings screen, no redbox
```
This intentionally overlaps `i-backup.yaml` on the Export/Import buttons — that's
fine; `i-backup` exercises the export action, this just asserts presence.

---

## If a label is missing or wrong

You may discover a screen has no `accessibilityLabel`/`testID` to target, or the
label drifted from this doc. **Do not add or change labels in this session** —
that's a feature/UI change, out of scope. Instead:
1. Skip that assertion (or the whole flow if it's unworkable).
2. Record it in your summary under "Findings — labels to add", with file:line and
   the exact label you'd want.
3. The next *planning* session will spec the label addition as its own task.

The one exception: if a label is trivially present but this doc quoted it wrong,
just use the correct one and note the correction.

---

## Verified label reference (confirm each at file:line before use)

| Target | String | File:line |
|--------|--------|-----------|
| Home — scan CTA | `Scan a barcode` (label) / `Scan barcode` (text) | `src/app/(tabs)/index.tsx:62` |
| Home — manual CTA | `Add an entry manually` | `src/app/(tabs)/index.tsx:73` |
| Home — BM CTA | `Log a bowel movement` | `src/app/(tabs)/index.tsx:85` |
| Home — symptom CTA | `Log a symptom` (text `🤢 Log symptom`) | `src/app/(tabs)/index.tsx:97,102` |
| Home — recent chip | `Re-log <name>` | `src/app/(tabs)/index.tsx:121` |
| Symptom — type chips | `Bloating` `Constipation` `Diarrhea` `Cramps` `Gas` `Heartburn` `Nausea` `Upset stomach` `Fatigue` | `src/features/symptoms/symptomTypes.ts:24-32` |
| Symptom — severity | `Severity 1: Mild` … `Severity 5: Very severe` | `src/features/symptoms/SeveritySelector.tsx:27`, `severity.ts:13-18` |
| Symptom — save | `Save` (default submitLabel) | `src/features/symptoms/SymptomForm.tsx:37,95` |
| Symptom — journal row | `🤢` prefix, subtitle `Symptom · <type> · Severity <n>` | `src/features/logging/EntryRow.tsx:15,26-29` |
| Journal — filter chips | `All` `Food` `BM` `Symptom` | `src/app/(tabs)/explore.tsx:30-35` |
| Journal — mode chips | `Day` `Week` `Month` | `src/app/(tabs)/explore.tsx:24-28` |
| Journal — calendar toggle | `Expand calendar` / `Collapse calendar` | `src/app/(tabs)/explore.tsx:110` |
| Journal — heading | `Journal` | `src/app/(tabs)/explore.tsx:94` |
| Form — ingredients | label `Ingredients (optional)`, field `Ingredients` | `src/features/logging/LogEntryForm.tsx:169,174` |
| Form — sat fat | `Sat. fat (g)` | `src/lib/nutrition.ts:40` |
| Form — sentiment | `id: sentiment-1` … `sentiment-5` | (existing flows) |
| Form — save | `Save entry` | `src/features/logging/LogEntryForm.tsx` |
| DateTimeField | `Choose date` / `Choose time` / `Set to now` | `src/components/date-time-field.tsx:65,73,81` |
| Insights — heading | `Insights` | `src/app/(tabs)/insights.tsx` |
| Insights — ingredient section | `Ingredients you react to` | `src/app/(tabs)/insights.tsx:118` |
| Insights — temporal section | `Timing patterns` | `src/app/(tabs)/insights.tsx:132` |
| Insights — summary | `<n> entries · <n> food · <n> BM · <n> rated` | `src/app/(tabs)/insights.tsx:77-85` |
| Settings — sections | `Data` `Reminders` `App` | `src/app/(tabs)/settings.tsx:162,188,222` |
| Settings — offline toggle | `Offline mode` | `src/app/(tabs)/settings.tsx:236` |
| Settings — export/import | `Export data` / `Import data` | `src/app/(tabs)/settings.tsx:169,177` |
| Settings — reminder toggles | `<slot> reminder` (e.g. `breakfast reminder`) | `src/app/(tabs)/settings.tsx:201` |
| Tabs | `id: tab-home` `tab-journal` `tab-insights` `tab-settings` | `src/components/app-tabs.tsx:27,41,55,69` |

---

## Doc updates to make in this session

1. **`docs/E2E.md` Coverage table** — add a row for each new flow with status:
   - `c-symptom-logging` → ✅ Automated (C)
   - `ab-satfat-ingredients` → ✅ Automated (A persist + B persist)
   - `d-ingredient-insights` → ✅ Automated (D) *(or a finding note if manual
     ingredients aren't tagged)*
   - `e-temporal-insights` → ⚠️ Partial (summary counts auto; Timing patterns manual)
   - `journal-calendar` → ✅ Automated
   - `nav-tabs` → ✅ Automated
   - `settings-smoke` → ✅ Automated (smoke; offline-mode value is manual)
2. **`docs/ACCEPTANCE.md`** — append `· auto flows/<file>` to the items each flow
   covers (sections A, B, C, D, E, and the UX/nav items). **Do not flip
   `[ ]`→`[x]`** — Session 3 does that from `flows/results.xml`.

---

## Deliverables checklist

- [ ] 7 new flow files (+1 seed helper) written, targeting only verified labels.
- [ ] Three rungs still green (`typecheck`/`lint`/`test`).
- [ ] `docs/E2E.md` Coverage table updated.
- [ ] `docs/ACCEPTANCE.md` `· auto` pointers added (no checkbox flips).
- [ ] One commit (≤3), Sonnet co-author trailer.
- [ ] A brief **summary** at the end (what you wrote, any "labels to add"
      findings, anything you left manual and why). This summary is what the
      *test-execute* session and the next *planning* session read next.

## Pointers

- `docs/E2E.md` — Maestro protocol, conventions, troubleshooting, Coverage table.
- `docs/TEST_STRATEGY.md` — the full plan→execute→test loop and where this sits.
- `flows/02-bm-tracking.yaml` — closest analog for the symptom flow (log → render
  → filter).
- `flows/_helpers/seed-meals-for-insights.yaml` — template for the ingredient seed.
- `flows/g-datetime-picker.yaml` — how to drive the native date/time picker (needed
  if you attempt the temporal-window seed).
- `CLAUDE.md §0` — RNTL/jest deviations (not needed for YAML, but read §4 for the
  done-definition).
