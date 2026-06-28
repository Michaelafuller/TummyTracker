# PROGRESS.md — TummyTracker roadmap

**North star:** help the user *find what's making them feel bad and act on it.* Not
calorie counting. Every item below is ranked by how much it serves that goal — either
by surfacing a trigger, or by capturing the clean, consistent data that lets us.

## Development cycle

Every feature follows a **three-session** pattern. Each step is a separate Claude
session — no shared context, clean handoffs.

| # | Session | Model | Reads | Produces |
|---|---------|-------|-------|----------|
| 1 | **Plan** | Opus (`opusplan`) | `PROGRESS.md`, codebase, CLAUDE.md | `docs/HANDOFF.md` — next task fully specced |
| 2 | **Execute** | Sonnet (Auto mode) | `docs/HANDOFF.md` | Code + tests committed, rungs green, Maestro flows updated, brief summary |
| 3 | **Test** | Sonnet (Auto mode) | Session 2 summary + `docs/E2E.md` | `flows/results.xml` read → `docs/ACCEPTANCE.md` checkboxes updated |

**Why separate sessions?** Context is finite. Planning needs broad reasoning about the
roadmap; execution needs deep codebase focus; testing needs fresh eyes to read failures
objectively and update the checklist honestly.

**Artifacts that bridge sessions:**
- `docs/HANDOFF.md` — what Session 1 writes; what Session 2 reads first.
- `docs/ACCEPTANCE.md` — the live record; Session 3 flips `[ ]` → `[x]` based on
  `flows/results.xml`.
- `flows/results.xml` — JUnit XML from
  `maestro test flows/ --format junit --output flows/results.xml`.

**Gate before any EAS build:** `npm run bundle:check` (`expo export`) — the three rungs
never run Metro so bundler/Babel bugs hide from them; this catches them.

---

## Status

- **MVP shipped — Phases 0–3** (scaffold + verification loop, manual & barcode entry,
  browse/edit with day/week/month calendar, local reminders, bowel-movement tracking,
  correlation insights). Running on the Pixel 5 via an EAS `preview` APK.
- **Flagship trio shipped** (saturated fat, ingredient/allergen capture, ingredient→sentiment
  correlation, symptom logging, temporal meal→outcome correlation) — all in `main`.
- **Tier-0 sprint complete (2026-06-28):** UX polish + serving-size + native date picker +
  recent quick-add + backup/export-import all committed.
- Health: **151 tests**, all three rungs + `npm run bundle:check` green, tree clean on `main`.

### Completed since last handoff

| Commit | What shipped |
|--------|-------------|
| `feat(data): capture saturated fat` | sat-fat column end-to-end (migration 0002, lib, form, OFF map) |
| `feat(data): capture ingredients and allergen/additive tags` | `ingredients_text` + `tags_json` columns (migration 0003); `extractTags` + `normalizeTag` in `lib/ingredients.ts`; OFF mapper extended; manual ingredient field in LogEntryForm |
| `feat(analysis): ingredient/sentiment insights` | `analyzeIngredientSentiment` groups rated food entries by normalized tag, gates on MIN\_TAG\_OCCURRENCES=3; surfaced in Insights screen as "Ingredients you react to" |
| `feat(symptoms): add symptom as a logged type` | 9 symptom types + severity 1–5 scale; SymptomForm, /symptom/new screen, home CTA, EntryRow, journal filter, edit-screen branch; migration 0004; `isFood()` fixed to FOOD\_TYPES allowlist |
| `feat(analysis): temporal meal-to-outcome correlation` | `analyzeTemporalTriggers` — 24h windowed join; `isOutcome` covers bad BM, significant symptom, or low food sentiment; surfaced in Insights as "Timing patterns" |
| `fix(ux): home title overflow, scan button visibility, theming polish` | Home title `adjustsFontSizeToFit`; `use-theme.ts` null-safe; segmented-control unselected label uses `textSecondary`; scan overlay "Enter manually" pill button; scan modal header themed dark |
| `feat(barcode): serving-size scaling for OFF nutrition` | `scaleNutrition` pure helper; `serving_g` column (migration 0005); OFF `serving_quantity` read as default; serving-size field in `LogEntryForm` rescales nutrition live |
| `feat(ux): native date/time picker in all log forms` | `DateTimeField` shared component wrapping `@react-native-community/datetimepicker`; wired into `LogEntryForm`, `BmForm`, `SymptomForm` |
| `feat(logging): recent foods quick-add on home screen` | `listRecentFoodEntries` in repository; horizontal chip scroll on home; tap prefills full prior entry at current time |
| `feat(data): JSON backup export and import in Settings` | `backup.ts` pure serialisation (19 tests); Export (File/Paths SDK 56 API + expo-sharing); Import (`File.pickFileAsync` + upsert-by-id) |

## How to read this

Ranked by value-add to the north star. **Effort:** S (hours) · M (a session) · L (multi-session).
**⚠ = new dependency** — allowed, but CVE-inventory it and justify the value first.

---

## Tier 0 — Foundations ✅ All complete

| Item | Why it matters | Effort | Notes |
|------|----------------|:--:|------|
| ~~**Saturated fat field**~~ | ~~Common trigger-adjacent macro; completeness~~ | ~~S~~ | ✅ migration 0002, lib, form, OFF map |
| ~~**Backup / export + import**~~ | ~~Local-first = no cloud. Protect data.~~ | ~~M~~ | ✅ `backup.ts` + SDK 56 File/Paths + expo-sharing |
| ~~**Native date/time picker**~~ | ~~Weakest UX: text-field date entry~~ | ~~S~~ | ✅ `DateTimeField` + `@react-native-community/datetimepicker` |
| ~~**Serving-size scaling**~~ | ~~Scales OFF per-100g values~~ | ~~S~~ | ✅ `scaleNutrition`, migration 0005, `serving_g` persisted |
| ~~**Recent / Favorites quick-add**~~ | ~~People eat the same things; one-tap re-log~~ | ~~M~~ | ✅ `listRecentFoodEntries` + home chip scroll |

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

## UX backlog ✅ All resolved (2026-06-28 polish commit)

| ID | Where | Fix shipped |
|----|-------|------------|
| UX-1 | Home title | `adjustsFontSizeToFit` + `numberOfLines={1}` — title no longer wraps |
| UX-2 | Theming | Segmented-control unselected label → `textSecondary`; `use-theme` null-safe |
| UX-3 | Scan + Home | "Enter manually" pill on viewfinder; scan modal header themed dark; Home "Scan barcode" CTA visible in dark mode |

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
