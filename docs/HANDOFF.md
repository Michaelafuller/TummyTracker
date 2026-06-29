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

## Priority 2 — Post-save sync point (Groups 2 & 3 — NOT app bugs)

> **Diagnosis corrected after source verification (Opus, this session).** The
> earlier draft of this section asked you to investigate two *suspected app bugs*.
> Both were checked against the source and are **false** — do not chase them:
>
> - **All three save screens already call `router.back()`** after an awaited
>   `createLogEntry` — `entry/new.tsx:25`, `bm/new.tsx:18`, `symptom/new.tsx:18`
>   (and `entry/[id].tsx` for edits). Navigation is not missing.
> - **`useEntries.ts` already uses Drizzle `useLiveQuery`** (`useEntries.ts:12`) —
>   a live SQLite subscription that re-renders on every insert/edit. So the
>   Journal does *not* need `useFocusEffect`. **Do not add it** — it would be a
>   pointless app change that fixes nothing.
>
> Groups 2 and 3 are therefore the **same root cause: a missing post-save
> synchronization point in the flows.** A form `Save` fires an *awaited* DB write
> then `router.back()`; `waitForAnimationToEnd` does not wait for that async work.
> Maestro races ahead and taps `tab-journal` while the form is still dismissing
> (tab bar not yet present → "Id not found"), or asserts the new entry before the
> live query has repainted. This is a **flow fix, no app change.**

**The fix (apply to every save→navigate step):** add a positive sync point that
forces Maestro to wait for the return to a tab screen before proceeding.
```yaml
- tapOn: "Save entry"            # or "Save" (BM/symptom)
- waitForAnimationToEnd
- assertVisible: "TummyTracker"  # sync: we're back on Home; save + nav have settled
- tapOn:
    id: "tab-journal"
- assertVisible: "<the entry>"   # live query has the row by now
```

Apply it to:
- `01b-manual-entry`, `f-serving-size`, `g-datetime-picker` — sync after save,
  then the Journal assertion (Group 2).
- `02-bm-tracking`, `c-symptom-logging` — same sync after `Save`; the live query
  will then show the BM/symptom row (Group 3).
- `01d-browse-edit` — the edit submit label is `"Save changes"` (`entry/[id].tsx`,
  below the fold): `scrollUntilVisible text: "Save changes"` before tapping it.
- `ab-satfat-ingredients` — on reopen, `scrollUntilVisible` the Ingredients field
  before asserting `"butter, cream"` (the edit screen scrolls too).

**Only if a flow still fails after the sync point:** capture `npm run e2e:debug`
screenshots and re-diagnose — *then* it may be a real app bug. Verify against
source before writing one up (see `docs/TEST_STRATEGY.md §4`, "verify before
blaming the app").

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
