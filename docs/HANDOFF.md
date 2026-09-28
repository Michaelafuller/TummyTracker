# HANDOFF.md — Execute session: Real-SQLite tests for `repository.ts` + atomic transactions, GitHub #18

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§4 rungs, §8
> conventions, §9 guardrails). Adds a Jest-only SQLite harness (a fake
> `expo-sqlite` backed by Node's built-in `node:sqlite`), repository tests
> against it, and fixes every `db.transaction(...)` in
> `src/db/repository.ts` to be genuinely atomic.
>
> **No new dependency** (`node:sqlite` is built into Node ≥ 22.13; this
> machine runs Node 26), no schema change, no permission, no native change,
> no EAS build. App behavior changes only in that multi-row writes become
> all-or-nothing, which is what every doc comment already claims.

**Planned 2026-09-27 (Opus plan session) — GitHub
Michaelafuller/TummyTracker#18.** Done-when (from the issue): "a DB test
harness exists and covers create/update/delete/restore paths."

## ⚠ The bug this cycle fixes (found while planning — spike verified)

`drizzle-orm/expo-sqlite`'s `transaction()` is **synchronous**
(`node_modules/drizzle-orm/expo-sqlite/session.js`): it runs `BEGIN`, calls
the callback, then runs `COMMIT` immediately. Every repository transaction
passes an **`async`** callback and `await`s queries inside it. An `await`ed
drizzle query executes in a later microtask — **after `COMMIT`** — so on the
device none of these writes are inside the transaction, and a failure
halfway leaves partial data (e.g. a meal row with no components, an event
with only some doses). A throwaway spike in the plan session proved it
against real SQLite: a failing async callback left its inserted row behind;
the same failure in a sync callback rolled back.

**Fix:** make every transaction callback **synchronous**, using the sync
query API the expo-sqlite driver supports (`.run()`, `.all()`, `.get()` on
`tx` builders — e.g. `tx.insert(t).values(v).run()`,
`tx.select().from(t).where(...).all()`). The exported repository functions
stay `async` (callers unchanged); compute everything that doesn't need the
DB (ids, timestamps, aggregates) before the transaction. No `await` inside a
transaction callback, ever.

---

## 0. Invariants — read twice

- **The harness never ships.** It lives under `jest/` and test files only;
  nothing in `src/` (non-test) imports it or `node:sqlite`.
- **Tests run the real code paths:** the real `src/db/client.ts` (with
  `expo-sqlite` mocked by the harness), the real Drizzle schema, the real
  migrations (`drizzle-orm/expo-sqlite/migrator`'s `migrate(db, migrations)`),
  and the real repository functions. Don't mock the repository or Drizzle.
- **Repository behavior is otherwise unchanged:** same return values, same
  ordering, same skip/preserve semantics. The only change is atomicity.
- **Each test file gets its own in-memory database** (Jest's per-file module
  registry gives a fresh `client.ts`); tests within a file reset tables in
  `beforeEach` so they're independent.
- Stage files by path — never `git add -A` / `git add .`.

## 1. Harness — `jest/expo-sqlite-node.ts` + `src/db/__tests__/testDb.ts`

`jest/expo-sqlite-node.ts` exports a stand-in for the `expo-sqlite` surface
Drizzle uses (verified in the spike):

```ts
openDatabaseSync(name, options?) → {
  prepareSync(sql) → {
    executeSync(params = []) → { changes, lastInsertRowId, getAllSync(), getFirstSync() },
    executeForRawResultSync(params = []) → { getAllSync() /* rows as arrays */ },
    finalizeSync(),
  },
  execSync(sql), closeSync(),
}
addDatabaseChangeListener() → { remove() }   // drizzle's useLiveQuery imports it
```

- Backed by `new DatabaseSync(':memory:')` from `node:sqlite` (ignore the
  file name). Enable foreign keys only if the app's DB does (it doesn't set
  the pragma — don't add it).
- Row-returning vs write statements: use `statement.columns().length > 0`
  (node:sqlite API), **not** a SQL regex. Row-returning → `stmt.all(...params)`
  (objects) for `executeSync`, and `setReturnArrays(true)` for
  `executeForRawResultSync` (reset it afterwards). Writes → `stmt.run(...)`,
  mapping `changes`/`lastInsertRowid` to numbers.
- Map any `boolean` param to `1/0` and `undefined` to `null` defensively
  (node:sqlite rejects both), in one small helper.
- Header comment: why it exists, that it mirrors only what Drizzle calls,
  Node ≥ 22.13 requirement, and the transaction finding above.

`src/db/__tests__/testDb.ts` (a helper, not a test — make sure Jest doesn't
treat it as a test file: check `testMatch`/`testRegex` in `jest.config.js`
and name/locate it accordingly) exports:

- `installExpoSqliteFake()` is not needed if each DB test file simply starts
  with `jest.mock('expo-sqlite', () => require('<rootDir-relative path to jest/expo-sqlite-node>'))`
  — do that (Jest hoists `jest.mock`).
- `migrateTestDb()` → `await migrate(db, migrations)`.
- `resetTestDb()` → `DELETE FROM` every app table (list them from
  `schema.ts`; keep `__drizzle_migrations`).

## 2. Repository fix — `src/db/repository.ts`

Convert all 9 `db.transaction(async (tx) => { … await … })` sites to sync
callbacks as described above. Keep each function's doc comment accurate
(several say "one transaction" — now true). Where a transaction reads then
writes (`updateMealComponentAndReaggregate`,
`deleteMealComponentAndReaggregate`, `updateMedicationEvent`, …), the reads
use `.all()`/`.get()` inside the callback. Return values that the callback
used to `return` from an async function must still come out the same.

## 3. Tests — `src/db/__tests__/repository.*.test.ts`

Split by area (e.g. `repository.entries.test.ts`, `.meals.test.ts`,
`.medications.test.ts`, `.restore.test.ts`, `.misc.test.ts`) so failures
point somewhere. Cover at least:

- **Harness sanity:** all migrations apply to an empty DB; every table in
  `schema.ts` exists.
- **Log entries:** create (single + batch) → get/list ordering; update
  (partial patch, `updatedAt` bumps); delete (also removes its meal
  components); `listRecentFoodEntries` distinct-by-name; `hasAnyLogEntry`.
- **Meals:** `createMealWithComponents` writes the entry + components with
  sort order; `updateMealComponentAndReaggregate` updates totals/tags on the
  parent; `deleteMealComponentAndReaggregate` re-aggregates and returns
  `'last'` without deleting the final component.
- **Atomicity (the fix):** for each transactional write, force a failure
  after its first statement (e.g. a duplicate primary key in the second
  insert, or a constraint violation) and assert **nothing** from that call
  persisted. These tests must fail against the pre-fix code — run them once
  before converting the transactions and note the failures in your summary.
- **Medications:** create/update (rename, deactivate — never deleted);
  events: create with doses, update **replaces** doses (the 2026-09-26
  stale-doses class: old dose rows gone, new ones present, no duplicates),
  delete removes event + doses, `getMedicationEvent`.
- **Restore (2026-09-26 bound-variable class):**
  `insertMedicationsPreservingIds`, `…EventsPreservingIds` (returns
  `insertedIds`), `…DosesPreservingIds` keep ids, skip existing ids, and
  succeed with **5,000 dose rows** in one call (above SQLite's 32,766
  bound-variable cap at 7 columns if it weren't chunked);
  `insertMealComponents`; `insertDayCheckInsPreservingIds` (device's date
  wins, in-file duplicate dates, chunking).
- **Other writes:** `upsertDayCheckIn` (one row per date; second call
  updates), `getDayCheckIn`, `listAllDayCheckIns` order; watchlist
  add/rename/remove + unique term; goals `upsertGoal` overwrite by nutrient,
  `removeGoal`; `applyTagBackfill`.

Don't test `useLiveQuery` hooks here.

## 4. Definition of done

- `npm run typecheck` && `npm run lint` clean; `npm run bundle:check` clean
  (proves the harness isn't in the app bundle).
- **Targeted Jest only (owner instruction — never the full suite):** all new
  repository test files + `migrations`, plus every existing test file that
  mocks `@/db/repository` is unaffected by definition — but run
  `backup`, `settings` (`--runTestsByPath "src/app/__tests__/settings.test.tsx"`),
  `backupService`, `dayCheckInService` and `tagBackfill` since they're
  repository-adjacent.
- Report the new tests' runtime (the 5,000-row case must stay fast; if a
  file takes > 10 s, say so).
- No `@ts-ignore`, no lint disables (a `// reason:` comment is fine where the
  harness needs a loose type at the node:sqlite boundary), no new deps, no
  schema change.
- Do NOT run Maestro, EAS, or `npx expo start`. Do NOT edit `flows/`,
  `CLAUDE.md` or `docs/`. Keep LF line endings.
- Commits (stage by path), suggested split:
  `test(db): in-memory SQLite harness for repository tests (node:sqlite)` ·
  `test(db): repository tests for entries, meals, medications, restore` ·
  `fix(db): make repository transactions atomic (sync callbacks)` —
  put the atomicity tests in the **fix** commit so history shows red→green.
  Each ending `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
  Do NOT push.
- Execute summary: files per commit, hashes, rung + bundle:check results,
  test counts + runtimes, the atomicity tests' pre-fix failures (names +
  one-line reason), any repository function whose behavior you had to
  touch beyond the transaction conversion (should be none), deviations with
  reasons.

## 5. After this (review + test session)

- Opus review: every transaction callback sync (grep `transaction(async` →
  none), harness fidelity to expo-sqlite, no harness in the app bundle.
- Update CLAUDE.md §0/§4 (the harness, Node ≥ 22.13 for tests, the
  "no `await` inside a transaction" rule).
- Device: a normal regression pass is enough (behavior only changes on
  failure) — the save paths: meal with several items, edit/delete a meal
  item, medication entry create/edit/delete, backup import.
