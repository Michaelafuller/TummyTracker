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

- **On `main`** through the 2026-09-26 session (see below). Feature surface:
  manual & barcode entry, multi-item meal builder with re-log-from-history,
  "Add item" and a servings stepper; browse/edit with a day/week/month
  Journal; BM + symptom logging; outcome-based insights + drill-downs;
  Goals tally + thresholds + daily check-in; trigger watchlist; reminders;
  backup/restore (v3); doctor PDF report; **medications** (inventory, dose
  logging, history, Journal integration); Settings behind a top-right gear;
  app-wide keyboard toolbar. Tabs: Home · Journal · Meds · Insights · Goals.
- **Device + build:** Pixel 5 dev client = the **2026-08-29 EAS development
  build** — `expo-print`, `expo-haptics` and `react-native-keyboard-controller`
  natives all present. Metro on 8081; the reconnect helper also switches off
  the dev-client tools bubble on fresh installs (it covers the Settings gear —
  `docs/E2E.md` finding).
- **Test baseline:** the last **full** Maestro regression is **29/29 on
  2026-08-29** (the new build). The 2026-09-26 session ran **targeted** flows
  and **targeted** Jest only (owner preference): suite is now **34 flows**,
  with `h`, `j`, `nav-tabs` and the five Settings flows reworked and `p`, `q`,
  `r`, `s` new. Full `npm test` last ran 2026-08-29 (74 suites / 648 tests).
  → **A full regression + full Jest run is owed** — pinned #1.
- **Owed device checks:** iOS pass (the #2 keyboard items below + carried: iOS
  app icon, time-picker Done feel), light-mode walkthrough, camera scan loop,
  and the manual items in `docs/E2E.md`. **Owner sequencing from the
  2026-08-21 build-variant split — unconfirmed:** a preview/production build
  should reclaim the real `com.tummytracker.app` package for the owner's
  journal (dev client stays `…app.dev`); confirm or re-pin.
- **Low-priority findings (carried):** `DateTimePicker onChange` deprecation
  warning (`date-time-field.tsx`, `time-field.tsx`) · Insights has no
  "Insights" subtitle heading (label consistency).

### Shipped last cycle — 2026-09-26 (one session: Opus plan/review, Sonnet execute; full history = `git log`)

- **Re-log a past meal + Add item (GitHub #1)**, **servings stepper** on meal
  review, Recent double-tap guard.
- **Journal week strip** aligned to its frame (pixel-exact width) + a distinct
  "today" marker.
- **Medications epic (GitHub #4–#11)** in two cycles: tables (additive 0009),
  inventory (never deleted), dose logging with per-dose snapshots, history,
  Journal "Meds" filter, backup v3 with id-preserving + event-gated restore;
  Settings moved to a gear (redrawn icon); `generate-icons.mjs` runnable.
  Invariant: nothing is ever inferred as taken; Insights/Goals stay food-only.
- **Keyboard dismissal (GitHub #2):** toolbar with Done (the only way to close
  iOS number pads), tap-outside on Home, iOS drag-to-dismiss.
- GitHub issues **#1, #2, #4–#11 are done but still open** on GitHub — close
  them (the owner; this environment can read issues but not update them).

---

## How to read the backlog

Ranked by value-add to the north star. **Effort:** S (hours) · M (a session) · L (multi-session).
**⚠ = new dependency** — allowed, but CVE-inventory it and justify the value first.
Completed work is collapsed to a single line; its detail lives in git.

## 📌 Pinned — next up (ranked)

1. **Full regression: all 34 Maestro flows + full `npm test`** — S–M, a test
   session. 2026-09-26 touched cross-cutting code (navigation, the meal
   builder's `dismissTo`, the keyboard wrappers, backup) and verified it only
   with targeted runs. Re-baseline before building more on top. Same session:
   audit the suite's ~45 `hideKeyboard` workarounds now that the keyboard
   native module is installed — on Android `hideKeyboard` is a Back press and
   can exit the app from a tab root (`docs/E2E.md` finding); prefer
   tap-outside / per-key input.
2. **iOS check for GitHub #2** — S, owner (no iOS device/Mac here): Done on a
   number pad, tap-outside on Home, drag-to-dismiss on a form.
3. **Medication entry form is scroll-heavy** — S. Every ticked medication shows
   all 10 unit chips, though the unit is almost always its default: show the
   unit as text with a "Change unit" affordance.
4. **Stale auto-generated meal name** — S (owner-approved). Review sets the
   name once, so re-using "Rice + 1 more" and removing Beans saves a 1-item
   meal still named "Rice + 1 more". While the name still equals the
   auto-default, recompute it (`defaultMealName`) as items change; never
   overwrite a user-typed name. Update `q-reuse-adjust` to assert it.
5. **"Add item" needs the camera screen** — S. From meal review, "Enter
   manually" only appears once camera permission is granted; offer a manual
   path directly.
6. **Small cleanups** (bundle into any cycle): retire `entry/new` +
   `prefillStore` (no callers — owner decision) · shared Jest mock for
   `Collapsible` (reanimated worklets can't init under Jest) · app / adaptive /
   splash icon SVG sources are missing (`generate-icons.mjs` skips them) ·
   `DateTimePicker onChange` deprecation.

## Tier 0 — Foundations · ✅ complete
Saturated fat, backup/export-import, native date/time picker, serving-size scaling,
recent quick-add — all shipped.

## Tier 1 — The differentiator · ✅ complete
Ingredient/allergen capture, outcome-based correlation (ingredients, foods, pairs,
nutrients, timing), symptom logging, ingredient-capture hardening + tag backfill,
trigger watchlist with badges and term editing, **medication tracking** — all
shipped. Next frontier: correlate medication use with outcomes (the #11 helpers
make the data ready; the engine deliberately doesn't read it yet) — L, plan first.

## Tier 2 — The payoff · core ✅ shipped
Trend charts, confidence labels, pair analysis, Goals tally + thresholds + check-in,
per-food/ingredient drill-down, BM "Digestion" and intake charts, meal-component
editing, doctor PDF report — all shipped. Remaining follow-ons:

| Item | Why | Effort |
|------|-----|:--:|
| **7-day mini-trend on Goals** | Today's tally has no context without a week | S |
| **Cap alert on the entry-edit path** | Caps only alert at save today, not on edit | S |
| **Pair-finding drill-down** | Single findings drill down; pairs don't | S |

## Tier 3 — Quality of life
- **Medication reminders** (owner-requested, 2026-09-26) — M. Local scheduled
  notifications from a medication's schedule via the approved
  `expo-notifications`. Needs a structured schedule (times/days), not today's
  free-text frequency. A reminder must never become a dose record — only an
  explicit entry is "taken" (#10/#11).
- Remaining: photo attachment ⚠ · save-confirmation toasts · onboarding +
  better empty states · reminder **deep-link** into the add-entry form ·
  settings (force theme, first-day-of-week — hardcoded Sunday, default meal
  slot by time of day) · watchlist badges on Home recents.
- ✅ shipped (collapsed): OFF search-by-name → Search-a-licious migration,
  swipe-to-delete, haptics. Re-test the apple/orange generic-food gap in real
  use before any USDA layer (Decision 6).

## Tier 4 — Platform / infra
- **iOS pass** (BUILD_PLAN "iOS crossover") — icon, picker and light-mode
  blockers addressed; now also the #2 keyboard checks. M.
- `bundle:check` in a pre-push hook · `FlashList` virtualization once entry
  volume grows · more screen-level RNTL coverage.
- ✅ shipped (collapsed): build-variant split (`com.tummytracker.app.dev`),
  root error boundary.

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
4. **`isOutcome` definition (revised 2026-08-28, owner-directed — supersedes the
   food-sentiment arm below).** Bad BM (Bristol 1, 2, 6, 7) OR BM feel-afterward
   rating ≤ 2 OR symptom (severity ≥ 3). Food entries are never outcomes. This
   resolves the original definition's own caveat ("tighten later if food-entry
   self-rating proves too circular") — it did prove circular, so per-meal
   sentiment was removed outright rather than tightened. Used by
   `analyzeOutcomeRates`/`tagHitRates`/`mealsFollowedByOutcome` (temporal
   correlation) and the doctor PDF report.
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
7. **Per-meal sentiment removed 2026-08-28 (owner-directed):** rating outcomes
   beats rating meals — asking the user to self-rate a meal's digestive impact
   at write time duplicated (and biased) what the correlation engine computes
   after the fact from real, dated symptom/BM events. The `sentiment` column
   is retained for history and old-backup imports; the BM feel-afterward
   rating is kept and is what now feeds `isOutcome` (Decision 4).

## Definition of done (see CLAUDE.md §4)

`npm run typecheck && npm run lint && npm test` green, **plus `npm run bundle:check`
before any EAS build**. Tests ship with the feature. One logical change per commit.
Schema changes are additive migrations, never mutations.
