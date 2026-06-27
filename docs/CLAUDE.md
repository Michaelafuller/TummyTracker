# CLAUDE.md — Project Constitution

> This file is read by Claude Code at the start of every session. It is the
> single source of truth for how this project is built, verified, and driven.
> Keep it current. If a convention here is wrong, fix it here first, then code.

---

## 1. What this project is

A **local-first food-sensitivity journal** for mobile. The user logs meals and
snacks, records how each one made them feel afterward (a 1–5 sentiment scale),
and over time the app surfaces correlations between what was eaten and poor
sentiment. Nutritional tracking (fats, carbs, protein, etc.) is a first-class
bonus, not the primary purpose.

Primary data ingestion is **barcode scan → nutrition lookup**, with **manual
entry** as the always-available fallback.

**Distribution:** Expo. Android first (sideload/dev build to a Pixel 5), iOS
later via EAS Build + TestFlight (Apple Developer account on file; a Mac mini is
available for local Xcode builds if needed).

## 2. Project philosophy (read this — it shapes how you should work)

The human owner is an experienced .NET developer deliberately using this project
to learn **autonomous, agentic coding workflows** with Claude Code. Therefore:

- **Optimize for a tight, automated feedback loop.** Every change should be
  verifiable by a command, not by vibes. See §4.
- **Prefer small, reviewable steps** with green checks over large speculative
  rewrites.
- **Explain your plan before non-trivial work** so the owner learns the reasoning
  (use Plan Mode for anything touching more than one file or introducing a
  dependency).
- **Never trade away the hard-stop billing safety.** Do not suggest enabling
  pay-as-you-go / "extra usage" credits. See WORKFLOW doc.

## 3. Tech stack (locked for MVP)

| Concern        | Choice                                              |
|----------------|-----------------------------------------------------|
| Framework      | Expo (managed) + React Native + **TypeScript**      |
| Routing        | `expo-router` (file-based)                           |
| Local DB       | `expo-sqlite` + **Drizzle ORM** (typed queries)      |
| UI state       | `zustand` (keep it minimal)                          |
| Data fetching  | `@tanstack/react-query` for the barcode lookup       |
| Barcode scan   | `expo-camera` (built-in barcode scanning)            |
| Nutrition API  | **Open Food Facts** (`world.openfoodfacts.org`, no key) |
| Notifications  | `expo-notifications` (**local scheduled** reminders) |
| Calendar       | `expo-calendar` (native calendar interop)            |
| Calendar UI    | `react-native-calendars` for day/week/month picker   |
| Tests          | Jest + `@testing-library/react-native`               |
| Lint/format    | `expo lint` (ESLint) + Prettier                      |
| Builds         | EAS Build (dev/preview/production)                   |

Do not introduce a backend, auth, or cloud sync in the MVP. All data is on-device.
If a new dependency seems necessary, propose it in Plan Mode with a one-line
justification before adding it.

## 4. Verification rungs — the definition of "done"

A task is **done only when all of these exit clean.** Run them yourself before
claiming completion. These are the rungs the agentic loop climbs.

```bash
npm run typecheck     # tsc --noEmit         — no type errors
npm run lint          # expo lint            — no lint errors
npm test              # jest                 — all tests pass
```

Rules:
- If you write a feature, you write or update its tests in the same change.
- If a check fails, read the actual error and fix it; do not silence it
  (no `// @ts-ignore`, no disabling lint rules) without explicit owner approval.
- Never mark a task complete with a red check. "It should work" is not done.

## 5. Repository layout

```
app/                  # expo-router routes (screens)
  (tabs)/             # bottom-tab navigation group
  entry/[id].tsx      # view/edit a single log entry
components/           # reusable presentational components
db/
  schema.ts           # Drizzle schema (source of truth for the data model)
  client.ts           # sqlite + drizzle setup
  migrations/         # generated migrations
features/
  logging/            # add/edit meal & snack flow
  barcode/            # scan + Open Food Facts lookup + manual fallback
  sentiment/          # the 1–5 emoji scale component + enum
  calendar/           # day/week/month views
  notifications/      # local reminder scheduling
  analysis/           # (Phase 3) correlation logic
lib/                  # pure helpers (no React) — easiest to unit-test
__tests__/            # or co-located *.test.ts(x)
```

Keep pure logic (nutrition math, correlation math, sentiment mapping) in `lib/`
as plain functions. Pure functions are trivial to test and are where the loop’s
verification leverage lives.

## 6. Data model (Drizzle is the source of truth — edit `db/schema.ts`)

MVP entities:

- **logEntry**
  - `id` (uuid, pk)
  - `type` — `'meal' | 'snack'` (Phase 2 adds `'bowel_movement'`)
  - `mealSlot` — `'breakfast' | 'lunch' | 'dinner' | 'snack' | null`
  - `name` (text)
  - `barcode` (text, nullable)
  - `loggedAt` (timestamp — when the meal happened, editable)
  - `sentiment` (int 1–5, nullable until rated; see §7)
  - `notes` (text, **max 200 chars** — enforce in validation, not just UI)
  - nutrition: `calories, fatG, carbsG, proteinG, fiberG, sugarG, sodiumMg`
    (all real, nullable)
  - `createdAt`, `updatedAt` (timestamps)

Conventions:
- Timestamps stored as Unix epoch (ms) integers.
- `loggedAt` is user-editable (they may backfill or correct a meal’s time).
- Sentiment can be set on creation **or** added/updated later — design every
  write path to allow a later sentiment edit.

## 7. Sentiment scale

Single enum, 1–5, low = bad digestive experience, high = great:

| value | meaning          | emoji (placeholder) |
|-------|------------------|---------------------|
| 1     | very unhappy     | 😖                  |
| 2     | unhappy          | 🙁                  |
| 3     | neutral          | 😐                  |
| 4     | satisfied        | 🙂                  |
| 5     | very satisfied   | 😄                  |

Define this **once** in `features/sentiment/scale.ts` as the single source of
truth (value ↔ label ↔ emoji). Never hard-code emojis in screens.

## 8. Conventions

- TypeScript strict mode on. No `any` without a `// reason:` comment.
- Functional components + hooks. No class components.
- Validation lives in `lib/` as pure functions and is unit-tested (e.g.
  `validateNotes`, `validateNutrition`).
- Accessibility: every interactive element gets an `accessibilityLabel`.
- Commit messages: imperative mood, scoped (e.g. `feat(logging): add snack form`).
- One logical change per commit so checkpoints/rewinds stay clean.

## 9. Guardrails — ask the owner before:

- Adding any new runtime dependency.
- Adding any network call beyond the Open Food Facts lookup.
- Anything that would request a device permission not already justified
  (camera, notifications, calendar are pre-approved; anything else is not).
- Changing the data schema after Phase 1 ships (write a migration, don’t mutate).
- Enabling remote push infrastructure (MVP uses local notifications only).

## 10. Model routing (for the owner driving the session)

- **Planning / architecture / reviewing a diff:** Opus 4.8 (or `opusplan`).
- **Bulk implementation, test writing, refactors:** Sonnet 4.6.
- **Cheap mechanical edits / quick lookups:** Haiku 4.5.
- Switch with `/model`. See `CLAUDE_CODE_WORKFLOW.md` for the full driving guide.
