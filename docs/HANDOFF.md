# HANDOFF.md — Execute session: two §3 device-run findings (chance look-alikes, watchlist in backups)

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§0: the #24
> chance-check rules; the backup restore rules of #13/#23/#25/#29). **You
> are on `main`** in the main checkout `C:\Users\E146796\projects\TummyTracker`.
> Leave `flows/zb-experiment-verdict.yaml` (an uncommitted orchestrator edit)
> alone — don't stage it.
>
> **Pure JS/TS** — no dependency, no schema change (the watchlist table
> exists), no permission, no native change.

**Planned 2026-10-02 (Opus, owner-decided)** from the §3 device run
(`docs/OWED.md`):

1. **Chance check counts look-alikes once.** On the device fixture, the
   "Milky pasta" meals carry `lactose, pasta, milk, cheese` — four tags with
   exactly the same meals, so they are four identical findings. The #24
   chance line compared "found = 4" with ~1.3 expected and dropped its
   "could easily be chance" warning — the verdict depended on how many tags a
   meal carries, not on the evidence. Owner: **candidates that cover exactly
   the same units (meals or days) count as ONE finding** in the chance
   check, on the real journal and on every slide alike.
2. **Backups carry the watchlist.** Today a restore silently loses the
   watched ingredients. Owner: **export them (backup v11) and restore them;
   the device's own entry wins on a clash.**

## 0. Invariants

- **Display-only for #1:** no finding, card, tier, order, number or
  visibility changes — only the chance line's `found` / `expected` counting.
  The sentence wording, `checked` (still the raw number of things compared)
  and the flag rule (`round(expected) >= found`) are unchanged.
- **Same counting on real and slid journals** (the #24 rule).
- Synchronous repository transactions; stage by path; LF; no `@ts-ignore` /
  lint disables / bare `any`.

## 1. Chance check: one finding per identical unit set

- Each family's candidate source also reports, per candidate, a
  **signature** = the sorted ids of the units the finding is about, joined:
  - ingredients / foods / pairs (any window): the meal ids in the group
    (`outcomeRateCandidates` already builds `group.meals`);
  - nutrients: the high-side meal ids;
  - medications: the covered exposed day keys; factors: the covered flagged
    day keys.
  Return it **alongside** the existing results (e.g. a `signatures:
  Map<key, string>` next to `candidates`) — do NOT add a field to
  `OutcomeFinding` / `MedicationFinding` / `FactorFinding` /
  `NutrientOutcomeFinding` (they're rendered and tested widely).
- `chance.ts`: `tally` (and `slowerTally` via the same path) groups the
  counted candidates by signature and counts each group once, at the
  **best** tier among its members (identical units ⇒ the same rates, but take
  the max to be safe). Applies to `found` and to every slide.
- Tests (`chance.test.ts`):
  - Two tags that always co-occur count once: a journal where `a` and `b`
    are on exactly the same meals → `found.high` is 1, not 2; same for a slide.
  - Different meal sets with equal counts are NOT merged.
  - Meds: two medications always taken on the same days count once.
  - **The device fixture with the app's tag backfill applied**
    (`rederiveRowTags` from `src/lib/tagBackfill.ts` over the parsed entries,
    as the app does on start) — pin the resulting ingredient chance sentence
    in `src/features/experiments/__tests__/experimentFixture.test.ts` next to
    the existing #24 test (keep that one; it pins the raw-backup case). Paste
    both sentences in your summary.
  - Every existing chance test passes unchanged (if one changes, explain why
    — it should only be one whose journal had identical-set tags).

Commit: `fix(analysis): count look-alike findings once in the chance check`.

## 2. Watchlist in backups (v11)

- `src/lib/backup.ts`: `BackupFile.watchlistItems?` ("Absent before v11"),
  `entriesToJson` gains it (default `[]`), version 11; `parseBackupJson`
  normalises rows (id + non-empty term + createdAt number; re-normalise the
  term with the watchlist's own normaliser from `src/lib/watchlist.ts`; drop
  bad rows; de-dupe by term, first wins).
- Repository: `listAllWatchlistItems()` (if `listWatchlistItems` isn't
  already the full list, reuse it) and
  `insertWatchlistItemsPreservingIds(items)` — skip an item whose **id or
  term** already exists on the device; chunked like the other restore
  helpers; real-SQLite tests.
- Export (`src/features/backup/backupService.ts`) and import
  (`src/app/settings.tsx`, next to the other `insert…PreservingIds` calls)
  wire it through; after import, refresh the in-memory watchlist store the
  way other watchlist writes do (find how `useWatchlistStore` reloads).
- Tests: v11 round trip, a v10 file imports with no watchlist, clash by term
  keeps the device's row, settings import calls the insert.

Commit: `feat(backup): include the watchlist (backup v11)`.

## 3. Definition of done

- `npm run typecheck`, `npm run lint` (0 warnings), the **full `npm test`**
  (check `FAIL` lines and the `Test Suites:` count), `npm run bundle:check`.
- Don't run Maestro / EAS / adb; don't edit `flows/`, `CLAUDE.md`, `docs/`;
  don't push. A Metro server may be running from this checkout — leave it.
- Existing tests may change only where the spec changes behaviour (backup
  10 → 11 assertions, mocks gaining the new repository functions) — list each.
- Two commits as above, each ending
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Summary: files per commit + hashes, rung results, full-suite counts, the
  two fixture sentences, every existing test touched and why, deviations.
