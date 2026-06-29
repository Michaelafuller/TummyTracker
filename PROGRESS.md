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

- **MVP (Phases 0–3) + Flagship trio + Tier-0 + UI/UX sprint — all shipped to `main`,**
  running on the Pixel 5 via an EAS `preview` APK. (Manual & barcode entry, browse/edit
  with calendar, reminders, BM + symptom logging, ingredient & temporal correlation
  insights, serving-size scaling, backup/restore, 4-tab nav, offline mode.)
- **Health:** 165 Jest tests + all three rungs + `bundle:check` green; tree clean on `main`.
- **Test coverage caveat:** Maestro on-device suite is mid-backlog — first full run was
  5 ✅ / 14 ❌ (mostly flow bugs, not app bugs). See `docs/RESULTS.md` and the active
  `docs/HANDOFF.md`. Green rungs currently **overstate** real coverage.

### Shipped last cycle (overwrite each plan cycle; full history = `git log`)

- UI/UX sprint: accessible teal/mauve palette + `primary` tokens, 4-tab nav, offline
  mode, collapsible calendar, programmatic icons.
- Test infrastructure: `TEST_STRATEGY.md` (4-step loop, RESULTS.md, targeting/cadence),
  7 Maestro backfill flows authored, first full e2e run + `RESULTS.md`.

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
| **Trigger watchlist / elimination mode** | Mark suspected ingredients, flag entries containing them, track reactions — how food journals are *actually* used therapeutically | M | builds on ingredient capture |

## Tier 2 — The payoff (turn data into trust + motivation)

| Item | Why | Effort | Notes |
|------|-----|:--:|------|
| **Trends / charts** (sentiment over time, BM regularity, intake) | Motivation + pattern spotting | M | ⚠ charting lib (`react-native-gifted-charts` or hand-rolled `react-native-svg`) |
| **Per-food / ingredient drill-down** | Tap a finding → every instance + outcomes | S–M | no dep |
| **Confidence labeling on insights** | Don't erode trust with noise; gate on sample size, flag low-confidence | S | keeps it simple (see decision #2) |
| **Doctor / dietitian PDF report** | Share a date range + insights with a pro | M | ⚠ `expo-print` |

*(Insights-as-a-tab shipped in the UI/UX sprint.)*

## Tier 3 — Quality of life

OFF **search-by-name** (produce/restaurant/homemade have no barcode) · photo attachment ⚠ ·
save-confirmation toasts + haptics · onboarding + better empty states · swipe-to-delete ·
reminder **deep-link** into the add-entry form · settings (force theme, first-day-of-week —
currently hardcoded Sunday, default meal slot by time of day).

## Tier 4 — Platform / infra

iOS pass (BUILD_PLAN "iOS crossover") · **finish the Maestro backlog** (fix the 14
failing flows, then keep flow-authoring in every cycle) · screen-level RNTL tests ·
`bundle:check` in a pre-push hook · `FlashList` virtualization once entry volume grows.

---

## Decisions (resolved with owner)

1. **New dependencies OK** when CVE-inventoried and clearly value-additive.
2. **Insights stay simple** — counts / averages / thresholds + sample-size gating +
   confidence labels. Defer chi-square / effect-size until ingredient→sentiment proves
   out. (False triggers are worse than missed ones here.)
3. **Symptoms = a new loggable type** (mirror the BM migration), dedicated severity, not
   by overloading `sentiment`.
4. **`isOutcome` definition:** bad BM (Bristol 1, 2, 6, 7) OR symptom (severity ≥ 3) OR
   food entry (sentiment ≤ 2). Used by temporal correlation; tighten later if food-entry
   self-rating proves too circular.
5. **`isFood` uses a positive allowlist** (`FOOD_TYPES = ['meal','snack']`), required once
   'symptom' became a third type.

## Definition of done (see CLAUDE.md §4)

`npm run typecheck && npm run lint && npm test` green, **plus `npm run bundle:check`
before any EAS build**. Tests ship with the feature. One logical change per commit.
Schema changes are additive migrations, never mutations.
