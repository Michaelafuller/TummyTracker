// Jest-only stand-in for the `expo-sqlite` surface that `drizzle-orm/expo-sqlite`
// actually calls (verified against node_modules/drizzle-orm/expo-sqlite/{driver,
// session,query}.js), backed by Node's built-in `node:sqlite` (requires Node >=
// 22.13; this repo's dev/CI machines run newer). It mirrors ONLY that surface —
// it is not a general `expo-sqlite` polyfill, has no native module behind it, and
// must never be imported by non-test code under `src/` (see docs/HANDOFF.md §0 —
// GitHub #18).
//
// Why this exists — the bug this cycle's harness proves and fixes: drizzle-orm's
// `ExpoSQLiteSession#transaction()` (session.js) is fully SYNCHRONOUS. It calls
// `BEGIN`, invokes the transaction callback, and issues `COMMIT` immediately
// after the callback *returns* — it never awaits the callback. Every
// `db.transaction(...)` call in src/db/repository.ts used to pass an `async`
// callback that `await`ed queries inside it: an async function returns a
// pending Promise the instant it reaches its first `await`, so `COMMIT` fired
// before any of those awaited queries had actually run against the database. A
// plan-session spike proved this against real SQLite (a failing async callback
// left its inserted row behind; the same failure in a sync callback rolled
// back), and this harness lets the repository tests reproduce and then guard
// against it. Every transaction callback must now be a plain synchronous
// function using the sync query API (`.run()`, `.all()`, `.get()`) — no `await`
// inside a transaction callback, ever.

import { DatabaseSync, type StatementSync } from 'node:sqlite';

// node:sqlite's own `SQLInputValue` (node_modules/@types/node/sqlite.d.ts) is
// declared without `export` inside its `declare module` block, so it can't be
// imported by name — this mirrors it for our own binding helper below.
type BindableValue = null | number | bigint | string | NodeJS.ArrayBufferView;

/**
 * node:sqlite's native binding rejects `undefined` outright, and — depending
 * on the exact Node build — may also reject a bare `boolean`. Drizzle already
 * encodes its own `mode: 'boolean'` columns to 1/0 before a value reaches the
 * driver, but this defensively normalizes both cases anyway so any other path
 * that hands us a raw JS boolean/undefined doesn't crash the fake.
 */
function bindable(value: unknown): BindableValue {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  // reason: drizzle only ever hands the driver SQLite-compatible bind values
  // (null/number/bigint/string/ArrayBufferView) — this cast just recovers the
  // narrower type node:sqlite's typings want after the two dynamic checks above.
  return value as BindableValue;
}

function bindableParams(params: readonly unknown[] = []): BindableValue[] {
  return params.map(bindable);
}

/**
 * Test-only control hook — NOT part of the expo-sqlite surface, and not used
 * by the fix. The atomicity tests need to force one specific statement inside
 * a multi-statement transaction to fail (a real driver failure would come
 * from a constraint violation; several of the nine transactions are pure
 * UPDATE/DELETE sequences with no constraint a legitimate input can trip), so
 * this arms a one-shot failure keyed on the generated SQL text of the next
 * matching statement. It throws exactly once, then disarms itself.
 */
let armedFailure: { pattern: RegExp; message: string } | null = null;

export function armNextStatementFailure(pattern: RegExp, message = 'armed failure for atomicity test'): void {
  armedFailure = { pattern, message };
}

export function clearArmedStatementFailure(): void {
  armedFailure = null;
}

function maybeThrowArmedFailure(sql: string): void {
  if (armedFailure && armedFailure.pattern.test(sql)) {
    const { message } = armedFailure;
    armedFailure = null;
    throw new Error(message);
  }
}

/** Mirrors the object `SQLiteStatement#executeSync()` returns on real expo-sqlite. */
interface FakeExecuteResult {
  changes: number;
  lastInsertRowId: number;
  getAllSync(): unknown[];
  getFirstSync(): unknown;
}

/** Mirrors the object `SQLiteStatement#executeForRawResultSync()` returns. */
interface FakeRawExecuteResult {
  getAllSync(): unknown[];
}

/** Mirrors the subset of `SQLiteStatement` that drizzle-orm/expo-sqlite calls. */
interface FakeStatement {
  executeSync(params?: readonly unknown[]): FakeExecuteResult;
  executeForRawResultSync(params?: readonly unknown[]): FakeRawExecuteResult;
  finalizeSync(): void;
}

function wrapStatement(stmt: StatementSync, sql: string): FakeStatement {
  // node:sqlite's own way to tell a row-returning statement (SELECT, or an
  // INSERT/UPDATE/DELETE ... RETURNING) from a plain write: `columns()` is
  // empty for the latter. This mirrors drizzle's own `run` vs `all`/`get`
  // split without parsing SQL text.
  const isRowReturning = stmt.columns().length > 0;

  return {
    executeSync(params = []) {
      maybeThrowArmedFailure(sql);
      const bound = bindableParams(params);
      if (isRowReturning) {
        const rows = stmt.all(...bound);
        return {
          changes: 0,
          lastInsertRowId: 0,
          getAllSync: () => rows,
          getFirstSync: () => rows[0],
        };
      }
      const { changes, lastInsertRowid } = stmt.run(...bound);
      return {
        changes: Number(changes),
        lastInsertRowId: Number(lastInsertRowid),
        getAllSync: () => [],
        getFirstSync: () => undefined,
      };
    },
    executeForRawResultSync(params = []) {
      maybeThrowArmedFailure(sql);
      const bound = bindableParams(params);
      // Row objects by default; flip to arrays for the "raw" shape drizzle
      // wants here, then flip back so a later executeSync() on the same
      // (re-prepared) statement isn't affected.
      stmt.setReturnArrays(true);
      try {
        const rows = stmt.all(...bound);
        return { getAllSync: () => rows };
      } finally {
        stmt.setReturnArrays(false);
      }
    },
    finalizeSync() {
      // node:sqlite statements need no explicit finalize — they're cleaned up
      // by GC / when the owning database closes. Kept as a no-op so callers
      // that mirror the real expo-sqlite lifecycle (prepare → use → finalize)
      // don't need a special case for the fake.
    },
  };
}

/** Mirrors the subset of `SQLiteDatabase` that drizzle-orm/expo-sqlite calls. */
interface FakeDatabase {
  prepareSync(source: string): FakeStatement;
  execSync(source: string): void;
  closeSync(): void;
}

/**
 * Stand-in for `expo-sqlite`'s `openDatabaseSync`. Always opens a fresh
 * `:memory:` node:sqlite database — the `name`/`options` real expo-sqlite uses
 * to pick/open an on-disk file are accepted (so call sites like
 * `src/db/client.ts` don't need a test-only branch) but otherwise ignored.
 */
export function openDatabaseSync(_name: string, _options?: Record<string, unknown>): FakeDatabase {
  const sqlite = new DatabaseSync(':memory:');

  return {
    prepareSync(source: string) {
      return wrapStatement(sqlite.prepare(source), source);
    },
    execSync(source: string) {
      sqlite.exec(source);
    },
    closeSync() {
      sqlite.close();
    },
  };
}

/**
 * `drizzle-orm/expo-sqlite/query.js` imports this from `expo-sqlite` at module
 * load time (it backs `useLiveQuery`) — nothing under test calls it, but the
 * export has to exist or requiring drizzle's expo-sqlite entrypoint throws. A
 * no-op `remove()` is enough.
 */
export function addDatabaseChangeListener(_listener: (event: { tableName: string }) => void): {
  remove(): void;
} {
  return { remove() {} };
}
