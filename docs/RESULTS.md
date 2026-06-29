# RESULTS.md — Maestro session 2026-06-28 (execute session 2)

## Summary

- **Flows run:** 19 · **Passed:** 11 · **Failed:** 8
- **Rungs:** typecheck ✅ lint ✅ test ✅ (unchanged from prior session)
- **Device:** Pixel 5 (`0A131FDD4006VE`)
- **Runs this session:** 2 (run 1: 10/19; run 2: 11/19 after second-pass fixes)

### Progress vs. prior session

| Session | Passed | Fixed this session |
|---------|--------|--------------------|
| 2026-06-28 session 1 (baseline) | 5/19 | — |
| 2026-06-28 session 2 (this session) | 11/19 | +6 |

Flows newly passing this session: `01d-browse-edit`, `01e-reminders`,
`h-recent-foods`, `i-backup`, `settings-smoke`, `03-insights`

---

## Per-flow results

| Flow | Result | Failure step |
|------|--------|--------------|
| `00-launch` | ✅ pass | — |
| `01b-manual-entry` | ❌ fail | `assertVisible "Scan barcode"` — false after entry/new save |
| `01c-barcode-fallback` | ✅ pass | — |
| `01d-browse-edit` | ✅ pass | — |
| `01e-reminders` | ✅ pass | — |
| `02-bm-tracking` | ❌ fail | `assertVisible "Bowel movement"` — false after tab switch |
| `03-insights` | ✅ pass | — |
| `ab-satfat-ingredients` | ❌ fail | `scrollUntilVisible "butter, cream"` — no element found |
| `c-symptom-logging` | ❌ fail | `assertVisible "Bloating"` — false after tab switch |
| `d-ingredient-insights` | ❌ fail | `scrollUntilVisible ~"Ingredients"` — not found |
| `e-temporal-insights` | ❌ fail | `assertVisible "BM"` — false |
| `f-serving-size` | ❌ fail | `assertVisible "Scan barcode"` — false after entry/new save |
| `g-datetime-picker` | ❌ fail | `assertVisible "Scan barcode"` — false after entry/new save |
| `h-recent-foods` | ✅ pass | — |
| `i-backup` | ✅ pass | — |
| `journal-calendar` | ✅ pass | — |
| `nav-tabs` | ✅ pass | — |
| `settings-smoke` | ✅ pass | — |
| `ux3-scan-screen` | ✅ pass | — |

---

## Failure diagnosis

### Group A — Post-save sync fails on first modal cycle (3 flows)

**`01b-manual-entry`, `f-serving-size`, `g-datetime-picker`**

All three open `entry/new` (declared `presentation: 'modal'` in `_layout.tsx`)
as their *first* modal of the run. After `tapOn: "Save entry"` +
`waitForAnimationToEnd`, neither `assertVisible: "TummyTracker"` nor
`assertVisible: "Scan barcode"` (both tried) succeeds. Yet the `seed-two-meals`
helper — which also saves via `entry/new` — immediately taps `"Add an entry
manually"` after the same `waitForAnimationToEnd` and succeeds.

**Key asymmetry:** flows that first run `seed-two-meals` (opening `entry/new`
twice) before their main action have no timing trouble; flows that open `entry/new`
cold (first interaction in a fresh `clearState` run) consistently fail the
post-save sync assertion.

**Hypothesis:** On the first modal cycle after a cold start, the async DB write +
`router.back()` settle slower than `waitForAnimationToEnd` implies — possibly
because the SQLite connection and Drizzle initialise lazily on the first write.
Subsequent saves hit a warm connection and complete within the animation window.

**`tapOn`-based steps work despite the assertion failure** because `tapOn` has
a longer implicit retry timeout than `assertVisible`.

**Suggested fix for Opus planning session:**
- Option 1 (flow-only): Replace the sync assertion with `tapOn: id: "tab-home"`
  (which retries until the tab bar is present) before navigating to the Journal.
- Option 2 (app change): Add a small explicit warm-up step in the app's DB
  initialisation so the first write is not on the critical path of save→navigate.

---

### Group B — BM and symptom entries not visible in Journal after save (2 flows)

**`02-bm-tracking`, `c-symptom-logging`**

The save succeeds (`assertVisible: "TummyTracker"` passes — router.back() ran),
`tapOn: id: "tab-journal"` + `waitForAnimationToEnd` completes, but
`assertVisible: "Bowel movement"` / `assertVisible: "Bloating"` fails. The entry
is in the DB (navigation confirms it) but the Journal list does not render it.

Source context:
- `EntryRow.tsx:54` — BM name rendered as `"💩 Bowel movement"` (emoji prefix);
  subtitle is `"Bowel movement · Type 4"`. `assertVisible: "Bowel movement"`
  should match both (substring).
- `explore.tsx` Journal uses `useAllEntries()` (Drizzle `useLiveQuery`). Default
  filter is `'all'`, default mode is `'day'`. Day range is local midnight → +24h.
  Both should include a just-saved BM entry.

**Hypothesis A — scroll needed:** The Journal header (calendar + mode toggle +
filter chips) consumes significant vertical space. With 3 entries visible (2 food
from seed + 1 BM), the BM entry may be below the fold. `assertVisible` does not
scroll; the entry is present but off-screen.

**Hypothesis B — live query timing:** `useLiveQuery` fires a DB subscription. If
the re-render hasn't completed within `waitForAnimationToEnd`'s window, the
Journal may render the pre-BM entry list. A second `waitForAnimationToEnd` or an
explicit `scrollUntilVisible` would give the query time to settle.

**Suggested fix:** Replace `assertVisible: "Bowel movement"` with
`scrollUntilVisible: text: "Bowel movement"` + `assertVisible`. If that still
fails, the entry is genuinely absent — escalate to an app investigation.

---

### Group C — Ingredients text not persisting (2 flows)

**`ab-satfat-ingredients`:** After `inputText: "butter, cream"` + `hideKeyboard`
in the new-entry form, save, reopen via Journal — `scrollUntilVisible: "butter,
cream"` finds no matching element anywhere in the edit screen. Either the
ingredients text did not persist to the DB, or the edit screen's TextInput value
is not accessible to Maestro's accessibility tree scanner.

**`d-ingredient-insights`:** `seed-ingredient-reactions.yaml` inputs `"onion,
garlic"` in the Ingredients field for 3 entries (sentiment 1). After seeding,
`scrollUntilVisible: ~"Ingredients you react to"` on the Insights screen fails —
the section never appears. `analyzeIngredientSentiment` requires `MIN_TAG_OCCURRENCES = 3`
and `LOW_SENTIMENT_MAX = 2.5`; the seeded data should satisfy both. Root cause is
most likely the same as `ab-satfat-ingredients`: the ingredients text is not
being committed before save.

**Shared hypothesis:** Maestro's `inputText` sets characters via the keyboard
event pipeline. If the `TextInput` component uses a controlled value (React
`onChangeText` state), each keystroke fires `onChangeText`. But if the component
debounces or only reads the value on `onBlur`, `hideKeyboard` (which triggers
blur) should commit it. A `waitForAnimationToEnd` after `hideKeyboard` — before
scrolling away — may be needed to let the blur handler fire and React state
update before the scroll event causes focus to shift.

**Suggested investigation:** Add an intermediate step in the seed helper that
reopens the just-saved entry and asserts `"butter, cream"` is visible. If the
intermediate assert also fails, the text is not persisting. If it passes, the
issue is in the subsequent flow step.

---

### Group D — Insights summary "BM" text (1 flow, likely depends on Group B)

**`e-temporal-insights`:** Same BM save as Group B, then navigates to Insights
tab. `assertVisible: "BM"` fails on the summary line
`"{n} entries · {n} food · {n} BM · {n} rated"`. Even `"0 BM"` contains `"BM"`,
so if Maestro does substring matching the assertion should always pass once the
Insights screen renders. Possible explanations:

1. The BM entry wasn't saved (but navigation succeeded — same ambiguity as Group B).
2. There is NO post-save sync before navigating to Insights; if the BM modal is
   mid-dismiss when `tab-insights` is tapped, `computeInsights` runs with stale
   entry data.
3. Maestro may require exact text matching for `assertVisible`; if so, the full
   summary line text is needed.

**Suggested fix:** Add `assertVisible: "TummyTracker"` sync after BM save (same
pattern that passes in `02-bm-tracking`), then re-run. If still failing, add
`scrollUntilVisible: "Your journal so far"` to confirm the Insights screen is
fully rendered before asserting "BM".

---

## What changed this session

| Commit | Change |
|--------|--------|
| `717aab9` | Group 1 YAML fixes: `01e-reminders`, `i-backup`, `settings-smoke`, `h-recent-foods`, `03-insights` |
| `58d38c5` | Post-save sync points: `01b`, `f-serving-size`, `g-datetime-picker`, `02-bm-tracking`, `c-symptom-logging`, `01d-browse-edit`, `ab-satfat-ingredients` |
| `af17902` | Second-pass fixes from run 1: sync strategy, Journal wait, "across"→"Based on 5 logs.", ingredient scroll |

---

## For the next planning session (Opus)

**Remaining flow failures need one of:**

1. **A deeper Maestro sync strategy** for Group A — the current `waitForAnimationToEnd`
   + `assertVisible` pattern is insufficient for cold-start modal saves. Either
   use `tapOn: id: "tab-home"` as a retry-backed sync, or investigate whether the
   app's DB initialisation can be made synchronous.

2. **A scroll-first strategy for Group B** — replace bare `assertVisible` with
   `scrollUntilVisible` + `assertVisible` for BM/symptom journal entries. If that
   still fails, investigate whether `useLiveQuery` re-renders synchronously
   within `waitForAnimationToEnd`.

3. **Ingredients TextInput commit for Group C** — add `waitForAnimationToEnd`
   after `hideKeyboard` when filling the Ingredients field. Also investigate
   whether the TextInput value is accessible to Maestro at all in the edit screen.

4. **Group D** resolves once Group B is fixed (both depend on BM save timing).
