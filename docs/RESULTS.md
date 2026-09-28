# RESULTS.md — Full regression 2026-09-27 (GitHub #12: re-baseline after the 2026-09-26 session + `hideKeyboard` audit)

## Addendum — full Jest re-baseline 2026-09-27 (after GH #13–#18)

- **Full `npm test` at `2f1915f`: 113 suites / 1,168 tests, all passed**
  (20.6 s), up from 95 / 887 — covers the six cycles since (day check-in,
  automatic backups, "what came before", polish bundle, meds in the PDF,
  real-SQLite repository tests). Typecheck, lint (0 warnings) and
  `bundle:check` were clean at each cycle's end.
- Same single non-failing warning as before ("A worker process has failed to
  exit gracefully" — a leaked timer; see Findings). Not new.
- **Maestro not re-run** — the Pixel 5 is disconnected. Owed device checks
  for #13–#18 are listed in `docs/PROGRESS.md` → Status; the 34/34 run below
  remains the device baseline.

## Summary

- **Baseline run (code as of `a3e1ebe`, flows unchanged): 34/34 passed** in
  1h 14m 52s (`flows/results.xml`). **This is the new clean baseline**,
  replacing 29/29 of 2026-08-29 — the first full run covering the 2026-09-26
  session (GitHub #1 re-log + Add item, servings stepper, Journal week strip,
  Medications #4–#11, Settings gear, keyboard dismissal #2) and the five flows
  added since (`p`, `q`, `r`, `s`, plus `o` from 08-29).
- **Full Jest: 95 suites / 887 tests, all passed** (up from 74 / 648).
  Typecheck, lint and `bundle:check` clean. One non-failing warning: "A worker
  process has failed to exit gracefully" — a test leaks a timer (see Findings).
- **`hideKeyboard` audit:** all **86** `hideKeyboard` calls replaced (19 files
  incl. the seed helpers) — see below. Full re-run with the converted flows:
  **32/34**; the 2 failures were a flow-side scroll issue, fixed and re-verified
  (**2/2**) against the identical helper — so **all 34 flows are green on the
  final files**.
- **Device + build:** Pixel 5 (`0A131FDD4006VE`), `com.tummytracker.app.dev`,
  `DEBUGGABLE`; the 2026-08-29 EAS development build (expo-print,
  expo-haptics, react-native-keyboard-controller natives present). Metro fresh
  `--clear` on 8081, bundle pre-warmed; Maestro 2.10.0.
- **App regressions found: 0.** Every failure this session was flow-side.

## The `hideKeyboard` audit

**Why:** on Android `hideKeyboard` is a Back press. When the keyboard is
already closed (e.g. an `eraseText` burst dropped focus), Back navigates
instead — silently pops a pushed screen, or exits the app from a tab root
(`h-recent-foods` did exactly that on 2026-09-26).

**What changed:**
- New `flows/_helpers/dismiss-keyboard.yaml`: taps the keyboard toolbar's Done
  (`keyboard.toolbar.done`, react-native-keyboard-controller's default testID)
  **only when it is visible**. The toolbar (GitHub #2) is on screen exactly
  while a keyboard is open, so this closes an open keyboard and is a no-op
  otherwise — never a blind Back.
- 85 calls → the helper; the one Home call (`h-recent-foods`, after typing in
  the Recent search) → a tap in empty space, because the toolbar is hidden on
  Home. Seed helpers reference `dismiss-keyboard.yaml` (runFlow paths are
  relative to the calling file).
- **Knock-on fixed:** after Done (vs. Back), a keyboard-aware form rests at a
  different scroll position, so in `j-component-drilldown` and
  `q-reuse-adjust` the `scrollUntilVisible` on the *Calories label* stopped
  with the input below the fold; the tap hit the (non-clickable) label, focus
  stayed in Name, and "100" landed there ("Beans100"). Fix: `centerElement:
  true` on those Calories scrolls (5 sites). Diagnosed from the view hierarchy:
  after the tap, no EditText was focused and the only "Calories" node was the
  label at the screen's bottom edge.

## Per-flow

Baseline (unchanged flows): all 34 ✅. Converted flows: all ✅ except
`j-component-drilldown` / `q-reuse-adjust` (❌ → ✅ after `centerElement`).
Slowest: `03-insights` 6–8 min, `d-ingredient-insights` ~6 min,
`m-finding-drilldown` ~6 min.

## Findings for the next planning session

1. **Remaining `eraseText` bursts (4):** `ab-satfat-ingredients` (`eraseText:
   40`), `f-serving-size` (`eraseText: 20`), `j-component-drilldown`,
   `o-watchlist-edit`. All green in both runs, but the burst-drops-focus
   pattern (E2E.md finding) makes them the likeliest future flake; convert to
   per-key `pressKey: Backspace` if one ever fails.
2. **Jest worker-exit warning:** some test leaves a timer running (`--detectOpenHandles`
   to find it). Non-failing; worth a small cleanup.
3. **Suite runtime ~75 min** for 34 flows on the Pixel 5 — the insights flows
   dominate. Fine for a re-baseline; too slow to run per change (targeted runs
   remain the norm).

## Files changed

`flows/_helpers/dismiss-keyboard.yaml` (new) · 19 flow/helper files
(`hideKeyboard` → helper / tap-outside) · `j-component-drilldown`,
`q-reuse-adjust` (`centerElement`) · `docs/E2E.md` (gotcha #2 update) ·
`docs/PROGRESS.md` · this file. No `src/**` changes.

---

_Previous report (2026-08-29, 28/28 → 29/29 on the new build) is in git
history: `git show e4d3e36:docs/RESULTS.md`._
