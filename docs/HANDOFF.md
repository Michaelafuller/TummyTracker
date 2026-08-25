# HANDOFF.md — Execute session: doctor PDF report (+ haptics rider)

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§4 rungs, §8
> conventions, §9 guardrails). This cycle touches `package.json` (**two
> owner-approved deps: `expo-print`, `expo-haptics`** — already added to the
> §3 table), new `src/lib/report.ts` + `src/lib/haptics.ts`,
> `src/app/(tabs)/settings.tsx`, `src/app/entry/[id].tsx`,
> `src/app/entry/component/[componentId].tsx`,
> `src/features/logging/ComponentForm.tsx` (haptic hooks only), and tests.

**Planned 2026-08-24 (Fable plan session), owner-requested and pinned:**
share a date range + insights with a doctor/dietitian as a PDF. This is also
the long-planned **native-build cycle**, so the owner-approved `expo-haptics`
(deferred since the swipe-delete cycle) rides along.

---

## 0. THE constraint — read twice

**The installed dev client predates both new native modules.** A static
`import * as Print from 'expo-print'` in any eagerly-loaded module crashes
the Metro-served client on the owner's Pixel and breaks every Maestro flow
until a new EAS build exists. Therefore:

- **Never import `expo-print` or `expo-haptics` statically anywhere.** Only
  dynamic `await import('expo-print')` inside the user-triggered handler
  (report) and inside the `src/lib/haptics.ts` wrapper (haptics), each in a
  try/catch with a graceful fallback. Jest still intercepts dynamic imports
  via `jest.mock`, so tests are unaffected.
- **`npm run bundle:check` is a mandatory 4th rung this cycle** (new deps →
  bundler risk; this cycle precedes an EAS build).
- Install with `npx expo install expo-print expo-haptics` (SDK-matched
  versions), then run `npm audit --omit=dev` and report the result in your
  execute summary (Decision 1 CVE inventory).
- Do NOT run EAS/eas build (owner-driven), Metro, or Maestro.

## 1. Part A — PDF report

### 1.1 New `src/lib/report.ts` — pure HTML builder (no React, `now` passed in)

```
export const REPORT_RANGES = [14, 30, 90] as const;
export type ReportRangeDays = (typeof REPORT_RANGES)[number];
export function escapeHtml(text: string): string
export function buildReportHtml(
  entries: readonly LogEntry[], now: number, rangeDays: ReportRangeDays,
): string
```

- Range: entries with `loggedAt` in the `rangeDays` calendar days ending
  today inclusive (same `startOfDay` windowing as `bmRegularity`).
- Returns a complete printable HTML document (inline `<style>`, system font
  stack, black-on-white — this is for paper/PDF, not the app theme):
  1. Header: "TummyTracker report", the range ("July 26 – August 24, 2026"
     via `formatLongDate`), generated date.
  2. Summary line from `computeInsights(rangedEntries).summary` (entries ·
     food · BM · rated · avg sentiment — mirror the Insights screen's
     phrasing).
  3. Findings sections (ingredients / combinations / foods / timing /
     nutrients) from the same `computeInsights` result, each finding as one
     compact sentence with its confidence tier and n. Write the sentences in
     report.ts (don't import from the insights screen module). Skip empty
     sections; if no findings at all, one line: "No patterns stand out yet."
  4. Journal table grouped by day (newest day first): time, name, detail
     (sentiment label · Bristol n · severity n as applicable), notes.
  5. Footer disclaimer: exactly the Insights screen's observation framing
     ("These are observations from the user's own logs — patterns, not
     medical advice.").
- **Every user-authored string (names, notes, ingredient tags) goes through
  `escapeHtml`** — names like `Rice<script>` must render inert.

### 1.2 `src/app/(tabs)/settings.tsx` — "Doctor report" section

After the backup/export section: heading "Doctor report", small
textSecondary line "A printable summary of your logs and patterns to share
with a professional.", three range chips (Pressables styled like existing
chips/segments; labels "2 weeks", "30 days", "90 days";
`accessibilityState.selected`; default **30 days**), and a "Create PDF
report" button (existing button styling, `accessibilityLabel="Create PDF
report"`, disabled while working — reuse `dataWorking` or a sibling state).

Handler: `listLogEntries()` → `buildReportHtml(entries, Date.now(), range)`
→ `const Print = await import('expo-print')` →
`Print.printToFileAsync({ html })` → `Sharing.shareAsync(uri, { mimeType:
'application/pdf', dialogTitle: 'Share report' })`. Wrap the whole handler in
try/catch; on failure: `Alert.alert('Update required', 'Creating a PDF needs
the app build that includes printing — install the next dev build, then try
again.')`. (On the owner's current client this alert IS the expected
behavior; after the next EAS build the share sheet appears.)

## 2. Part B — haptics rider (spec from the swipe-delete cycle's §B.6)

### 2.1 New `src/lib/haptics.ts`

```
export type FeedbackKind = 'impact' | 'success';
export async function tapFeedback(kind: FeedbackKind): Promise<void>
```

Dynamic `await import('expo-haptics')`; `impact` →
`impactAsync(ImpactFeedbackStyle.Medium)`, `success` →
`notificationAsync(NotificationFeedbackType.Success)`. **Swallow every
error** (missing native module → silent no-op). Fire-and-forget at call
sites — never `await` it in UI flow, never let it reject unhandled.

### 2.2 Wiring (all fire-and-forget `tapFeedback(...)`)

- `src/app/entry/[id].tsx`: swipe action reveal
  (`ReanimatedSwipeable`'s `onSwipeableWillOpen`) → `'impact'`; confirmed
  component delete (the Remove press, before the repository call) →
  `'impact'`.
- `src/app/entry/component/[componentId].tsx`: confirmed delete →
  `'impact'`; successful save (after `updateMealComponentAndReaggregate`,
  before `router.back()`) → `'success'`.
- `src/features/logging/ComponentForm.tsx`: no changes beyond what the two
  screens need — if the cleanest hook is in the screens alone, leave the
  form untouched (preferred).

## 3. Tests (same change, CLAUDE.md §4)

- **New `src/lib/__tests__/report.test.ts`**: range filtering (in/out
  edges); `escapeHtml` (`<`, `>`, `&`, quotes) and that a malicious entry
  name appears only escaped in the output; summary numbers present; a
  seeded low-sentiment recurring food produces its finding sentence; empty
  range → "No patterns stand out yet." + empty journal handled; disclaimer
  present.
- **New `src/lib/__tests__/haptics.test.ts`**: `jest.mock('expo-haptics')`
  → right function per kind; mock that throws / mock module absent →
  resolves without throwing.
- **Settings screen test** (extend `src/app/(tabs)/__tests__/` settings
  coverage if present, else add one following its siblings): section
  renders; range chip select updates `accessibilityState`; pressing "Create
  PDF report" with `jest.mock('expo-print')` + mocked repository calls
  `printToFileAsync` with HTML containing the report title, then
  `shareAsync`; a rejecting `printToFileAsync` shows the Update-required
  alert (mock `Alert.alert`).
- Existing entry/component screen tests must stay green (haptics wrapper is
  mocked or no-ops harmlessly — it must not need mocking to pass, by
  design).

## 4. Definition of done

- `npm run typecheck` && `npm run lint` && `npm test` green, **plus
  `npm run bundle:check`** — run all four.
- No `// @ts-ignore`, no lint disables, no schema change, no static imports
  of the two new modules (grep yourself before committing:
  `grep -rn "from 'expo-print'\|from 'expo-haptics'" src` must return
  nothing).
- Commits (imperative, scoped), suggested split:
  `chore(deps): add expo-print + expo-haptics (owner-approved)` ·
  `feat(report): doctor PDF report — range picker + printable summary` ·
  `feat(haptics): tactile feedback on delete + save (graceful no-op)` ·
  `test(report): report builder + settings + haptics coverage`.
- Execute summary: files, commits, rung + bundle:check results, npm audit
  result, deviations with reasons.

## 5. After this (review pass + owner action + test session)

Fable reviews the diff, re-runs the four rungs, then device-checks that the
**new JS on the OLD client does not crash**: re-run `settings-smoke` and
`i-backup` flows, plus a scratch check that "Create PDF report" shows the
Update-required alert. Full PDF + haptics verification and a
`n-doctor-report.yaml` flow are **owed until the owner runs the next EAS
`development`-profile build** (which delivers both native modules; CLAUDE.md
§0 signing caveat applies — never install over the real app). **Metro for
this worktree is on port 8084**; a restart takes 8085 (orphaned-Metro
quirk).
