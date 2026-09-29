# HANDOFF.md — Execute session: Medications in the correlation engine, GitHub #20

> **Read first:** this file only. `CLAUDE.md` is auto-loaded. **You are on the
> experiments branch (`worktree-agent-a93006f35a36fc943`) in its worktree** —
> #19 is reviewed but unmerged; this cycle stacks on it (owner, 2026-09-28).
> Commit here; never touch the main checkout.
>
> **Pure JS/TS** — no new dependency, **no schema change**, no permission, no
> native change, no EAS build.

**Planned 2026-09-28 (Opus plan session, owner-reviewed) — GitHub
Michaelafuller/TummyTracker#20.** Done-when (issue): "medications are handled
as confounders and appear as candidate exposures in Insights." Owner
decisions (2026-09-28):

1. **Confounders = a caveat only.** Food/ingredient/combination numbers and
   confidence tiers stay exactly as they are; a finding whose rough outcomes
   mostly overlap one medication gets a caveat line.
2. **Effect window = built-in defaults.** A dose counts on its day and the
   next day; a small built-in list of **antibiotics** counts for its day plus
   the **7 days after** each dose. No schema change; unknown names get the
   default.
3. **Show medication findings in Insights only** (not the PDF, not "What came
   before" — later if wanted).
4. Build on the experiments branch.

Plan-session judgment (flag it; owner may override): for medications a
**rough day** = a day with ≥ 1 `isOutcome` entry. Day check-ins count toward
**coverage** only, never roughness — CLAUDE.md §0's #13 rule ("the correlation
engine never reads check-ins as outcomes") applies here, unlike experiments.

---

## 0. Invariants — read twice

- **The existing engine's numbers don't change.** `computeInsights`,
  `analyzeOutcomeRates`, `isOutcome`, `drilldown.ts` and every existing test
  stay as they are. Medication analysis is a **new module** the Insights
  screen composes alongside them.
- **Nothing is inferred.** Exposure comes only from logged dose rows (via
  `flattenDoseRecords`). Never from `frequency`, start/end dates or "active".
- **Only covered days are compared.** A day with no log entry and no check-in
  is neither exposed-and-fine nor unexposed-and-fine — it's left out.
- **Wording never claims causation.** "linked to rough days", "came while you
  were taking" — never "caused by", "because of", "safe".
- **Day math by local calendar day** (`formatDateInput`, `Date#setDate`).
- Stage by path; no `await` in a `db.transaction` callback (none expected).

## 1. Built-in class list — `src/lib/medicationClasses.ts`

```ts
export type MedicationClass = 'antibiotic';
/** Lowercase name tokens: amoxicillin, augmentin, amoxicillin-clavulanate, azithromycin, zithromax,
 *  z-pak, clarithromycin, doxycycline, minocycline, tetracycline, ciprofloxacin, cipro, levofloxacin,
 *  metronidazole, flagyl, cephalexin, keflex, cefuroxime, cefdinir, clindamycin, nitrofurantoin,
 *  macrobid, trimethoprim, sulfamethoxazole, bactrim, penicillin, erythromycin, rifaximin, vancomycin */
export const ANTIBIOTIC_NAMES: readonly string[]
/** Word-boundary match of the medication's name (normalized like watch terms) against the list —
 *  "Amoxicillin 500" and "amoxicillin-clavulanate" match; "moxi" doesn't. */
export function medicationClass(name: string): MedicationClass | null
/** Days AFTER the dose day that still count as exposed: antibiotic → 7, otherwise → 1. */
export function effectTailDays(name: string): number
```

Comment the list as a heuristic for common names, not a drug database.

## 2. Pure analysis — `src/features/analysis/medications.ts` (main test target)

```ts
/** Per medication id: the set of local day keys it counts as "exposed" —
 *  each dose's day plus effectTailDays(med.name) days after. Medications with no doses are absent. */
export function medicationExposureDays(meds, events, doses): Map<string, Set<string>>

/** Covered = any log entry (any type) or a day check-in; rough = any isOutcome entry. */
export function coveredAndRoughDays(entries, checkIns): { covered: Set<string>; rough: Set<string> }

export type MedicationFinding = {
  medicationId: string; name: string;
  exposedDays: number; exposedRough: number; exposedRate: number;   // covered exposed days
  otherDays: number;   otherRough: number;   otherRate: number;     // covered unexposed days
  confidence: ConfidenceTier;
};
export type MedicationNote = { medicationId: string; name: string;
  reason: 'nearly-every-day' | 'too-few-days'; exposedDays: number };

export function analyzeMedicationDays(entries, checkIns, meds, events, doses):
  { findings: MedicationFinding[]; notes: MedicationNote[] }
```

Rules (named exported constants):

- Only medications with ≥ 1 dose are considered (active or inactive).
- `too-few-days`: fewer than **5** covered exposed days.
- `nearly-every-day`: covered exposed days ≥ **90 %** of all covered days,
  **or** fewer than **5** covered unexposed days.
- Otherwise a **finding** only when `exposedRate > otherRate` (excess risk).
  Confidence mirrors `analyzeOutcomeRates`: **high** when
  `wilsonLowerBound(exposedRough, exposedDays) > otherRate`; **medium** when
  `exposedRate ≥ otherRate + MEDIUM_HIT_RATE_MARGIN` and
  `exposedDays ≥ MEDIUM_CONFIDENCE_MIN_MEALS`; else **low**. Show low ones
  only when there's no medium/high medication finding, capped at
  `MAX_LOW_CONFIDENCE_FINDINGS` — same policy as foods; reuse those constants
  from `temporal.ts`.
- Findings sorted by `exposedRate − otherRate` descending; notes A–Z.

Confounder caveats:

```ts
export type ConfounderCaveat = { medicationId: string; name: string; overlapping: number; hits: number };
/** For one finding's instances (meals + whether each was followed by a rough outcome):
 *  a hit "overlaps" a medication when the MEAL's day is in that medication's exposure days.
 *  Returns the medication with the most overlapping hits when that's ≥ 2 and ≥ half the hits
 *  (ties → A–Z by name); otherwise null. */
export function confounderCaveat(instances: readonly { entry: LogEntry; followedByOutcome: boolean }[],
  exposure: Map<string, Set<string>>, meds: readonly Medication[]): ConfounderCaveat | null
/** Instances for a combination finding ("a + b"): food entries whose tags contain both,
 *  flagged exactly like drilldown.findingInstances. */
export function pairInstances(entries, pairKey: string): { entry: LogEntry; followedByOutcome: boolean }[]
```

Use `findingInstances(entries, 'food' | 'tag', value)` for foods/ingredients
(don't fork it). Export any tiny helper you need from `drilldown.ts` rather
than duplicating the "followed by an outcome" join.

## 3. Insights screen — `src/app/(tabs)/insights.tsx`

- Data: `useDayCheckIns()`, `useMedications()`, `useMedicationEvents()`,
  `useMedicationDoses()`; compute exposure once (memoized) and pass it down.
- **New section "Medications linked to rough days"** after "Foods linked to
  rough outcomes", when there are findings **or** notes:
  - each finding as a `Card` (reuse), title = medication name, body
    "12 of 20 days on or after ibuprofen were rough (60% vs 25% on other
    logged days).", the confidence chip (label "N days" instead of "N meals"
    — add a prop to `ConfidenceChip`/`Card` rather than a second chip).
    Antibiotics: body says "during or within a week after" instead of "on or
    after".
  - notes as `textSecondary` lines: "Omeprazole — taken nearly every day, so
    there's nothing to compare against." / "Ibuprofen — only 3 logged days so
    far."
  - one footer line: "Days count only when you logged something. Linked
    doesn't mean caused."
- **Caveats on existing cards:** for each ingredient, combination and food
  finding, when `confounderCaveat` returns one, add a `textSecondary` line
  inside its card: "5 of these 7 rough outcomes came while you were taking
  amoxicillin." The card's numbers, chip and ordering are unchanged.

## 4. Tests (same change)

- `medicationClasses`: matches incl. brand names and "-clavulanate" forms,
  word boundaries, case/whitespace, unknown → null, tail days.
- `analysis/medications`: exposure days (default next day; antibiotic 7-day
  tail; overlapping doses union; month and DST boundaries); covered/rough
  (check-in covers but never roughs); every rule (too-few, nearly-every-day
  both ways, no excess → neither finding nor note, each confidence tier,
  low-only policy + cap, sorting); inactive medication with doses included;
  frequency/start/end never change anything.
- `confounderCaveat`: < 2 overlaps → null; exactly half → caveat; below half →
  null; misses (not followed) never count; tie → A–Z; `pairInstances`
  order-free matching.
- Insights screen: medication section + notes + footer; a caveat line on a
  food card (and absent when no overlap); existing card numbers unchanged.
- Every existing `insights`/`temporal`/`drilldown` analysis test green,
  untouched.

## 5. Definition of done

- `npm run typecheck`, `npm run lint` (0 warnings), `npm run bundle:check`.
- **Targeted Jest only (never the full suite):** files you created/touched +
  `src/features/analysis/__tests__/*`, `medications` (lib), `watchlist`,
  `insights` screen (`npx jest --runTestsByPath "src/app/(tabs)/__tests__/insights.test.tsx"`),
  `report`, `lookback`.
- No `@ts-ignore`, no lint disables, no `any` without `// reason:`, no new
  deps, no schema change. LF line endings.
- Do NOT run Maestro, EAS, `npx expo start` or `adb`. Do NOT edit `flows/`,
  `CLAUDE.md` or `docs/`. Don't push, don't merge.
- Commits (stage by path), suggested split:
  `feat(meds): built-in antibiotic list and effect windows` ·
  `feat(analysis): medication day analysis and food-finding confounder caveats` ·
  `feat(insights): medications section and confounder caveats` —
  each ending `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Execute summary: files per commit, hashes, rung results, targeted Jest
  counts, one worked example (fixture → finding sentence, and one caveat)
  pasted from a test, deviations, review pointers.

## 6. After this

- Opus review (§0 invariants, rule constants, wording); CLAUDE.md §0 note;
  PROGRESS; Maestro flow (seed an ibuprofen pattern + a meal overlapping it →
  section + caveat visible).
