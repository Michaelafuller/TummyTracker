# PROGRESS.md — TummyTracker roadmap

**North star:** help the user *find what's making them feel bad and act on it.* Not
calorie counting. Every item below is ranked by how much it serves that goal — either
by surfacing a trigger, or by capturing the clean, consistent data that lets us.

> **Curation (read before editing this file).** This is the **plan session's input
> contract** — keep it lean. It answers *"what's next, and why,"* not *"what
> happened."* History is git's job. Every plan cycle, prune as a standing step:
> trim "Shipped last cycle" to the last cycle only, collapse fully-done sections to
> one line, re-rank live items, delete dead ones. If a row hasn't earned its place
> in the *next* plan decision, cut it.

**The development loop** (plan → execute → test-plan → test-execute) and all its
artifacts are defined in `docs/TEST_STRATEGY.md` — the canonical source. A plan
session opens with this file + `docs/RESULTS.md`.

**Gate before any EAS build:** `npm run bundle:check` (`expo export`) — the three rungs
never run Metro, so bundler/Babel bugs hide from them; this catches them.

---

## Status

- **Everything through the 2026-08-16 cycles is on `main`** and running on the
  Pixel 5 via the development-profile dev client (installed 2026-08-16).
  Feature surface: manual & barcode entry, meal builder, browse/edit with
  calendar, reminders, BM + symptom logging, insights v2, serving-size scaling,
  backup/restore, 5-tab nav (incl. Goals), offline mode, OFF Search-a-licious
  search, trigger watchlist, threshold goals + daily check-in.
- **Health:** rungs green at HEAD (58 suites / 505 tests) + `bundle:check`.
  **Maestro full regression 2026-08-16/17: 23/23 — the new clean baseline**
  (`docs/RESULTS.md`). The dev-client reconnect gap is handled by flow infra
  (`flows/_helpers/reconnect-dev-client.yaml` — hardcodes Metro port 8084;
  update per session).
- **✅ Shipped this cycle (two cycles, planned + executed + reviewed 2026-08-21):**
  1. **Meal-component drill-down** — tap a saved meal's component row →
     component edit screen (full nutrition visible) → save re-aggregates the
     parent entry (fresh nutrition, additive tags). No remediations needed.
     Discovery result: serving-multiply (nutrition × servings) **verified
     correct** across builder → save → display → tally; no defect found.
  2. **Build-variant split + Home layout** — dev builds now
     `com.tummytracker.app.dev` / "TummyTracker (dev)" / `tummytracker-dev`
     scheme (see Tier 4 row); Home tab hero + CTAs frozen, Recent fills the
     viewport and scrolls its rows only (cap 6 → 50). One Fable-review
     remediation: variant resolver inlined into app.config.ts (nested `.ts`
     import needed Node ≥ 23.6 — would have broken EAS cloud workers on
     older Node; regression-checked with `--no-experimental-strip-types`).
  3. **Goals tab: tally drill-down + "Today" rename + long date** — tap a
     daily-tally row to expand the entries behind its total (name, amount,
     time · meal slot; missing-data entries as "no data"; sub-rows open the
     entry); page header "Goals" → "Today" so GoalsSection owns the one
     Goals heading; date line → "August 21, 2026". No remediations.
  Rungs green at HEAD (60 suites / 538 tests) + `bundle:check`. Maestro:
  drill-down flows (meal components + tally rows) owed + full re-run owed
  (appId/scheme moved under every flow), after the owner's device
  sequencing (HANDOFF §3).
- **✅ Fixed 2026-08-21 (on-device verified):** Home Recent list was still
  truncated after the layout change — root cause (painted-box screenshots +
  uiautomator): `BottomTabInset` reserved 80dp of dead bottom padding on
  Android (native tab bar is in-flow; the constant only makes sense for the
  absolute-positioned **web** bar, where it was ironically 0). Now
  `Platform.select({ web: 80, default: 0 })` + gap tightening on Home; the
  rows list grew 77px → 385px (≈3 full rows on a Pixel 5). Goals/Insights/
  Settings just lose scroll slack. **Next lever if more is wanted:** put
  "Log bowel movement" + "Log symptom" side by side (≈ +1 row) — owner's call.
- **Still owed (test sessions):** manual-only items per `docs/E2E.md` (camera
  loop, notification timing, dictation double-text check on both platforms,
  light/dark visual walkthrough, import round-trip content, migration
  spot-checks 0006–0008 against the real DB) · flow for the new
  component-drill-down once it ships (spec in HANDOFF §3).
- **Carried recommendations (RESULTS 2026-08-16/17):** root-level React error
  boundary around the tab navigator · "Insights" subtitle heading for
  label-consistency · **dev-mode React warning on launch (seen 2026-08-21 on
  the Pixel, post-fix relaunch): "Can't perform a React state update on a
  component that hasn't mounted yet" — non-fatal, no stack captured; repro
  with LogBox open and read the component stack before fixing (candidates:
  async setState in a lazily-loaded route; `AppProviders`' store loads are
  already inside effects).**
- **Owner on-device checklist (carried):** iOS app icon (needs EAS build), iOS
  time-picker Done-button feel, light-mode look, and the full scan →
  add-next → finish-meal → review → save loop (camera).

### Shipped last cycle (overwrite each plan cycle; full history = `git log`)

2026-08-16/17 (planned 2026-08-16, executed + test-executed through 2026-08-17):
- **Check-in persistence fix** — enabled/hour/minute persisted in prefs +
  7-day one-shot horizon re-arm (the fired-notification-consumes-state bug).
- **Dictation double-text fix** in `ThemedTextInput` (device check still owed).
- **Light-theme palette pass** + **splash/notification colors → palette**
  (visible with the next EAS build).
- **Test-execute: 23/23 Maestro baseline** — dev-client reconnect helper,
  three flow-bug fixes, ACCEPTANCE.md flips (23 items). See `docs/RESULTS.md`.

---

## How to read the backlog

Ranked by value-add to the north star. **Effort:** S (hours) · M (a session) · L (multi-session).
**⚠ = new dependency** — allowed, but CVE-inventory it and justify the value first.
Completed tiers are collapsed to a single line; their detail lives in git.

## Tier 0 — Foundations · ✅ complete
Saturated fat, backup/export-import, native date/time picker, serving-size scaling,
recent quick-add — all shipped.

## Tier 1 — The differentiator (the actual product)

Ingredient/allergen capture, ingredient→sentiment correlation, symptom logging,
temporal meal→outcome correlation, and ingredient-capture hardening (2026-08-15)
are **✅ shipped**. Remaining:

| Item | Why it matters | Effort | Notes |
|------|----------------|:--:|------|
| **Trigger watchlist / elimination mode** | Mark suspected ingredients, flag entries, track reactions | M | **✅ shipped 2026-08-15** — device checks owed (see Status); follow-on candidates: browse/calendar list badges, term editing |
| **Historical tag re-derive (backfill)** | Recover parenthetical sub-ingredient tags for entries saved before the hardening fix | S | **✅ shipped 2026-08-15** — one-launch device check owed (see Status) |

## Tier 2 — The payoff (turn data into trust + motivation)

Sentiment trend chart, confidence labeling, and ingredient-pair analysis **✅ shipped**
(insights v2, 2026-07-02). Remaining:

| Item | Why | Effort | Notes |
|------|-----|:--:|------|
| **Goals tab: daily nutrition tally** | 5th nav tab aggregating today's nutrients | S–M | **✅ shipped 2026-08-15** — missing-data caveats included; follow-on: 7-day mini-trend (see intake-charts row) |
| **Nutrient threshold goals + daily check-in** | Floors (≥) and caps (≤) per nutrient, one daily check-in | M | **✅ shipped 2026-08-15** (migration 0008) — floors notify / caps alert at save; **persistence bug found 2026-08-16, fix planned (see Status)**; follow-on: cap alert on the entry-**edit** path |
| **Per-food / ingredient drill-down** | Tap a finding → every instance + outcomes | S–M | no dep; natural follow-on to insights v2 |
| **BM-regularity + intake charts** | Complete the trends story beyond sentiment | S–M | reuse the zero-dep chart components |
| **Meal-component editing after save** | v1 meal builder saves components immutably; edit/remove with re-aggregation is the obvious next ask | S–M | **✅ shipped 2026-08-21** (edit + re-aggregate; removal + single-component-meal drill-down deferred) — Maestro flow owed |
| **Doctor / dietitian PDF report** | Share a date range + insights with a pro | M | ⚠ `expo-print` |

## Tier 3 — Quality of life

**OFF search-by-name + unbranded re-ranking — ✅ shipped (2026-07-03), but the
endpoint under it is dying.** Recovers buried generic entries (e.g. "banana") but
can't manufacture ones OFF lacks entirely (e.g. "apple"); see Decision 6.

| Item | Why it matters | Effort | Notes |
|------|----------------|:--:|------|
| **Search migration → Search-a-licious** | Legacy `cgi/search.pl` was 503-ing and returned native-language names | S | **✅ shipped 2026-08-15** — device smoke owed (see Status). Re-test the apple/orange generic gap in real use before any USDA layer (Decision 6) |

Remaining Tier 3: photo attachment ⚠ · save-confirmation toasts + haptics ·
onboarding + better empty states · swipe-to-delete · reminder **deep-link** into
the add-entry form · settings (force theme, first-day-of-week — currently
hardcoded Sunday, default meal slot by time of day).

## Tier 4 — Platform / infra

| Item | Why it matters | Effort | Notes |
|------|----------------|:--:|------|
| **Build-variant split (dev vs. real app)** | The dev client and preview build share `com.tummytracker.app`, so they displace each other — and Maestro's `clearState` wipes whichever app holds the identity, i.e. the owner's real journal (bit us 2026-08-16; backup existed). A `com.tummytracker.app.dev` variant makes both coexist and walls automation off from real data permanently. | S–M | **✅ shipped 2026-08-21** — app.config.ts (resolver inlined: `@expo/config` transpiles only the entry file, so no runtime imports; tested at `__tests__/app.config.test.ts`), eas.json dev env, `tummytracker-dev` scheme, all 27 flow appIds. Icon badge skipped. **Owner sequencing owed (HANDOFF §3): dev build → install alongside → preview build reclaims the real package.** |

Also: iOS pass (BUILD_PLAN "iOS crossover"; the icon, picker, and light-mode blockers
are all now addressed) · **finish the Maestro backlog** (see Status + RESULTS.md for
the current run state) · root-level React error boundary (RESULTS.md 2026-08-16
recommendation — one screen's render error currently blanks the whole app) ·
screen-level RNTL tests · `bundle:check` in a pre-push hook · `FlashList` virtualization
once entry volume grows.

---

## Decisions (resolved with owner)

1. **New dependencies OK** when CVE-inventoried and clearly value-additive.
2. **Insights v2 (revised 2026-07-02, owner-directed — supersedes "stay simple").**
   Findings must be *baseline-relative* (a tag's avg sentiment vs. the user's other
   meals, not an absolute ≤2.5 cutoff), carry Wilson/standard-error-based confidence
   tiers (low/medium/high; sub-medium suppressed where multiple comparisons bite),
   include ingredient *pair* (combination) analysis, and be delivered visually
   (zero-dep plain-View charts). The false-triggers-are-worse principle stands —
   it's now enforced by confidence gating rather than by simplicity. Still no
   stats/charting dependencies.
3. **Symptoms = a new loggable type** (mirror the BM migration), dedicated severity, not
   by overloading `sentiment`.
4. **`isOutcome` definition:** bad BM (Bristol 1, 2, 6, 7) OR symptom (severity ≥ 3) OR
   food entry (sentiment ≤ 2). Used by temporal correlation; tighten later if food-entry
   self-rating proves too circular.
5. **`isFood` uses a positive allowlist** (`FOOD_TYPES = ['meal','snack']`), required once
   'symptom' became a third type.
6. **USDA FoodData Central migration/hybrid — evaluated 2026-07-03, deferred.** OFF's
   generic-search gap (no unbranded "apple"/"orange"-class entries at all, vs. "banana"
   which the ranking fix already recovers) is real but narrow. No free API covers both
   OFF's barcode-scan breadth and USDA's clean generic-food entries at once: FDC has no
   dedicated barcode endpoint (search+match on `gtinUpc` instead of exact lookup, weaker
   non-US coverage) and no structured allergen/additive taxonomy (would degrade the
   ingredient-correlation differentiator, falling back to text parsing). A full swap
   risks two working features (scan hit-rate, allergen tags) to fix a narrow, already-
   mitigated path; a hybrid (OFF for scan, USDA as name-search fallback) would close the
   gap but adds a second network dependency + API key, against a stated single-source
   preference. **Decision: stay OFF-only for now**, reassess only if the apple/orange-
   class gap keeps coming up in real use after the ranking fix. Don't re-open without new
   signal — see this item before re-scoping.
   **Re-evaluated 2026-08-15 (new signal: legacy search endpoint failing).** Full
   landscape re-survey: still no free API matches OFF on barcode + allergen/additive
   tags; the alternatives market got *worse* (Nutritionix free tier discontinued,
   Edamam free plan removed, CalorieNinjas paywalled calories/protein, FatSecret
   requires an IP-whitelisted proxy — violates no-backend). USDA FDC re-verified:
   fallback-only integration is now ~2 days but still key-required, no real barcode
   endpoint, no allergen taxonomy. **Decision: stay OFF-only; migrate name search to
   Search-a-licious (`search.openfoodfacts.org`) next cycle** — live-tested to fix
   both the language problem and generic-food ranking. Generic-food gap: re-test
   after migration; if it still bites, the preferred fix is a **bundled on-device
   USDA SR Legacy subset** (CC0, ~300 foods ≈ 50 KB or ~7,800 ≈ 1.5 MB SQLite,
   zero network/keys, local-first-aligned) over an FDC API fallback.

## Definition of done (see CLAUDE.md §4)

`npm run typecheck && npm run lint && npm test` green, **plus `npm run bundle:check`
before any EAS build**. Tests ship with the feature. One logical change per commit.
Schema changes are additive migrations, never mutations.
