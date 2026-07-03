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
- **Health:** 301 Jest tests + all three rungs + `bundle:check` green at HEAD of the
  2026-07-02 cycle branch (`claude/determined-bartik-13b8aa`), awaiting merge to `main`.
- **Test coverage caveat:** Maestro suite at 16/19 verified; 3 flows still await a
  rebuild + device run (`docs/RESULTS.md` §For next session). The 2026-07-02 cycle
  edited several flow YAMLs (authored ⏳), reworked the light palette (shared infra),
  and changed the scan flow — the next device session must be a **full-suite** run on
  a fresh build. Green rungs currently **overstate** real coverage.
- **Owner on-device checklist (2026-07-02 cycle):** iOS app icon (needs EAS build),
  iOS time-picker Done-button feel, light-mode look, migration 0006 against a real
  database, and the full scan → add-next → finish-meal → review → save loop (camera).

### Shipped last cycle (overwrite each plan cycle; full history = `git log`)

2026-07-02 owner-feedback cycle (planned Fable 5, executed Sonnet 5):
- **Bug/UX batch:** notes limit 500 · 12-hour clock display · iOS time-picker
  dismissal fix (Done-button inline spinner) + native pickers for reminder times ·
  searchable recents quick-add · iOS app icon fix (opaque PNG, `.icon` bundle removed) ·
  light-mode palette rework + `danger`/`link` tokens.
- **Meal builder:** multi-scan grouped meals — `mealComponent` table (migration 0006),
  one-serving-per-item aggregation, tag union incl. component names, review screen with
  single meal-level sentiment, backup v2 round-trip, grouped display in journal/edit.
- **Insights v2:** `stats.ts` (Wilson, Welch SE, confidence tiers) · baseline-relative
  ingredient/food findings with deltas + confidence chips · ingredient-pair
  (combination) analysis · zero-dep charts (trend bars, mini histograms, rate meters) ·
  stricter nutrient gating · insights tab redesign.

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

Sentiment trend chart, confidence labeling, and ingredient-pair analysis **✅ shipped**
(insights v2, 2026-07-02). Remaining:

| Item | Why | Effort | Notes |
|------|-----|:--:|------|
| **Per-food / ingredient drill-down** | Tap a finding → every instance + outcomes | S–M | no dep; natural follow-on to insights v2 |
| **BM-regularity + intake charts** | Complete the trends story beyond sentiment | S–M | reuse the zero-dep chart components |
| **Meal-component editing after save** | v1 meal builder saves components immutably; edit/remove with re-aggregation is the obvious next ask | S–M | builds on migration 0006 |
| **Doctor / dietitian PDF report** | Share a date range + insights with a pro | M | ⚠ `expo-print` |

## Tier 3 — Quality of life

**OFF search-by-name — planned, fully specced in `docs/HANDOFF.md` (2026-07-03).**
Name-lookup on the manual-entry Name field (blur-triggered, inline suggestion
list, never a blind auto-fill), plus retargeting Home's "+ Add manually" onto
the meal-builder chain (`meal/component.tsx`) so manually-typed items can join a
multi-item meal the same way scanned ones already do. `entry/new.tsx` +
`LogEntryForm` stay live for the Recent-quick-add re-log path and for editing.
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

## Definition of done (see CLAUDE.md §4)

`npm run typecheck && npm run lint && npm test` green, **plus `npm run bundle:check`
before any EAS build**. Tests ship with the feature. One logical change per commit.
Schema changes are additive migrations, never mutations.
