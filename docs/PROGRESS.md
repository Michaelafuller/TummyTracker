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

- **Everything through the 2026-07-03 cycle is on `main`** and running on the Pixel 5.
  (Manual & barcode entry, meal builder, browse/edit with calendar, reminders, BM +
  symptom logging, insights v2, serving-size scaling, backup/restore, 4-tab nav,
  offline mode, OFF search-by-name + unbranded re-ranking.)
- **Health:** all three rungs + `bundle:check` green at `main` HEAD. Maestro full
  regression 2026-07-03: **18/19** (best-ever clean run); the one red
  (`e-temporal-insights`) is a classified flow-bug with the fix applied — re-run
  pending, not an app defect (`docs/RESULTS.md`).
- **In flight (2026-07-19 plan cycle):** ingredient-capture hardening — audit found
  meal collation preserves full tag granularity (union of per-component OFF tags);
  fixing the three real gaps found (parenthetical sub-ingredients dropped by
  `extractTags`, single-component meals losing full ingredient text on the parent
  row, edited ingredient text never merged into tags). Specced in `docs/HANDOFF.md`.
- **Queued next cycle (decided 2026-08-15):** migrate name search off the failing
  legacy `cgi/search.pl` endpoint to Search-a-licious (Tier 3 row + Decision 6),
  plus the owner-approved historical tag re-derive backfill (Tier 1 row).
- **Owner on-device checklist (carried):** iOS app icon (needs EAS build), iOS
  time-picker Done-button feel, light-mode look, migration 0006 against a real
  database, and the full scan → add-next → finish-meal → review → save loop (camera).

### Shipped last cycle (overwrite each plan cycle; full history = `git log`)

2026-07-03 cycle (planned Fable 5, executed Sonnet 5):
- **OFF search re-ranking:** wider candidate pool (24) + client-side genericity
  scoring (name-closeness, unbranded, produce-vs-processed category hints) so plain
  foods outrank branded lookalikes; USDA FDC migration evaluated & deferred
  (Decision 6). New app icon. Full Maestro regression run (18/19, see Health).

---

## How to read the backlog

Ranked by value-add to the north star. **Effort:** S (hours) · M (a session) · L (multi-session).
**⚠ = new dependency** — allowed, but CVE-inventory it and justify the value first.
Completed tiers are collapsed to a single line; their detail lives in git.

## Tier 0 — Foundations · ✅ complete
Saturated fat, backup/export-import, native date/time picker, serving-size scaling,
recent quick-add — all shipped.

## Tier 1 — The differentiator (the actual product)

Ingredient/allergen capture, ingredient→sentiment correlation, symptom logging, and
temporal meal→outcome correlation are **✅ shipped**. Remaining:

| Item | Why it matters | Effort | Notes |
|------|----------------|:--:|------|
| **Ingredient-capture hardening** | Sub-ingredients in parentheses are currently dropped at extraction — the exact "brand X's soybean isolate" signal the analysis exists for | S | **in flight** — `docs/HANDOFF.md` 2026-07-19 |
| **Trigger watchlist / elimination mode** | Mark suspected ingredients, flag entries containing them, track reactions — how food journals are *actually* used therapeutically | M | builds on ingredient capture |
| **Historical tag re-derive (backfill)** | Recover parenthetical sub-ingredient tags for entries saved before the hardening fix; additive-only union is safe | S | **owner-approved 2026-08-15** — rides along with the search-migration cycle |

## Tier 2 — The payoff (turn data into trust + motivation)

Sentiment trend chart, confidence labeling, and ingredient-pair analysis **✅ shipped**
(insights v2, 2026-07-02). Remaining:

| Item | Why | Effort | Notes |
|------|-----|:--:|------|
| **Goals tab: daily nutrition tally** (owner-specced 2026-08-15) | 5th nav tab aggregating today's nutrients across food entries — the foundation for goals below | S–M | pure-lib day aggregation (count parent meal rows only, not components); flag entries with missing nutrient data so totals stay trustworthy; later: 7-day mini-trend (see intake-charts row) |
| **Nutrient threshold goals + daily check-in** (owner-specced 2026-08-15) | Per-nutrient floors (≥, e.g. 50g protein) and caps (≤, e.g. 20g fat), opt-in per nutrient | M | additive `goal` migration (nutrient, direction, threshold, enabled); **one global daily check-in time** — notification body lists unmet floors, recomputed/rescheduled on every save + app-open, cancelled when all floors met (totals can't change outside the app, so body is never stale; recompute on day rollover); **caps alert in-app at save time** (only a save can cross one), red state in tab; reuse `features/notifications` service pattern; sequenced **after search migration** |
| **Per-food / ingredient drill-down** | Tap a finding → every instance + outcomes | S–M | no dep; natural follow-on to insights v2 |
| **BM-regularity + intake charts** | Complete the trends story beyond sentiment | S–M | reuse the zero-dep chart components |
| **Meal-component editing after save** | v1 meal builder saves components immutably; edit/remove with re-aggregation is the obvious next ask | S–M | builds on migration 0006 |
| **Doctor / dietitian PDF report** | Share a date range + insights with a pro | M | ⚠ `expo-print` |

## Tier 3 — Quality of life

**OFF search-by-name + unbranded re-ranking — ✅ shipped (2026-07-03), but the
endpoint under it is dying.** Recovers buried generic entries (e.g. "banana") but
can't manufacture ones OFF lacks entirely (e.g. "apple"); see Decision 6.

| Item | Why it matters | Effort | Notes |
|------|----------------|:--:|------|
| **Search migration → Search-a-licious** | Legacy `cgi/search.pl` now 503s on unfiltered queries (verified 2026-08-15) — name search is user-facing broken — and it returned native-language names anyway. New endpoint: English results (`langs=en` + `product_name_en` fallback), generic entries ranked top by default relevance | S | **committed next cycle** (Decision 6 rev. 2026-08-15). Parse `hits` not `products`; drop `sort_by=unique_scans_n` (resurfaces French products); keep genericity re-ranker as tiebreak; add contact email to User-Agent (OFF terms); stay search-on-submit (10 req/min limit) |

Remaining Tier 3: photo attachment ⚠ · save-confirmation toasts + haptics ·
onboarding + better empty states · swipe-to-delete · reminder **deep-link** into
the add-entry form · settings (force theme, first-day-of-week — currently
hardcoded Sunday, default meal slot by time of day).

## Tier 4 — Platform / infra

iOS pass (BUILD_PLAN "iOS crossover"; the 2026-07-02 cycle fixes the icon, picker, and
light-mode blockers) · **finish the Maestro backlog** (16/19 verified; rebuild + run the
last 3 per RESULTS.md, then a FULL re-run after this cycle's YAML/theme changes) ·
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
