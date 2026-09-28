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
  backup/restore (v4); doctor PDF report; **medications** (inventory, dose
  logging, history, Journal integration); **day check-in** (fine/rough day:
  Home card, notification buttons, Insights day coverage); **automatic
  backups** (Android daily-on-open to a chosen folder, newest 7) + a
  "last backup" nudge; **"What came before"** a rough outcome (meals +
  meds in the prior 24–72 h with existing suspicion); Settings behind a
  top-right gear;
  app-wide keyboard toolbar. Tabs: Home · Journal · Meds · Insights · Goals.
- **Device + build:** Pixel 5 dev client = the **2026-08-29 EAS development
  build** — `expo-print`, `expo-haptics` and `react-native-keyboard-controller`
  natives all present. Metro on 8081; the reconnect helper also switches off
  the dev-client tools bubble on fresh installs (it covers the Settings gear —
  `docs/E2E.md` finding).
- **Test baseline: 34/34 full Maestro regression + full Jest (95 suites /
  887 tests) on 2026-09-27** (GitHub #12, `docs/RESULTS.md`) — the new
  standing baseline, covering the whole 2026-09-26 session. The suite no
  longer uses `hideKeyboard` (86 calls → `_helpers/dismiss-keyboard.yaml`).
- **Owed device check — day check-in (GH #13, 2026-09-27):** run the new
  `flows/t-day-check-in.yaml` + the manual notification-button check in its
  header; targeted regression: Home flows (`h-recent-foods`, `q-reuse-adjust`,
  `p-review-servings`), `nav-tabs`, `settings-smoke`, `01e-reminders`,
  `i-backup`, `checkin-persistence`, `03-insights`. JS-only + migration 0010
  — no new build; Metro into the installed dev client.
- **Owed device check — automatic backups (GH #14, 2026-09-27):** run
  `flows/u-backup-nudge.yaml` + the manual folder/daily/prune/reinstall steps
  in its header; regression: `settings-smoke`, `i-backup`, and the Home flows
  above. JS-only — no new build.
- **Owed device check — "What came before" (GH #15, 2026-09-27):** run
  `flows/v-what-came-before.yaml`; regression: `01d-browse-edit`,
  `c-symptom-logging`, `02-bm-tracking`, `m-finding-drilldown`. JS-only.
- **Owed device check — polish bundle (GH #16, 2026-09-27):** run
  `q-reuse-adjust`, `s-medication-entry` (both updated), `ux3-scan-screen`;
  by hand: deny camera → "Enter manually" works from Home Scan and from meal
  review's "Add item"; every date/time picker (entry edit, meal review, BM,
  symptom, medication entry + inventory dates, Settings/Goals time chips) —
  pick, cancel, pick again (the picker API moved off the deprecated
  `onChange`). Regression: `g-datetime-picker`, `01e-reminders`,
  `checkin-persistence`, `r-medications`. JS-only.
- **Owed device check — meds in the PDF (GH #17, 2026-09-27):** by hand
  (share sheet): two medications (one custom unit, one inactive with an old
  dose) + one active with no doses → Create PDF, 30 days → Medications table
  ("N of 30", "No doses logged in this range", amounts), dose rows in the
  Journal by time. Regression: `n-doctor-report`. JS-only.
- **Owed device check — atomic repository writes (GH #18, 2026-09-27):**
  behavior only changes on a mid-write failure, so a regression of the save
  paths is enough: `q-reuse-adjust`, `j-component-drilldown` (edit/delete a
  meal item), `s-medication-entry` (create/edit/delete), `i-backup`. JS-only.
- **Owed device checks:** iOS pass (the #2 keyboard items below + carried: iOS
  app icon, time-picker Done feel), light-mode walkthrough, camera scan loop,
  and the manual items in `docs/E2E.md`. **Owner sequencing from the
  2026-08-21 build-variant split — unconfirmed:** a preview/production build
  should reclaim the real `com.tummytracker.app` package for the owner's
  journal (dev client stays `…app.dev`); confirm or re-pin.
- **Low-priority findings (carried):** Insights has no "Insights" subtitle
  heading (label consistency).

### Shipped last cycle — 2026-09-27 (Opus plan/review, Sonnet execute; full history = `git log`)

- **Day check-in, "fine day / rough day" (GitHub #13):** additive table
  `day_check_in` (migration 0010, one row per local day), a Home card, its own
  opt-in "How was today?" notification with Fine/Rough buttons (Settings, 21:00
  default), Insights "Days covered: X of Y · N checked in", backup v4.
  Coverage only — the correlation engine is unchanged; Rough is never an
  outcome. Review fixes: serialized notification refreshes (a cold-start
  answer doubled the horizon), Home card rolls to the new day on resume.
- **Automatic backups + "last backup" nudge (GitHub #14):** Android picks a
  folder once; a new timestamped backup is written once per day on app
  open/resume, newest 7 kept (only our own files ever pruned); Home nudges
  after 7 days without a backup; Settings shows the last-backup line.
  Review fixes: pruning deleted nothing on real SAF storage, a failed write
  could leave an empty "backup" among the 7, a same-day double run, and an
  unhandled share failure from the nudge.
- **Work backwards from a bad day (GitHub #15):** a rough BM/symptom's edit
  screen links to "What came before" — meals and medications in the prior
  24/48/72 h, closest first, each meal with the suspicion Insights already
  gives it ("No pattern yet" otherwise; meds listed, never scored). Engine
  unchanged. Review fixes: meal rows were hidden from screen readers, and a
  previous-day untimed dose read "Same day".
- **Quick-win polish (GitHub #16):** medication units as text + "Change
  unit"; an auto meal name follows its items (typed names never change);
  "Enter manually" without camera permission; pickers off the deprecated
  `onChange`; retired `entry/new` + `prefillStore` (owner); shared
  Collapsible test mock; `generate-icons.mjs` now owns tab icons only (the
  app icons are the owner's raster exports — owner). Review fix: meds with a
  custom default unit still showed every chip.
- **Medications in the doctor PDF (GitHub #17):** a Medications section
  (doses logged, days with a logged dose "N of M", snapshot amounts,
  frequency as entered; active meds with none listed) and dose rows in the
  report's Journal. Wording is "logged" only — never "missed". Review fix: the
  report window used fixed 24 h steps, so across a spring-forward change it
  pulled in the previous day's last hour and read "of 31" in a 30-day report.
- **Repository tests against real SQLite + atomic transactions (GitHub #18):**
  a Jest-only `node:sqlite` fake for `expo-sqlite` (no dependency) runs the
  real client, migrations and repository; 64 DB tests incl. a 5,000-dose
  restore. Found in planning: every repository "transaction" committed before
  its writes ran (Drizzle's expo-sqlite transaction is synchronous; our
  callbacks were async) — 8 of 9 multi-step writes could leave partial data
  on a failure. All converted to sync callbacks; the atomicity tests went
  red → green.
- Earlier (2026-09-26): re-log + Add item (#1), medications epic (#4–#11),
  keyboard dismissal (#2), Settings gear, #12 re-baseline. Issues **#1, #2,
  #4–#11, #13–#18** are done but still open on GitHub — the owner closes them.

---

## How to read the backlog

Ranked by value-add to the north star. **Effort:** S (hours) · M (a session) · L (multi-session).
**⚠ = new dependency** — allowed, but CVE-inventory it and justify the value first.
Completed work is collapsed to a single line; its detail lives in git.

## 📌 Pinned — next up (ranked)

Ranked 2026-09-26 (Opus product review, owner-requested); mirrored to the
GitHub Project as issues #12–#30 in the same order. Items 1–7 are the
near term; 8–19 below continue the same ranking. Why this order: re-baseline
first; then fix what makes every insight untrustworthy (missing "fine day"
data) and what risks losing the journal (no automatic backup); then cheap,
high-value views and polish; then the big "act on it" epic and deeper
analysis.

1. ~~**Full regression + full `npm test` + `hideKeyboard` audit** (GH #12)~~ —
   **✅ done 2026-09-27**: 34/34 + 95/887, `hideKeyboard` retired from the
   suite, 0 app regressions (`docs/RESULTS.md`).
2. ~~**Daily "fine day / rough day" check-in** (GH #13)~~ — **✅ shipped
   2026-09-27** (device check owed, see Status). Original rationale: S–M. Today a day with no
   symptom logged is indistinguishable from a day the user didn't open the
   app, so every "no rough outcome" in the engine's baseline is an
   assumption. A one-tap daily confirmation (inside the existing daily
   notification) makes the baseline real and gives an honest count of
   covered days. Same principle as medications: missing data is never a
   confirmed negative. Needs a small additive migration (owner, §9).
3. ~~**Automatic backups + staleness nudge** (GH #14)~~ — **✅ shipped
   2026-09-27** (device check owed, see Status). Original rationale: S–M. The whole journal lives on
   one phone; backup is manual, and a signing-mismatch reinstall wipes it
   (CLAUDE.md §0). Scheduled automatic backup to a user-chosen location, or at
   minimum a "last backup: 34 days ago" nudge on Home/Settings.
4. ~~**Work backwards from a bad day** (GH #15)~~ — **✅ shipped 2026-09-27**
   (device check owed, see Status). Original rationale: S. Tap a rough BM or symptom → see
   everything eaten *and taken* in the preceding 24–72 h, with the engine's
   existing suspicion for each. The reverse of today's food → outcomes
   drill-down; reuses existing data and helpers.
5. ~~**Quick-win polish** (GH #16)~~ — **✅ shipped 2026-09-27** (device check
   owed). Original list, for reference:
   - *Medication entry "Change unit":* every ticked med shows all 10 unit
     chips though the unit is almost always its default — show it as text
     with a "Change unit" affordance.
   - *Stale auto-generated meal name* (owner-approved): while the name still
     equals the auto-default, recompute it (`defaultMealName`) as items
     change; never overwrite a user-typed name. Update `q-reuse-adjust`.
   - *"Add item" without the camera:* from meal review, "Enter manually" only
     appears after camera permission is granted — offer a manual path.
   - *Cleanups:* retire `entry/new` + `prefillStore` (owner decision) ·
     shared Jest mock for `Collapsible` · missing app / adaptive / splash icon
     SVG sources · `DateTimePicker onChange` deprecation.
6. ~~**Doctor PDF report: add medications** (GH #17)~~ — **✅ shipped
   2026-09-27** (device check owed). Original rationale: S. The report covers food and
   outcomes; a clinician will want medication use and adherence alongside.
7. ~~**Database-level tests for `repository.ts`** (GH #18)~~ — **✅ shipped
   2026-09-27**. Original rationale: S–M. The repository is only
   exercised through mocks; both 2026-09-26 restore bugs (SQLite bound-
   variable cap, stale doses after an edit) were caught by review alone. An
   in-memory SQLite harness would catch that class automatically. Check
   whether a new dev dependency is needed (⚠ if so).

## Ranked backlog — continued (2026-09-26 product review)

| # | Item | Why it matters | Effort | Notes |
|:-:|------|----------------|:--:|------|
| 8 | **Elimination experiment mode** (GH #19) | The north star's "act on it": pick a suspect → guided avoid-then-reintroduce period → before/during/after outcome comparison with a confidence verdict. Turns correlation into a near-controlled test. | L | Epic — plan first. Reuses watchlist (save-time warnings), outcome engine, reminders. Depends on #2 for a real baseline. |
| 9 | **Medications in the correlation engine** (GH #20) | NSAIDs, antibiotics and PPIs strongly affect digestion; today a bad antibiotic week is blamed on food. Treat meds as confounders and candidate exposures. | M–L | Plan first. The #11 helpers already make the data analysis-ready; the engine deliberately doesn't read it yet. |
| 10 | **Reaction latency + multiple windows** (GH #21) | Every outcome counts "within 24 h", but reactions range from hours (lactose) to 1–3 days (some FODMAP/gluten). Show when outcomes tend to follow each trigger; compare windows. | M | Also makes findings more explainable. |
| 11 | **Dose-response** (GH #22) | Servings are stored, but the engine appears to treat an ingredient as present/absent — "a splash of milk is fine, a latte isn't" is exactly what the app should find. | S spike → M | First confirm in `temporal.ts` whether servings are ignored (not verified in review). |
| 12 | **Confounder tracking** (GH #23) | Sleep, stress, menstrual cycle, alcohol and caffeine drive gut symptoms and currently land on food. Even one daily "stress 1–5" helps. | M | Could fold into #2's daily check-in. Additive migration. |
| 13 | **"By chance" indicator on findings** (GH #24) | Many ingredients × few logs = some spurious correlations. Show how many findings like this you'd expect by chance. | S–M | Complements the existing confidence tiers. |
| 14 | **Saved recipes / "my meals" with ingredients** (GH #25) | Homemade and restaurant food has a name but no ingredients, blinding the ingredient engine where it matters most. | M | Re-used like Recent meals. |
| 15 | **Faster logging** (GH #26) | Favourites ("usual breakfast"), log straight from the reminder notification (subsumes the reminder deep-link), one-tap "took my regular meds". Adherence and data quality die when logging is tedious. | M | |
| 16 | **Optional app lock** (GH #27) | Sensitive health data (BMs, symptoms, medications) with no lock. | S–M | ⚠ likely `expo-local-authentication` — owner approval + CVE check. |
| 17 | **Medication adherence view + as-needed reason** (GH #28) | "Taken 26 of 30 days" calendar; a reason field for as-needed doses ("ibuprofen — headache"). | S–M | Builds on Cycle B history. |
| 18 | **Medication reminders** (GH #29) | Owner-requested enhancement: local notifications from a structured schedule (times/days) via the approved `expo-notifications`. | M | A reminder must never become a dose record (#10/#11). Needs a structured schedule, not today's free-text frequency. |
| 19 | **iOS pass** (GH #30) | Every device check so far is Android. Includes the #2 keyboard checks (Done on a number pad, tap-outside on Home, drag-to-dismiss), the iOS icon, time-picker feel. | M | Owner — no iOS device/Mac in this environment. |

## Tier 0 — Foundations · ✅ complete
Saturated fat, backup/export-import, native date/time picker, serving-size scaling,
recent quick-add — all shipped.

## Tier 1 — The differentiator · ✅ complete
Ingredient/allergen capture, outcome-based correlation (ingredients, foods, pairs,
nutrients, timing), symptom logging, ingredient-capture hardening + tag backfill,
trigger watchlist with badges and term editing, **medication tracking** — all
shipped. Next frontier: see ranked #8–#13 (experiments, medications in the
engine, latency, dose-response, confounders).

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
- Medication reminders → ranked #18; reminder deep-link → ranked #15.
- Remaining: photo attachment ⚠ (only worth it with ingredient extraction —
  a network call, owner §9) · save-confirmation toasts · onboarding + better
  empty states ·
  settings (force theme, first-day-of-week — hardcoded Sunday, default meal
  slot by time of day) · watchlist badges on Home recents.
- ✅ shipped (collapsed): OFF search-by-name → Search-a-licious migration,
  swipe-to-delete, haptics. Re-test the apple/orange generic-food gap in real
  use before any USDA layer (Decision 6).

## Tier 4 — Platform / infra
- iOS pass → ranked #19. Repository test harness → pinned #7.
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
