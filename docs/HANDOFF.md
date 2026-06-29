# HANDOFF.md — Session 4: Proper UX fixes + 4 remaining flows

**Input contract:** Read `docs/RESULTS.md` (all sessions) for full context. Read
`docs/E2E.md` for Maestro protocol and run commands. Read root `CLAUDE.md` for
conventions. This document is the executable prescription for the session 4 execute
agent.

**Device:** Pixel 5 (`0A131FDD4006VE`). App installed; `adb devices` must show it
before `npm run e2e`.

---

## Status at handoff

| Flow | State |
|------|-------|
| `00-launch`, `01c-barcode-fallback`, `01d-browse-edit`, `01e-reminders`, `03-insights`, `h-recent-foods`, `i-backup`, `journal-calendar`, `nav-tabs`, `settings-smoke`, `ux3-scan-screen` | ✅ passing — do not touch |
| `02-bm-tracking` | ✅ passing — count-based assertions, do not touch |
| `01b-manual-entry`, `f-serving-size`, `g-datetime-picker` | ✅ passing via `hideKeyboard` hack — **must be reworked** (see App Change 1) |
| `c-symptom-logging` | ❌ blocked — emoji-prefixed `EntryRow` inaccessible to Maestro |
| `e-temporal-insights` | ⏳ YAML updated in session 3, not yet run |
| `ab-satfat-ingredients` | ⏳ YAML updated in session 3, not yet run |
| `d-ingredient-insights` | ⏳ YAML updated in session 3 (via helper), not yet run |

Target: **19/19** passing.

---

## App Change 1 — Fix `KeyboardAvoidingView` for Android (`src/app/entry/new.tsx`)

### Why this matters (owner feedback)

Session 3 fixed Groups A flows by adding `hideKeyboard` immediately before
`scrollUntilVisible: "Save entry"`. The owner pushed back: dismissing the keyboard
before saving is not how a real user uses the app. The form should scroll far enough
that the Save button is visible above the keyboard — the user can reach it without
manually dismissing.

### Root cause

`new.tsx:34` uses `behavior="height"` for Android. React Native on Android defaults to
`adjustPan` window soft input mode (the keyboard overlays content and pans the active
field into view — the window itself does not resize). With `adjustPan`, `behavior="height"`
reads a keyboard offset of zero (no window resize happened), so the `KeyboardAvoidingView`
does nothing. The keyboard overlays the bottom of the scroll area, blocking the Save
button.

### Fix

**File:** `src/app/entry/new.tsx`, line 34

Change:
```tsx
behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
```
to:
```tsx
behavior="padding"
```

`behavior="padding"` adds `paddingBottom = keyboardHeight` to the `KeyboardAvoidingView`
regardless of window resize mode. Combined with `keyboardShouldPersistTaps="handled"`
already on the `ScrollView`, the scrollable area shrinks to above the keyboard and
the Save button is reachable by scrolling — without the user dismissing the keyboard first.

**If Save is still partially hidden after this change:** add
`keyboardVerticalOffset={StatusBar.currentHeight ?? 0}` (import `StatusBar` from
`react-native`) to account for modal header height. Try without it first.

### After app fix: remove the three `hideKeyboard` hacks from Group A flows

These were committed in `b46a38f` solely to work around the keyboard issue. With the
app properly fixed, they are no longer needed and should be removed so the flows
accurately reflect real user behaviour.

| File | Line | What to remove |
|------|------|----------------|
| `flows/01b-manual-entry.yaml` | 69 | `- hideKeyboard` — the one between `- inputText: "28"` and the `# Save` comment |
| `flows/f-serving-size.yaml` | 48 | `- hideKeyboard` — between `- inputText: "0"` and `- scrollUntilVisible: "Save entry"` |
| `flows/g-datetime-picker.yaml` | 41 | `- hideKeyboard` — between `- inputText: "Date picker test"` and `- scrollUntilVisible: "Save entry"` |

**Do NOT remove** the `hideKeyboard` at line 17 of `01b-manual-entry.yaml` — that one
dismisses the text keyboard so the Lunch meal-slot chip can be tapped, which is
realistic user behaviour.

**Verify each flow passes without the removed `hideKeyboard`:**
```
npm run e2e:flow flows/01b-manual-entry.yaml
npm run e2e:flow flows/f-serving-size.yaml
npm run e2e:flow flows/g-datetime-picker.yaml
```

**Commit:** `fix(form): use behavior=padding for KeyboardAvoidingView on Android`

---

## App Change 2 — `testID` on `EntryRow` Pressable (`src/features/logging/EntryRow.tsx`)

### Root cause

Maestro finds elements by Android's `getText()` API. For a `Pressable` that contains a
`Text` node starting with an emoji (`"🤢 Bloating"`, `"💩 Bowel movement"`), the emoji
corrupts `getText()` for the **entire Pressable**, including its children. Session 3's
systematic test confirmed this: even `"Severity 3"` in the subtitle of an emoji-prefixed
row is invisible to Maestro, while `"Oatmeal"` (food entry, no emoji title) is fine.

The `Pressable` already carries an emoji-free `accessibilityLabel`, but Maestro's text
matching uses `getText()`, not `getContentDescription()`.

### Fix

**File:** `src/features/logging/EntryRow.tsx`, line 44

Add a `testID` prop to the `Pressable`:
```tsx
<Pressable
  testID={`entry-row-${(entry.name || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
  accessibilityRole="button"
  ...
>
```

This produces deterministic IDs for entries the flows care about:
- `"Bloating"` → `entry-row-bloating`
- `"Bowel movement"` → `entry-row-bowel-movement`
- Food entries also get IDs (harmless; `d-ingredient-insights` may use them later)

**Run verification rungs before e2e:**
```
npm run typecheck && npm run lint && npm test
```
All three must be green before running any Maestro flows.

**Commit this together with the `c-symptom-logging` YAML change below.**

---

## YAML Change — `flows/c-symptom-logging.yaml`

After App Change 2, all four places that target the Bloating `EntryRow` by text must
switch to the `id:` selector. The subtitle assertion (`"Severity 3"`) is also dropped
from the Journal view — it lives inside the same inaccessible Pressable — because
severity is already confirmed in the edit-screen assertion at the end of the flow.

### Journal assertion block (current lines 29–33)

Replace:
```yaml
# Entry name is the symptom type label; row shows "🤢 Bloating"
- assertVisible: "Bloating"
# Subtitle: "Symptom · Bloating · Severity 3"
- assertVisible: "Severity 3"
```
with:
```yaml
# EntryRow for emoji-prefixed entries is not text-accessible via Maestro getText().
# Use the testID added to the Pressable in EntryRow.tsx.
- assertVisible:
    id: "entry-row-bloating"
# "Severity 3" subtitle is inside the same inaccessible Pressable — skip here;
# severity is confirmed in the edit-screen assertion at the end of this flow.
```

### Symptom-filter assertion (current line 37)

Replace:
```yaml
- assertVisible: "Bloating"
```
with:
```yaml
- assertVisible:
    id: "entry-row-bloating"
```

### Food-filter assertion (current line 45)

Replace:
```yaml
- assertNotVisible: "Bloating"
```
with:
```yaml
- assertNotVisible:
    id: "entry-row-bloating"
```

### Edit sub-test navigation (current line 51)

Replace:
```yaml
# Tap the Bloating row to open entry/[id] edit screen
- tapOn: "Bloating"
```
with:
```yaml
# Tap the Bloating row to open entry/[id] edit screen
- tapOn:
    id: "entry-row-bloating"
```

**Verify:**
```
npm run e2e:flow flows/c-symptom-logging.yaml
```

**Commit (together with EntryRow.tsx change):**
`fix(e2e): add testID to EntryRow, fix emoji-prefixed entry navigation (Group B)`

---

## Verify remaining flows — YAML already updated in session 3

These flows had YAML fixes applied but were not run. Execute in order.

### `flows/e-temporal-insights.yaml`

```
npm run e2e:flow flows/e-temporal-insights.yaml
```

Seeds 2 meals + 1 BM, navigates to Insights, scrolls to "Your journal so far",
asserts "BM" and "food" appear in the summary line.

**If still failing:** The modal dismiss may not have completed before the Insights tab
was tapped. Add a second `waitForAnimationToEnd` after `assertVisible: "TummyTracker"`.
If the screen doesn't scroll to "Your journal so far", check whether
`computeInsights` renders a different heading string.

### `flows/ab-satfat-ingredients.yaml`

```
npm run e2e:flow flows/ab-satfat-ingredients.yaml
```

Fills "butter, cream" in Ingredients, saves, reopens the entry, asserts "butter, cream"
is pre-filled. The `waitForAnimationToEnd` after `hideKeyboard` for Ingredients was
added in session 3 to let state settle before the scroll.

**If "butter, cream" is still missing after save:** The text is not being persisted
to the DB. Check `src/features/logging/formModel.ts` — confirm `state.ingredientsText`
flows into the `buildLogEntry` return value and maps to the `ingredientsText` column
in the Drizzle schema. Add a temporary intermediate assertion: after save but before
navigating to Journal, add:
```yaml
- tapOn:
    id: "tab-journal"
- tapOn: "Sat Fat Test"
- scrollUntilVisible:
    element:
      text: "butter, cream"
    direction: DOWN
- assertVisible: "butter, cream"
```
If this intermediate assert also fails, the value never reached the DB.

### `flows/d-ingredient-insights.yaml`

```
npm run e2e:flow flows/d-ingredient-insights.yaml
```

Seeds 3 "Onion Dish" entries via `_helpers/seed-ingredient-reactions.yaml`, navigates
to Insights, asserts "Ingredients you react to" section and "onion" card appear.

**This flow depends on ingredients text persisting correctly** — if
`ab-satfat-ingredients` fails for a DB reason, fix that first; both flows share the
same root cause.

**Commit if no YAML changes were needed:**
`fix(e2e): verify e-temporal-insights, ab-satfat-ingredients, d-ingredient-insights`

---

## Final step — full suite

```
npm run e2e
```

Target: **19/19**. Record date and pass count in `docs/RESULTS.md`. If any
previously-passing flows regress, diagnose before closing the session.

---

## Files summary

| File | Change |
|------|--------|
| `src/app/entry/new.tsx` | Line 34: `behavior="padding"` (both platforms) |
| `src/features/logging/EntryRow.tsx` | Line 44: add `testID` prop to `Pressable` |
| `flows/01b-manual-entry.yaml` | Line 69: remove `- hideKeyboard` |
| `flows/f-serving-size.yaml` | Line 48: remove `- hideKeyboard` |
| `flows/g-datetime-picker.yaml` | Line 41: remove `- hideKeyboard` |
| `flows/c-symptom-logging.yaml` | 4 selector changes: assertVisible×2, assertNotVisible, tapOn |
| `flows/e-temporal-insights.yaml` | Verify only — YAML already updated |
| `flows/ab-satfat-ingredients.yaml` | Verify only — YAML already updated |
| `flows/d-ingredient-insights.yaml` | Verify only — YAML already updated |

**Two app changes require verification rungs before any e2e run:**
```
npm run typecheck && npm run lint && npm test
```
