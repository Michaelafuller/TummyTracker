# PROGRESS.md — TummyTracker roadmap

**North star:** help the user *find what's making them feel bad and act on it.* Not
calorie counting. Every item below is ranked by how much it serves that goal — either
by surfacing a trigger, or by capturing the clean, consistent data that lets us.

## Status

- **MVP shipped — Phases 0–3** (scaffold + verification loop, manual & barcode entry,
  browse/edit with day/week/month calendar, local reminders, bowel-movement tracking,
  correlation insights). Running on the Pixel 5 via an EAS `preview` APK.
- **Flagship trio shipped** (saturated fat, ingredient/allergen capture, ingredient→sentiment
  correlation, symptom logging, temporal meal→outcome correlation) — all in `main`.
- Health: **127 tests**, all three rungs + `npm run bundle:check` green, tree clean on `main`.
- Recent post-MVP fixes: dark-mode contrast, visible calendar toggle, `.sql` bundling.

### Completed since last handoff

| Commit | What shipped |
|--------|-------------|
| `feat(data): capture saturated fat` | sat-fat column end-to-end (migration 0002, lib, form, OFF map) |
| `feat(data): capture ingredients and allergen/additive tags` | `ingredients_text` + `tags_json` columns (migration 0003); `extractTags` + `normalizeTag` in `lib/ingredients.ts`; OFF mapper extended; manual ingredient field in LogEntryForm |
| `feat(analysis): ingredient/sentiment insights` | `analyzeIngredientSentiment` groups rated food entries by normalized tag, gates on MIN\_TAG\_OCCURRENCES=3; surfaced in Insights screen as "Ingredients you react to" |
| `feat(symptoms): add symptom as a logged type` | 9 symptom types + severity 1–5 scale; SymptomForm, /symptom/new screen, home CTA, EntryRow, journal filter, edit-screen branch; migration 0004; `isFood()` fixed to FOOD\_TYPES allowlist |
| `feat(analysis): temporal meal-to-outcome correlation` | `analyzeTemporalTriggers` — 24h windowed join; `isOutcome` covers bad BM, significant symptom, or low food sentiment; surfaced in Insights as "Timing patterns" |

## How to read this

Ranked by value-add to the north star. **Effort:** S (hours) · M (a session) · L (multi-session).
**⚠ = new dependency** — allowed, but CVE-inventory it and justify the value first.

---

## Tier 0 — Foundations (cheap, do first; they unblock everything else)

| Item | Why it matters | Effort | Notes |
|------|----------------|:--:|------|
| ~~**Saturated fat field**~~ | ~~Common trigger-adjacent macro; completeness~~ | ~~S~~ | ✅ **Done** — migration 0002, lib, form, OFF map |
| **Backup / export + import** (JSON/CSV) | Local-first = **no cloud**. Lose the phone, lose everything. Protect the data before asking for months of logging. | M | ⚠ likely `expo-file-system` + `expo-sharing` |
| **Native date/time picker** | The text-field date entry is the app's weakest UX | S | ⚠ `@react-native-community/datetimepicker` |
| **Serving-size scaling** | Scales OFF per-100g values → fixes the "close but never exact" numbers | S | pure math, no dep |
| **Recent / Favorites quick-add** | People eat the same things; one-tap re-log. **Adherence = data = insights.** | M | no dep |

## Tier 1 — The differentiator (this is the actual product)

| Item | Why it matters | Effort | Notes |
|------|----------------|:--:|------|
| ~~**Ingredient & allergen capture from OFF**~~ | ~~Sensitivities are about *ingredients*, not macros.~~ | ~~M~~ | ✅ **Done** — migration 0003, `lib/ingredients.ts`, OFF mapper, manual field |
| ~~**Ingredient → sentiment correlation**~~ | ~~Surfaces *actionable* triggers.~~ | ~~M~~ | ✅ **Done** — `analyzeIngredientSentiment` in Insights |
| ~~**Symptom logging**~~ (new loggable type) | ~~Reactions arrive *hours later*, not at the table.~~ | ~~M~~ | ✅ **Done** — migration 0004, SymptomForm, /symptom/new, wired end-to-end |
| ~~**Temporal meal → outcome correlation**~~ | ~~"Meals with onion preceded a rough BM/symptom 7 of 9 times within 24h."~~ | ~~L~~ | ✅ **Done** — `analyzeTemporalTriggers` + "Timing patterns" in Insights |
| **Trigger watchlist / elimination mode** | Mark suspected ingredients, flag entries containing them, track reactions — how food journals are *actually* used therapeutically | M | builds on ingredient capture |

## Tier 2 — The payoff (turn data into trust + motivation)

| Item | Why | Effort | Notes |
|------|-----|:--:|------|
| **Trends / charts** (sentiment over time, BM regularity, intake) | Motivation + pattern spotting | M | ⚠ charting lib (e.g. `react-native-gifted-charts` or hand-rolled `react-native-svg`) |
| **Per-food / ingredient drill-down** | Tap a finding → every instance + outcomes | S–M | no dep |
| **Confidence labeling on insights** | Don't erode trust with noise; gate on sample size, flag low-confidence | S | keeps it simple (see decision #2) |
| **Insights as a tab** | Currently a modal link; make it first-class | S | nav change |
| **Doctor / dietitian PDF report** | Share a date range + insights with a pro (fits the app's own framing) | M | ⚠ `expo-print` |

## Tier 3 — Quality of life

OFF **search-by-name** (produce/restaurant/homemade have no barcode) · photo attachment ⚠ ·
save-confirmation toasts + haptics · onboarding + better empty states · swipe-to-delete ·
reminder **deep-link** into the add-entry form · settings (force theme, first-day-of-week —
currently hardcoded Sunday, default meal slot by time of day).

## Tier 4 — Platform / infra

iOS pass (BUILD_PLAN "iOS crossover") · screen-level RNTL tests · `bundle:check` in a
pre-push hook · `FlashList` virtualization once entry volume grows.

---

## Decisions (resolved with owner)

1. **New dependencies OK** when CVE-inventoried and clearly value-additive.
2. **Insights stay simple** — counts / averages / thresholds + sample-size gating +
   confidence labels. Defer chi-square / effect-size until ingredient→sentiment proves
   out. (False triggers are worse than missed ones here.)
3. **Symptoms = a new loggable type** (mirror the bowel-movement migration), with a
   dedicated severity, not by overloading `sentiment`.
4. **Add saturated fat** to nutrition capture.
5. **`isOutcome` definition:** bad BM (Bristol 1, 2, 6, 7) OR symptom (severity ≥ 3) OR
   food entry (sentiment ≤ 2). Used by temporal correlation; can be tightened later if
   food-entry self-rating is too circular.
6. **`isFood` uses a positive allowlist** (`FOOD_TYPES = ['meal','snack']`) rather than
   "not BM". Required once 'symptom' was added as a third type.

## Definition of done (unchanged — see CLAUDE.md §4)

`npm run typecheck && npm run lint && npm test` green, **plus `npm run bundle:check`
before any EAS build**. Tests ship with the feature. One logical change per commit.
Schema changes are additive migrations, never mutations.
