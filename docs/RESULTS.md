# RESULTS.md — Maestro run 2026-06-28

## Summary

- **Flows run:** 19 · **Passed:** 5 · **Failed:** 14
- **Rungs:** typecheck ✅ lint ✅ test ✅ (165 tests, 23 suites)
- **bundle:check:** not run this session (no native dependency changes)
- **Device:** Pixel 5 (`0A131FDD4006VE`) · **Total runtime:** ~22 min

---

## Per-flow results

| Flow | Result | Failure step |
|------|--------|--------------|
| `00-launch` | ✅ pass | — |
| `01b-manual-entry` | ❌ fail | `tapOn id: "tab-journal"` — element not found |
| `01c-barcode-fallback` | ✅ pass | — |
| `01d-browse-edit` | ❌ fail | `tapOn text: "Save changes"` — element not found |
| `01e-reminders` | ❌ fail | `tapOn text: "Reminder settings"` — element not found |
| `02-bm-tracking` | ❌ fail | `assertVisible "Bowel movement"` — false |
| `03-insights` | ❌ fail | `assertVisible "across"` — false |
| `ab-satfat-ingredients` | ❌ fail | `assertVisible "butter, cream"` — no visible element |
| `c-symptom-logging` | ❌ fail | `assertVisible "Bloating"` — false |
| `d-ingredient-insights` | ❌ fail | `scrollUntilVisible text: "Ingredients"` — not found |
| `e-temporal-insights` | ❌ fail | `assertVisible "BM"` — false |
| `f-serving-size` | ❌ fail | `tapOn id: "tab-journal"` — element not found |
| `g-datetime-picker` | ❌ fail | `tapOn id: "tab-journal"` — element not found |
| `h-recent-foods` | ❌ fail | `assertVisible text: "Save entry"` — false |
| `i-backup` | ❌ fail | `tapOn text: "Reminder settings"` — element not found |
| `journal-calendar` | ✅ pass | — |
| `nav-tabs` | ✅ pass | — |
| `settings-smoke` | ❌ fail | `assertVisible "App"` — false |
| `ux3-scan-screen` | ✅ pass | — |

---

## Failure diagnosis

The 14 failures cluster into four root-cause groups. No `--debug-output` was
captured this run; the diagnoses below are from cross-referencing the failing
step against the current source. Re-run with `npm run e2e:debug` to get
per-step screenshots if any diagnosis is uncertain.

---

### Group 1 — Stale label in existing flows (2 flows, trivial fix)

**`01e-reminders` and `i-backup`** both tap `text: "Reminder settings"` to
navigate to the Settings screen. That text does not exist in the app. The
Settings screen is a bottom tab (`id: "tab-settings"`) and its content heading
is `"Settings"` (`settings.tsx:159`). The section heading is `"Reminders"`, not
`"Reminder settings"`.

These flows were written before Settings became a tab, when there may have been
a dedicated "Reminder settings" navigation target. **Fix:** Replace
`tapOn: text: "Reminder settings"` with `tapOn: id: "tab-settings"` +
`waitForAnimationToEnd` in both flows.

---

### Group 2 — Tab bar not findable after form save (3 flows)

**`01b-manual-entry`, `f-serving-size`, `g-datetime-picker`** all fail at
`tapOn: id: "tab-journal"` *after* saving an entry form. The identical step
succeeds in `nav-tabs` and `01d-browse-edit` (which tap `tab-journal` from the
Home screen *without* first going through a form save).

The entry new/edit screens (`/entry/new`, `/bm/new`, etc.) are stack screens
outside the tab group — the tab bar is hidden while they're active. After
`tapOn: "Save entry"` + `waitForAnimationToEnd`, one of two things is happening:

a) **The save navigates back to a tab screen but the navigation animation hasn't
   completed** when Maestro tries to tap `tab-journal`. `waitForAnimationToEnd`
   may be signalling completion on the dismiss animation of the form, not on the
   completion of the push-back-to-tabs navigation.

b) **The save is not navigating at all** (form stays visible, tab bar remains
   hidden), which could happen if the form has a silent validation error.

**Investigation:** Check `src/app/entry/new.tsx` (or wherever `onSubmit` is
defined) to confirm `router.back()` or equivalent is called after a successful
save. Then re-run with `--debug-output` to see the screen state at failure.

**Likely fix:** After saving, explicitly assert you're back on the Home screen
(`assertVisible: "TummyTracker"`) before tapping `tab-journal`, giving Maestro a
synchronization point after navigation.

---

### Group 3 — BM and symptom entries not visible in Journal (3 flows)

**`02-bm-tracking`** saves a BM entry, successfully taps `tab-journal` (the
Journal tab IS reachable), but `assertVisible: "Bowel movement"` fails. The BM
entry subtitle (`EntryRow.tsx:21`) is `"Bowel movement · Type 4"` — both the
name and subtitle contain "Bowel movement" and should be visible.

**`c-symptom-logging`** similarly fails: symptom logged, Journal tab reached,
but `assertVisible: "Bloating"` fails. The symptom entry name is the type label
(`"Bloating"` via `symptomEntryName`).

**`01d-browse-edit`** fails at `tapOn: text: "Save changes"` which suggests the
edit screen was opened but the submit button label or scroll position is wrong.
(Note: the edit screen save button IS labelled "Save changes" in `entry/[id].tsx`
— scroll may be needed first.)

Possible causes for the Journal display failures:

a) **`useAllEntries` returns stale data.** If the hook doesn't invalidate when a
   new entry is added via a stack screen navigation, the Journal could show a
   cached empty state. Contrast: the seed-two-meals helper logs entries via the
   manual form within the *same* navigation context and `01d-browse-edit` finds
   those entries correctly — suggesting food entries seeded before navigating to
   Journal are visible, but entries added *during* a different navigation flow
   (BM screen, symptom screen) may not be refreshed.

b) **The Journal Day filter shows today's entries, but the BM/symptom entries
   have a mismatched `loggedAt` timestamp.** Unlikely since the forms default to
   `Date.now()`.

c) **The entry saved but the BM screen navigated back to a stale Journal
   context.** If the Journal's `useFocusEffect` isn't refreshing data on focus,
   entries added after the last focus event won't appear.

**Investigation:** Check `src/features/logging/useEntries.ts` — does it use
`useFocusEffect` to refetch? Check whether `02-bm-tracking` and
`c-symptom-logging` would pass if a `tapOn: id: "tab-home"` + `tapOn: id:
"tab-journal"` round-trip is added before the assertVisible (forcing a focus
refresh).

---

### Group 4 — Assertions on below-fold content (3 flows, flow-only fixes)

**`settings-smoke`** asserts `"App"` before any scroll. The Settings screen is a
scroll view; "App" is the third section heading, typically off-screen on a Pixel 5
display. Fix: remove the pre-scroll `assertVisible: "App"` and `assertVisible:
"Import data"` (they're also confirmed after the scroll anyway), or
`scrollUntilVisible` before each.

**`h-recent-foods`** asserts `assertVisible: text: "Save entry"` without scrolling
first. The entry form's save button is always below the fold on a full form. Fix:
use `scrollUntilVisible: text: "Save entry"` before asserting and tapping.

**`03-insights`** finds "Wheat Bread" (the card title) via `scrollUntilVisible`
but then `assertVisible: "across"` fails. The card body (`foodSentence` →
`"Wheat Bread: average sentiment X across Y logs."`) immediately follows the title
within the same card. Most likely the card body is still partially off-screen after
the title becomes visible. Fix: `scrollUntilVisible: text: "across"` instead of
assertVisible, OR scroll a bit further after finding the title.

---

### Group 5 — Ingredient insights not triggered (2 flows)

**`d-ingredient-insights`** fails: `scrollUntilVisible text: "Ingredients"` (i.e.
`"Ingredients you react to"`) not found. The section only renders when
`ingredientFindings.length > 0` (`insights.tsx:116`), which requires
`MIN_TAG_OCCURRENCES = 3` rated food entries sharing a tag.

The seed helper (`seed-ingredient-reactions.yaml`) creates 3 Onion Dish entries
with `inputText: "onion, garlic"` in the Ingredients field. This SHOULD produce
the "onion" and "garlic" tags via `extractTags` (confirmed in `formModel.ts`).

Possible failure points: (a) the `inputText` step fills the Ingredients field but
the text doesn't persist to the form state before save (e.g., a `hideKeyboard`
issue or the field loses focus before the save read), or (b) the save picks up the
ingredients but `tagsJson` isn't written correctly.

**Investigation:** Add an intermediate Journal-reopen step in the seed helper to
confirm the ingredients text appears, then re-run. Also check if the
`hideKeyboard` call after `inputText: "onion, garlic"` is necessary or if the
field needs a blur event before the form reads it.

**`e-temporal-insights`** asserts `"BM"` in the Insights summary line. The
summary always renders `{summary.bmEntries} BM` even when bmEntries = 0 (the
string "0 BM" contains "BM"). Yet the assertion fails. This is unexpected and
likely indicates the BM entry failed to save (same root cause as Group 3), making
the summary show "2 entries · 2 food · 0 BM · 2 rated" — but "0 BM" still
contains "BM". 

A more likely explanation: the Insights screen's `computeInsights(entries)` call
receives the `useAllEntries()` result which may be stale (Group 3 cause (c)),
or the summary text renders differently at count 0. **Investigation:** Check
whether `summary.bmEntries` is rendered as `0` or omitted. Also check
`src/features/analysis/insights.ts` `computeInsights` to see how `bmEntries` is
calculated.

---

## ACCEPTANCE.md changes made this session

None — no flows passed that weren't already green. The test-execute session that
produces clean flow results should flip the checkboxes.

---

## Findings for the next planning session

1. **Group 1 fix (easy):** `01e-reminders` and `i-backup` — replace
   `tapOn: text: "Reminder settings"` with `tapOn: id: "tab-settings"`.

2. **Group 2 investigation:** Does `entry/new.tsx` call `router.back()` after save?
   If yes, add `assertVisible: "TummyTracker"` as a sync point before tapping
   `tab-journal`. If no, that is an app bug.

3. **Group 3 investigation:** Does `useAllEntries` / `useEntries.ts` use
   `useFocusEffect` to refresh? If not, entries logged from non-tab stack screens
   may not appear in the Journal until the next navigation cycle. This is the
   likeliest cause of the BM and symptom visibility failures.

4. **Group 4 fixes (easy):** Scroll-before-assert in `settings-smoke`,
   `h-recent-foods`, and `03-insights`.

5. **Group 5 investigation:** Re-run `d-ingredient-insights` with `--debug-output`
   to confirm whether the Ingredients field actually retains the inputted text
   before save.

6. **Missing Insights heading (finding from flow authoring):** The Insights screen
   has no `<ThemedText type="subtitle">Insights</ThemedText>` heading, unlike
   Journal and Settings. Minor cosmetic gap; worth a one-line component edit.

7. **Re-run strategy:** Fix Groups 1 + 4 first (YAML-only, no app changes). That
   should unblock `01e-reminders`, `i-backup`, `settings-smoke`, `h-recent-foods`,
   and `03-insights`. Then re-run and use the narrowed failure list to guide the
   Group 2 + 3 investigation.
