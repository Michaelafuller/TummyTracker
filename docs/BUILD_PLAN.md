# BUILD_PLAN.md — Phased Spec

> How to use this with Claude Code: work **one phase at a time**. For each phase,
> open Plan Mode, paste the phase’s "Prompt to start" line, review the plan it
> proposes, approve, then let it execute against the verification rungs in
> CLAUDE.md §4. A phase is shippable only when both its automated checks are green
> *and* its manual acceptance checklist passes on a real device.

---

## Phase 0 — Scaffold + the verification loop

**Goal:** a runnable Expo app on the Pixel 5 with the feedback rungs wired up.
Nothing about food yet — this phase exists so the agentic loop has something to
climb in every later phase.

Tasks:
- Initialize an Expo (TypeScript) app with `expo-router`.
- Add and configure: `expo-sqlite`, `drizzle-orm` + `drizzle-kit`, `zustand`,
  `@tanstack/react-query`.
- Add scripts: `typecheck`, `lint`, `test` (exactly the commands in CLAUDE.md §4).
- Add Jest + `@testing-library/react-native`; write one trivial passing test so
  `npm test` is green.
- Set up Drizzle with an empty migration pipeline against a local SQLite db.
- Create an EAS project; produce an **Android dev build** and install it on the
  Pixel 5 over USB.

**Automated done:** `typecheck`, `lint`, `test` all pass.
**Manual done:** app launches on the Pixel 5 and shows a placeholder home screen.

**Prompt to start:**
`Plan Phase 0 from BUILD_PLAN.md. Scaffold the Expo+TS app, wire up the three verification scripts, and get a green test run. Do not implement any food features yet.`

---

## Phase 1 — MVP: log → rate → review

**Goal:** the core journal. Add meals/snacks (by barcode or manual entry), rate
sentiment now or later, browse and edit past entries, and get a daily reminder.

### 1a. Data layer
- Implement the `logEntry` schema (CLAUDE.md §6) in `db/schema.ts` + a migration.
- Pure helpers in `lib/`: `validateNotes` (≤500 chars), `validateNutrition`,
  sentiment scale module (CLAUDE.md §7). Unit-test each.

### 1b. Manual entry (build this before barcode — it’s the fallback and the simpler path)
- Form: name, meal slot, `loggedAt` (defaults to now, editable), the seven
  nutrition fields (all optional), notes (500-char counter), sentiment selector.
- Sentiment selector = the 5-emoji component, also usable standalone for later rating.

### 1c. Barcode ingestion
- `expo-camera` scanner screen.
- On scan, look up the barcode via Open Food Facts; map its nutriments to the
  schema fields; pre-fill the entry form; let the user correct anything.
- On miss/no-network, drop straight into the manual form with the barcode attached.
- Keep the OFF mapping in `lib/openFoodFacts.ts` as a pure, tested function
  (input: API JSON → output: partial nutrition object).

### 1d. Browse & edit
- List of entries grouped by day.
- Calendar picker (`react-native-calendars`) with **day / week / month** toggle.
- Tap an entry → view/edit screen (`app/entry/[id].tsx`); every field editable,
  including adding/changing sentiment after the fact.

### 1e. Reminders
- `expo-notifications` **local** scheduled notifications (e.g. configurable
  breakfast/lunch/dinner nudges to log + rate). No push server.

**Automated done:** all rungs green; `lib/` helpers and the OFF mapper have tests.
**Manual done on Pixel 5:** scan a real product and log it; log one manually;
edit a past entry’s sentiment; switch day/week/month views; receive a reminder.

**Prompt to start:**
`Plan Phase 1a–1b from BUILD_PLAN.md (data layer + manual entry). Stop after manual entry works end to end with passing tests; we’ll do barcode next.`
*(Drive 1c, 1d, 1e as separate Plan-Mode sessions — one sub-phase per session
keeps context clean and reviews small.)*

---

## Phase 2 — Bowel-movement tracking

**Goal:** add a third loggable object type so digestive outcomes are recorded
directly, not just inferred from meal sentiment.

Tasks:
- Extend `logEntry.type` to include `'bowel_movement'` (migration, not mutation).
- Optional Bristol Stool Scale (1–7) field; reuse the sentiment scale and notes.
- Its own quick-add path and its own rendering in the list/calendar.
- Filtering so the user can view meals, BMs, or both.

**Automated done:** rungs green; migration tested (old data still loads).
**Manual done:** log a BM, see it in calendar views, filter by type.

**Prompt to start:**
`Plan Phase 2 from BUILD_PLAN.md. Add bowel_movement as a logged type via a migration that preserves existing entries.`

---

## Phase 3 — Correlation analysis

**Goal:** turn the journal into insight: surface foods/nutrient thresholds/
ingredients associated with low sentiment or rough BMs.

Tasks (all logic lives in `features/analysis/` + pure functions in `lib/`):
- Aggregations: e.g. average sentiment when a nutrient exceeds a threshold;
  recurring ingredients/products that precede low-sentiment entries or rough BMs.
- A simple, explainable signal first (counts, averages, thresholds) before any
  fancier stats — keep it testable with fixture datasets.
- An "Insights" screen that states findings plainly ("meals over ~35g fat
  average a sentiment of 2.1") and always shows the supporting sample size.
- Guardrail: present correlations as observations, **never as medical advice.**

**Automated done:** correlation functions covered by unit tests against fixed
sample datasets with known expected outputs.
**Manual done:** with seeded data, the Insights screen shows a sensible finding.

**Prompt to start:**
`Plan Phase 3 from BUILD_PLAN.md. Start with pure correlation functions in lib/ plus fixture-based tests before any UI.`

---

## iOS crossover (do once Phase 1 is solid on Android)

- Configure the iOS target; run an EAS iOS build (or local Xcode build on the
  Mac mini) and ship to your iPhone 13 via TestFlight.
- Re-run the manual acceptance checklist on iOS; file platform-specific issues
  as their own small Plan-Mode tasks.
