# HANDOFF.md — Execute session: Elimination experiment, Cycle A (the whole loop), GitHub #19

> **Read first:** this file only. `CLAUDE.md` is auto-loaded — note §0's
> **"repository transactions must be synchronous"** rule and the real-SQLite
> repository test harness (use it for the new repository functions). Adds an
> `experiment` table (**owner-approved 2026-09-27**, additive), a pure
> experiment engine, repository + backup v5, and three screens.
>
> **Pure JS/TS + one additive migration** — no new dependency, no new
> permission, no native change, no EAS build. Notifications are **Cycle B**
> (not this cycle).

**Planned 2026-09-27 (Opus plan session) — GitHub
Michaelafuller/TummyTracker#19.** Done-when (issue): "I can start, follow and
finish an experiment and get a verdict with a confidence level." Owner
decisions (2026-09-27):

1. **Standard protocol:** baseline = the **14 days before start**, read from
   existing logs (no waiting); **avoid for 14 days** (user picks 7/14/21/28);
   then **3 challenge days** (eat it once a day) + **3 observation days**.
2. **Suspect = an ingredient term** matched against tags with the watchlist's
   word-boundary rule (`matchesWatchTerm`). Starting an experiment adds the
   term to the watchlist if absent, so save-time warnings work for free.
3. **New `experiment` table** approved; backups → **v5**.
4. **Loop first:** Cycle A = start, follow, reintroduce, verdict, abandon.
   Cycle B (later) = phase notifications, past-experiment history on the
   watchlist/Insights, experiments in the PDF, polish.

Plan-session judgment (flag in the summary; owner may override): an
experiment **rough day** = a day with ≥ 1 `isOutcome` entry **or** a "rough"
day check-in. The correlation engine is untouched (#13 rule stands there).

---

## 0. Invariants — read twice

- **The correlation engine does not change** (`src/features/analysis/*`,
  `isOutcome`). The experiment engine *reads* `isOutcome`.
- **Everything is by local calendar day** (`'YYYY-MM-DD'` via
  `formatDateInput`, days stepped with `Date#setDate` — never ms/86 400 000).
- **Nothing is inferred.** Exposure = a logged food entry whose tags match
  the term. A day with no log and no check-in is **uncovered** — never
  counted as fine or as avoided.
- **At most one active experiment.** Enforced in the repository (inside one
  synchronous transaction), not just the UI.
- **A verdict is an observation, not a diagnosis.** Copy never says
  "you are intolerant/allergic". Always shown with its confidence and the
  numbers behind it.
- **Safety copy on the start screen** (verbatim, §4). The app must not
  encourage reintroducing a food that caused a severe reaction.
- **Finishing freezes the verdict** (`verdictJson` snapshot) so later edits
  to old logs don't silently rewrite a finished experiment.
- Stage files by path — never `git add -A` / `git add .`. No `await` inside a
  `db.transaction` callback.

## 1. Schema + migration

`src/db/schema.ts`:

```ts
export const EXPERIMENT_STATUSES = ['active', 'completed', 'abandoned'] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export const experiment = sqliteTable('experiment', {
  id: text('id').primaryKey(),
  term: text('term').notNull(),                       // normalized (normalizeWatchTerm)
  startDate: text('start_date').notNull(),            // 'YYYY-MM-DD', first elimination day
  baselineDays: integer('baseline_days').notNull(),   // 14
  eliminationDays: integer('elimination_days').notNull(), // 7 | 14 | 21 | 28
  challengeDays: integer('challenge_days').notNull(), // 3
  observationDays: integer('observation_days').notNull(), // 3
  status: text('status', { enum: EXPERIMENT_STATUSES }).notNull(),
  verdictJson: text('verdict_json'),                  // frozen ExperimentVerdict at finish; null otherwise
  endedAt: integer('ended_at'),                       // finish or abandon time, epoch ms
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
```

Doc-comment the invariants. `npm run db:generate` → commit
`0011_*.sql` + snapshot + journal + `migrations.js`. The SQL must be only the
new `CREATE TABLE` (stop and report otherwise). Add a harness test that the
table exists after migrations.

## 2. Pure engine — `src/features/experiments/engine.ts` (main test target)

Also: add `wilsonUpperBound(successes, n, z = 1.96)` to `src/lib/stats.ts`
(mirror of the lower bound; 1 when n = 0), and export a small
`entryMatchesTerm(entry, term)` from `src/lib/watchlist.ts` (food entries
only, `matchesWatchTerm` over parsed tags — the private helper already
there).

```ts
export const DEFAULT_PROTOCOL = { baselineDays: 14, eliminationDays: 14, challengeDays: 3, observationDays: 3 };
export const ELIMINATION_CHOICES = [7, 14, 21, 28] as const;

export type Phase = 'elimination' | 'challenge' | 'observation' | 'ready';   // ready = observation over, verdict available
export interface ExperimentSchedule {
  baseline: string[]; elimination: string[]; challenge: string[]; observation: string[];
  lastDay: string;    // last observation day
}
export function experimentSchedule(exp: ExperimentLike): ExperimentSchedule
export function currentPhase(exp: ExperimentLike, todayKey: string):
  { phase: Phase; dayOfPhase: number /* 1-based */; phaseLength: number }
// Before startDate can't happen (start = today); treat as elimination day 1.

export interface DayFacts { covered: boolean; rough: boolean; exposed: boolean }
export function dayFacts(entries, checkIns, term): Map<string, DayFacts>
// covered = any log entry (any type) or a check-in that day
// rough   = any isOutcome entry that day, or a 'rough' check-in
// exposed = any food entry that day matching the term (entryMatchesTerm)

export interface PhaseStats { days: number; covered: number; rough: number; rate: number | null /* rough/covered */ }
export interface ExperimentEvaluation {
  baseline: PhaseStats; elimination: PhaseStats; reintroduction: PhaseStats; // reintroduction = challenge + observation days
  slipDays: string[];            // elimination days with exposure
  challengeExposureDays: number; // challenge days with exposure
  verdict: ExperimentVerdict | null; // null until phase === 'ready'
}
export type VerdictKind = 'likely-trigger' | 'likely-not-trigger' | 'inconclusive';
export interface ExperimentVerdict {
  kind: VerdictKind;
  confidence: ConfidenceTier | null;   // null for inconclusive
  reason: string;                      // one plain sentence, e.g. "Too few days logged while avoiding it."
  baselineRate: number | null; eliminationRate: number | null; reintroductionRate: number | null;
}
export function evaluateExperiment(exp, entries, checkIns, todayKey): ExperimentEvaluation
```

**Elimination stats exclude contaminated days:** each slip day **and the day
after it** are dropped from the elimination phase's `days/covered/rough`
(the reaction window spills over). Uncovered days never count.

**Verdict rules** (named, exported constants; evaluate in this order):

1. `inconclusive` — "Too many slips": slip days > `max(1, floor(eliminationDays × 0.15))`.
2. `inconclusive` — "You didn't log eating it on the challenge days":
   `challengeExposureDays === 0`.
3. `inconclusive` — "Not enough days logged": baseline covered < 7, **or**
   elimination covered < `max(5, ceil(0.6 × elimination days counted))`,
   **or** reintroduction covered < 4.
4. `inconclusive` — "No rough days before the experiment, so there was
   nothing to improve": baseline rough = 0.
5. With `b`, `e`, `r` the three rates: `drop = b − e`, `rise = r − e`.
   - `likely-trigger` when `drop ≥ 0.2` **and** `rise ≥ 0.2`.
   - `likely-not-trigger` when `drop < 0.1` **and** `rise < 0.1`.
   - otherwise `inconclusive` — "Mixed results: …" (say which half moved).
6. **Confidence:**
   - trigger: `high` when `wilsonUpperBound(e)` < `wilsonLowerBound(b)`
     **and** < `wilsonLowerBound(r)`; `medium` when exactly one of those
     holds; else `low`.
   - not-trigger: `medium` when elimination covered ≥ 10 and
     reintroduction covered ≥ 5 and `challengeExposureDays ≥ 2`; else `low`
     (absence of an effect is never `high` from one experiment).

## 3. Repository + backup v5

`src/db/repository.ts` (sync transactions — CLAUDE.md §0):

- `startExperiment({ term, eliminationDays }, now)` → normalizes the term
  (`normalizeWatchTerm`; invalid → throw), in **one transaction**: throw
  `ExperimentAlreadyActiveError` if an active one exists; insert the
  experiment (`startDate = formatDateInput(now)`, protocol defaults); insert
  the watchlist item if the term isn't watched yet. Returns the experiment.
- `getActiveExperiment()`, `getExperiment(id)`, `listExperiments()` (newest first).
- `finishExperiment(id, verdict, now)` → `status: 'completed'`,
  `verdictJson`, `endedAt`. Only from `active`.
- `abandonExperiment(id, now)` → `status: 'abandoned'`, `endedAt`. Only from `active`.
- `insertExperimentsPreservingIds(rows)` for restore: skip existing ids; if a
  restored row is `active` while the device already has an active one (or an
  earlier row in the same file is active), import it as `abandoned` with
  `endedAt = updatedAt`. Chunked like the others.
- Live hooks `useActiveExperiment()` / `useExperiment(id)` via `useLiveQuery`
  in `src/features/experiments/useExperiments.ts`.
- Backup: `entriesToJson(..., experiments = [])` → **version 5**;
  `parseBackupJson` validates `experiments` (ids, statuses, date keys,
  positive day counts, `verdictJson` string-or-null); v1–v4 still import;
  Settings export/import wire it in with a summary clause like the others.
- Real-SQLite tests (`src/db/__tests__/repository.experiments.test.ts`):
  start adds the watchlist term once; second start throws and writes
  nothing; finish/abandon only from active; restore precedence.

## 4. Screens

- **Start — `src/app/experiment/new.tsx`** (modal, title "New experiment"),
  opened with `?term=<term>`:
  - "Test **lactose**" + a three-line plan built from the schedule with real
    dates: "Avoid it: Sep 28 – Oct 11 · Eat it once a day: Oct 12 – 14 ·
    Keep logging: Oct 15 – 17".
  - Elimination length chips 7/14/21/28 (`SegmentedControl`, default 14).
  - Baseline preview from `evaluateExperiment`-style facts over the 14 days
    before today: "Your last 14 days: 9 logged, 4 rough." If covered < 7 or
    rough = 0, a `textSecondary` warning that the verdict will likely be
    inconclusive, and why — starting is still allowed.
  - **Safety note (verbatim):** "Don't use this to test a food that has
    caused a severe reaction — swelling, hives, trouble breathing or
    vomiting. Talk to a clinician first."
  - `PrimaryButton` "Start experiment" → `startExperiment` → replace to the
    experiment screen. If one is already active: disabled + "Finish or end
    your current experiment first."
- **Follow — `src/app/experiment/[id].tsx`** (title "Experiment"):
  - Header: "Testing **lactose**" + phase line: "Avoiding · day 5 of 14",
    "Eat it once today · challenge day 2 of 3", "Keep logging · day 1 of 3".
  - Today's instruction (one sentence per phase); on challenge days show
    whether today's exposure is logged ("Logged today ✓" / "Not logged yet").
  - Progress: slips so far ("1 slip — the day after is left out too"),
    days logged per phase so far.
  - "End experiment" (secondary, confirm Alert) → abandon → back.
  - Phase `ready`: the verdict card (below) + "Finish experiment" →
    `finishExperiment` with the evaluation's verdict.
  - `completed`: the **frozen** verdict from `verdictJson`; `abandoned`:
    "Ended early on <date>."
  - **Verdict card:** headline per kind — "Likely a trigger" /
    "Likely not a trigger" / "Inconclusive"; the confidence chip (reuse the
    Insights colours); the reason sentence; the numbers: "Rough days: before
    43% (6 of 14 logged) · while avoiding 7% (1 of 14) · after reintroducing
    50% (3 of 6)"; and the disclaimer "An observation from your own logs, not
    a diagnosis."
- **Entry points:**
  - Insights → Watchlist section: each item gets **"Start experiment"**
    (`accessibilityLabel="Start experiment on <term>"`) when no experiment is
    active; the item under test shows "Experiment running" linking to it.
  - Home: when an experiment is active, a compact row above the backup nudge
    — "Lactose experiment · Avoiding · day 5 of 14" (or "Verdict ready") —
    `accessibilityLabel="Open lactose experiment"` → experiment screen. Don't
    reuse existing Home labels.
- Register both routes in `_layout.tsx`. Typed routes: `.expo/types/router.d.ts`
  regenerates only under `expo start`; hand-patch locally if `tsc` needs it,
  never commit it.

## 5. Tests (same change)

- `engine.test.ts`: schedule dates (incl. a DST-crossing start and a month
  boundary); `currentPhase` at every boundary; `dayFacts` (covered by check-in
  only, rough by check-in only, outcome beats a "fine" check-in, exposure only
  from food entries); slip exclusion incl. the day after; every verdict rule
  in order with a fixture that isolates it; confidence tiers for both
  verdicts; `rate: null` when a phase has no covered days.
- `stats` test for `wilsonUpperBound`; `watchlist` test for `entryMatchesTerm`.
- Repository real-SQLite tests (§3); `backup` v5 round-trip + v4 file imports.
- Screen tests: start (plan dates, chips, warnings, safety copy, disabled when
  active); follow (each phase's copy, challenge-day logged indicator, end
  confirm, ready → finish writes the verdict, completed shows the frozen
  verdict even after entries change); Insights watchlist entry point; Home row.

## 6. Definition of done

- `npm run typecheck`, `npm run lint` (0 warnings), `npm run bundle:check` clean.
- **Targeted Jest only (owner instruction — never the full suite):** every
  test file you created or touched + `backup`, `stats`, `watchlist`,
  `dayCoverage`, `settings`, `index`, `insights`, `_layout`, all
  `src/db/__tests__/*`. `(tabs)`/`[id]` paths via
  `npx jest --runTestsByPath "<path>"`.
- No `@ts-ignore`, no lint disables, no `any` without `// reason:`, no new
  deps, no schema change beyond §1.
- Do NOT run Maestro, EAS, or `npx expo start`. Do NOT edit `flows/`,
  `CLAUDE.md` or `docs/`. Keep LF line endings.
- Commits (stage by path), suggested split:
  `feat(db): experiment table + additive migration 0011` ·
  `feat(experiments): pure schedule, day facts and verdict engine` ·
  `feat(experiments): repository, live hooks and backup v5` ·
  `feat(experiments): start, follow and verdict screens + entry points` —
  each ending `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
  Do NOT push.
- Execute summary: files per commit, hashes, the generated SQL verbatim, rung
  results, targeted Jest counts, a worked example (fixture → evaluation →
  verdict) pasted from a test, deviations with reasons, review pointers.

## 7. After this

- Opus review: invariants, verdict rules vs §2, day math, the one-active
  rule, frozen verdicts, safety copy; CLAUDE.md §0/§6; PROGRESS.
- Maestro (Opus): start from the watchlist → Home row → experiment screen;
  end early. The full ~20-day loop can't run in real time on a device — the
  verdict paths are Jest-covered; a device check of "ready"/verdict needs
  backdated seed data (plan it in Cycle B's test session).
- Cycle B plan: phase-change local notifications (own slot, like the day
  check-in), experiment history on the watchlist item and Insights,
  experiments in the PDF report, polish.
