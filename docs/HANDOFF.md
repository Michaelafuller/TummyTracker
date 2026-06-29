# HANDOFF.md — Fix failing Maestro flows (Opus planning session)

Read `docs/RESULTS.md` first — it has the full per-flow table and failure
diagnosis. This document translates those findings into a prioritised work plan.

Read `CLAUDE.md` (root) for conventions, and `docs/E2E.md` for the Maestro
protocol and flow conventions.

---

## Context

The first full Maestro run against the Pixel 5 just completed (`npm run e2e:ci`
→ `flows/results.xml`). **5 of 19 flows passed; 14 failed.** No existing flow
had ever been run on a device before this session — the ✅ statuses in E2E.md
were authored optimism, not verified runs.

The failures fall into four groups. Groups 1 and 4 are YAML-only fixes (no app
changes). Groups 2 and 3 may expose genuine app bugs that need investigation
before the flows can be fixed.

**Passes (do not touch):**
`00-launch`, `01c-barcode-fallback`, `journal-calendar`, `nav-tabs`,
`ux3-scan-screen`

---

## Priority 1 — YAML label fixes (no app changes, high confidence)

### 1a. `01e-reminders` and `i-backup` — wrong navigation target

Both flows open with:
```yaml
- tapOn:
    text: "Reminder settings"
```
This text does not exist anywhere in the app. Settings is a bottom tab; its
content heading is `"Settings"` (settings.tsx:159) and the reminder section
heading is `"Reminders"` (settings.tsx:188).

**Fix both flows:** Replace the `tapOn: text: "Reminder settings"` step with:
```yaml
- tapOn:
    id: "tab-settings"
- waitForAnimationToEnd
```
Then review each flow's subsequent assertions against the current `settings.tsx`
to ensure they still make sense (e.g., `assertVisible: "breakfast reminder"` →
the switch accessibilityLabel is `"breakfast reminder"` ✅ per settings.tsx:202).

### 1b. `settings-smoke` — `"App"` asserted before scroll

The flow asserts `"App"` (and `"Export data"`, `"Import data"`) before any
scroll. On the Pixel 5 the Settings scroll view doesn't fit all three sections
above the fold. The "App" section is at the bottom.

**Fix `flows/settings-smoke.yaml`:** Remove the pre-scroll `assertVisible: "App"`
and `assertVisible: "Import data"`. The flow already scrolls to `"Offline mode"`
(which is inside the App section) and asserts `"App"` again at the end — that
final assertion is the useful one and it runs after the scroll. Also ensure that
final `assertVisible: "App"` runs after scroll reaches the App section.

Revised structure:
```yaml
- tapOn: id: "tab-settings"
- waitForAnimationToEnd
- assertVisible: "Settings"
- assertVisible: "Data"
- assertVisible: "Reminders"
- assertVisible: "Export data"   # Data section button, near top
# scroll down to App section
- scrollUntilVisible:
    element:
      text: "Offline mode"
    direction: DOWN
- assertVisible: "App"           # now visible after scroll
- tapOn: "Offline mode"
- waitForAnimationToEnd
- tapOn: "Offline mode"
- waitForAnimationToEnd
- assertVisible: "App"
```

### 1c. `h-recent-foods` — `"Save entry"` asserted before scroll

The flow asserts `assertVisible: text: "Save entry"` immediately after the
pre-filled form opens, without scrolling. The save button is always below the
fold on the entry form.

**Fix `flows/h-recent-foods.yaml`:** Replace:
```yaml
- assertVisible:
    text: "Save entry"
- assertVisible: "Oatmeal"
```
with:
```yaml
- assertVisible: "Oatmeal"          # name field is above fold, confirms form opened
- scrollUntilVisible:
    element:
      text: "Save entry"
    direction: DOWN
- assertVisible: "Save entry"
```

### 1d. `03-insights` — `"across"` asserted after title-only scroll

`scrollUntilVisible: text: "Wheat Bread"` stops once the card *title* is
on-screen. The card body (which contains "across") immediately follows but may
still be partially off-screen. Also the card title "Wheat Bread" appears in the
`foodSentence` body text too, so the scroll might stop at the body line, which
would make "across" visible. Either way, adding one more scroll until "across"
itself is visible is more robust.

**Fix `flows/03-insights.yaml`:** Replace:
```yaml
- scrollUntilVisible:
    element:
      text: "Wheat Bread"
    direction: DOWN
- assertVisible: "Wheat Bread"
- assertVisible: "across"
```
with:
```yaml
- scrollUntilVisible:
    element:
      text: "Wheat Bread"
    direction: DOWN
- assertVisible: "Wheat Bread"
- scrollUntilVisible:
    element:
      text: "across"
    direction: DOWN
- assertVisible: "across"
```

---

## Priority 2 — Investigate post-save navigation (Groups 2 & 3)

These failures share a common thread: entries are saved via stack screens
(`/entry/new`, `/bm/new`, `/symptom/new`) and then the Journal or Home tab
content doesn't reflect the saved data. **Before writing fixes, investigate
the two questions below.**

### Investigation A — Does `entry/new` navigate back to tabs after save?

**Files to read:** `src/app/entry/new.tsx` (and `src/app/bm/new.tsx`,
`src/app/symptom/new.tsx`). Confirm each calls `router.back()` (or
`router.replace('/')`) after a successful save.

If they do NOT navigate back, the tab bar is hidden when Maestro tries to tap
`tab-journal` — that is an app bug that must be fixed in the screen file.

If they DO navigate back, the tab bar should become visible. In that case the
`tab-journal` failures in `01b-manual-entry`, `f-serving-size`, and
`g-datetime-picker` are a timing issue: Maestro fires `tapOn: id: "tab-journal"`
before the navigation animation completes. **Fix:** Add a sync-point assertion
after the save step:
```yaml
- tapOn: "Save entry"
- waitForAnimationToEnd
- assertVisible: "TummyTracker"     # confirms we're back on the Home tab
- tapOn:
    id: "tab-journal"
```

### Investigation B — Does `useAllEntries` refresh on focus?

**File to read:** `src/features/logging/useEntries.ts`. Confirm whether the hook
uses `useFocusEffect` (or equivalent) to re-query SQLite when the Journal tab
gains focus.

`02-bm-tracking` and `c-symptom-logging` both successfully navigate to the
Journal tab but then fail to find the just-logged entry. The seeded food entries
(logged via the same tab-screen journey) ARE visible in `01d-browse-edit`. The
difference: BM/symptom entries are logged from stack screens
(`/bm/new`, `/symptom/new`) that navigate BACK to the tab group. If the
Journal's data hook doesn't re-query when the tab refocuses, stale (pre-BM/pre-
symptom) data would show.

**If the hook does NOT use `useFocusEffect`:** That is the root cause. The fix
is in `useEntries.ts` (add `useFocusEffect` + refetch, or switch to a live
SQLite subscription). Note: this is an **app bug**, not a flow bug — the Journal
must reliably reflect entries logged from any screen.

**If the hook DOES use `useFocusEffect`:** The timing is off. Try adding a
`tapOn: id: "tab-home"` + `tapOn: id: "tab-journal"` round-trip before the
assertion to force a focus cycle.

### After Investigation A + B — Fix the affected flows

Once the root causes are confirmed, fix:
- `01b-manual-entry` — sync after save, then Journal assertion
- `f-serving-size` — same sync
- `g-datetime-picker` — same sync
- `02-bm-tracking` — Journal refresh or force-focus
- `c-symptom-logging` — Journal refresh or force-focus
- `01d-browse-edit` — "Save changes" in edit form; also check if the edit screen
  needs a scroll to reach the save button (`scrollUntilVisible id: "sentiment-3"`
  is already there, check if "Save changes" also needs one)
- `ab-satfat-ingredients` — "butter, cream" not visible in edit; likely the
  Ingredients field requires a scroll in the edit screen too

---

## Priority 3 — Ingredient insights (Group 5)

### `d-ingredient-insights`

The `seed-ingredient-reactions.yaml` helper enters `"onion, garlic"` in the
Ingredients field for 3 entries with sentiment 1. `buildLogEntry` DOES call
`extractTags` on the ingredients text (confirmed: `formModel.ts:150-157`), so
the tags SHOULD be written to `tagsJson`.

Failure point: the `scrollUntilVisible: text: "Ingredients you react to"` step
fails, meaning the section doesn't appear in Insights. Either:

a) The ingredients text didn't persist (Maestro's `inputText` didn't actually set
   the field value before save), or
b) The tags were written but `analyzeIngredientSentiment` didn't trigger (check
   its threshold: `MIN_TAG_OCCURRENCES = 3` and `LOW_SENTIMENT_MAX = 2.5`).

**Investigation:** Re-run only this flow with `--debug-output` to see what's on
screen when the scroll fails. Also add an intermediate Journal-reopen step to the
seed helper to confirm ingredients text persists.

**If (a):** Add `hideKeyboard` + a brief `waitForAnimationToEnd` after
`inputText: "onion, garlic"` before scrolling/saving, to ensure the field
commits its value.

**If (b):** Check `src/features/analysis/insights.ts` around
`analyzeIngredientSentiment` — confirm the function uses `parseTagsJson` on
`entry.tagsJson` and check whether 3 entries with avg sentiment 1.0 meet all
thresholds.

### `e-temporal-insights`

The Insights summary always renders `{summary.bmEntries} BM` — even `"0 BM"`
contains "BM". If this assertion is failing, either the BM logging in the flow
failed (Investigation A + B above), or `computeInsights` is computing `bmEntries`
differently than expected. After fixing the BM visibility issue (Group 3), re-run
to see if this resolves itself.

---

## Suggested execution order

1. **Fix and commit Group 1 YAML fixes** (1a–1d): no investigation needed,
   do it in one commit. Re-run `npm run e2e:ci` to confirm those 5 flows now
   pass.

2. **Read the two investigation files** (`entry/new.tsx`, `useEntries.ts`), then
   **fix and commit Group 2 + 3 flows**.

3. **Re-run `npm run e2e:ci`** and assess Group 5 with a narrower failure list
   and (optionally) `npm run e2e:debug` for the ingredient insights flow.

4. **Update `docs/E2E.md` and `docs/ACCEPTANCE.md`** once flows pass (flip
   `⏳ Authored` → `✅ Automated` in the coverage table, flip `[ ]` → `[x]`
   in ACCEPTANCE.md for each newly passing item).

5. **Write a new `docs/RESULTS.md`** after the re-run.

---

## Files to read first (before writing fixes)

| File | Why |
|------|-----|
| `src/app/entry/new.tsx` | Does it call `router.back()` after save? |
| `src/app/bm/new.tsx` | Same question |
| `src/app/symptom/new.tsx` | Same question |
| `src/features/logging/useEntries.ts` | Does it use `useFocusEffect`? |
| `flows/01e-reminders.yaml` | Full flow to rewrite |
| `flows/i-backup.yaml` | Full flow to rewrite |
| `flows/settings-smoke.yaml` | Fix pre-scroll assertions |
| `flows/h-recent-foods.yaml` | Fix save-button assertion |
| `flows/03-insights.yaml` | Fix "across" scroll |

Existing passing flows as reference for correct patterns:
- `flows/nav-tabs.yaml` — correct `id:` tab-bar navigation
- `flows/journal-calendar.yaml` — correct Journal tab entry + mode toggle
