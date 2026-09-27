# HANDOFF.md — Execute session: Automatic backups + "last backup" nudge, GitHub #14

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§0 has the
> `expo-file-system` SDK 56 API note; §4 rungs, §8 conventions, §9
> guardrails). This cycle touches `src/lib/prefs.ts`,
> `src/features/prefs/prefsStore.ts`, new `src/lib/autoBackup.ts`, new
> `src/features/backup/*`, `src/db/repository.ts` (one read helper),
> `src/components/app-providers.tsx`, `src/app/(tabs)/index.tsx`,
> `src/app/settings.tsx`, and tests.
>
> **Pure JS/TS** — no new dependency, **no schema change**, no new device
> permission (Android's folder picker grants access per folder; no manifest
> permission), no network call, no native change, no EAS build. Everything
> used (`Directory.pickDirectoryAsync`, `Directory.createFile`, `list`,
> `File.write`, `File.delete`) is in the installed `expo-file-system` 56.0.8,
> which predates the current dev client (package unchanged since 2026-06-28).

**Planned 2026-09-27 (Opus plan session) — GitHub
Michaelafuller/TummyTracker#14.** Done-when (from the issue): "backups run on
a schedule to a location I choose, or Home/Settings shows 'last backup: N days
ago' with a one-tap backup." This cycle does **both**, within what's possible
without a background task runner (`expo-task-manager` is not approved):

- **Automatic backup (Android):** the user picks a folder once in Settings.
  After that, **once per local day, when the app opens or comes back to the
  foreground**, a fresh backup file is written there. The newest **7**
  automatic backups are kept; older *automatic* ones are deleted. A folder the
  user picks (e.g. Documents, or a cloud-drive folder they choose) **survives
  an uninstall** — the whole point, since a signing-mismatch reinstall wipes
  the app's own storage (CLAUDE.md §0).
- **Nudge:** Home shows "Last backup: 34 days ago" (or "Never backed up") with
  a **Back up now** button when the last backup is **more than 7 days old**
  and the journal isn't empty. Settings always shows the last-backup line.
- **iOS:** automatic-folder UI is **Android-only** this cycle (no iOS device
  to verify persisted folder access). iOS gets the nudge + the existing
  share-sheet export.

---

## 0. Invariants — read twice

- **Never touch a file we didn't write.** Pruning deletes only files whose
  name matches our exact automatic-backup pattern (§2) in the chosen folder.
  Manual exports, other apps' files and anything renamed are left alone.
- **Never overwrite — always create a new file.** Some Android storage
  providers don't truncate on rewrite (a shorter file leaves old bytes at the
  end = a corrupt backup). Each backup is `createFile` with a unique
  timestamped name; old ones are pruned *after* the new one is written.
- **A failed backup never deletes anything and never blocks the app.** The
  automatic run is fire-and-forget; on failure it records an error string for
  Settings to show, prunes nothing, and does **not** update
  `lastBackupAt`/`lastAutoBackupAt`. No Alert pops up at app open.
- **At most one backup in flight.** App-open and resume can both fire; the
  service keeps a module-level in-flight promise and a second call while one
  runs returns that same promise (don't queue a second backup). The previous
  cycle's review found exactly this class of race.
- **The backup content is the existing format** — `entriesToJson(...)` v4 with
  every table (entries, meal components, medications, events, doses, day
  check-ins). Extract the gathering code from `settings.tsx`; don't fork it.
- **Prefs file is the source of truth** for backup state. The service reads
  with `loadPrefs()`, writes with `savePrefs({ ...fresh, ...patch })`, then
  mirrors into the store with `usePrefsStore.setState(patch)` — it must not
  depend on the store having finished `load()` (app-open runs early).
- Stage files by path — never `git add -A` / `git add .`.

## 1. Prefs

`src/lib/prefs.ts` `AppPrefs` + defaults (and the store's initial state):

```ts
/** SAF tree URI of the user's automatic-backup folder (Android), or null = off. */
autoBackupDirUri: string | null;        // default null
/** Folder display name for Settings ("Documents"), captured when picked. */
autoBackupDirName: string | null;       // default null
/** Epoch ms of the last successful backup of ANY kind (folder write or share-sheet export). */
lastBackupAt: number | null;            // default null
/** Epoch ms of the last successful AUTOMATIC folder backup — drives "once per day". */
lastAutoBackupAt: number | null;        // default null
/** Last automatic/folder backup failure message, cleared on the next success. */
autoBackupError: string | null;         // default null
```

A share-sheet export counts as a backup once `Sharing.shareAsync` resolves
without throwing (we can't see what the user did in the sheet; it's the same
signal the Export button gives today).

## 2. Pure logic — `src/lib/autoBackup.ts` (main test target)

```ts
export const AUTO_BACKUP_KEEP = 7;
export const BACKUP_STALE_DAYS = 7;

/** 'tummytracker-auto-2026-09-27-213005.json' — local time, seconds included,
 *  so names sort chronologically and two backups never collide. */
export function autoBackupFileName(now: number): string
/** Exact-pattern match: /^tummytracker-auto-\d{4}-\d{2}-\d{2}-\d{6}\.json$/ */
export function isAutoBackupFileName(name: string): boolean
/** Names to delete: only matching names, newest `keep` retained (sort by name desc). */
export function autoBackupsToPrune(names: readonly string[], keep = AUTO_BACKUP_KEEP): string[]
/** True when never auto-backed-up, or the last one was on an earlier LOCAL day. */
export function isAutoBackupDue(lastAutoBackupAt: number | null, now: number): boolean
/** 'Never backed up' | 'Last backup: today' | 'Last backup: yesterday' | 'Last backup: 34 days ago'
 *  — whole local calendar days between the two dates (DST-safe, via local midnights). */
export function lastBackupLabel(lastBackupAt: number | null, now: number): string
/** Nudge rule: hasData && (never, or more than BACKUP_STALE_DAYS local days ago). */
export function shouldNudgeBackup(lastBackupAt: number | null, now: number, hasData: boolean): boolean
```

"Days ago" = difference in local calendar days (midnight to midnight via
`dayBounds`/`Date` mutation, not `ms / 86_400_000`), so 23:50 → 00:10 is
"yesterday". Stale = strictly more than 7 days (day 8 nudges, day 7 doesn't).

## 3. Service — `src/features/backup/backupService.ts`

```ts
export async function buildBackupJson(): Promise<string>        // gathers every table → entriesToJson
export async function exportBackupViaShare(): Promise<boolean>  // today's Export flow; true = shared; records lastBackupAt
export async function chooseBackupFolder(): Promise<'chosen' | 'cancelled' | 'failed'>
export async function backUpToFolderNow(): Promise<{ ok: true } | { ok: false; error: string }>
export async function runAutoBackupIfDue(): Promise<void>       // fire-and-forget; never throws
export async function turnOffAutoBackup(): Promise<void>
```

- **`chooseBackupFolder`** — `Directory.pickDirectoryAsync()` (cancel → the
  promise rejects or returns nothing; treat both as `'cancelled'` — check the
  real behavior in `node_modules/expo-file-system/build/Directory.js` and
  handle it explicitly). Store `uri` + `name`, then immediately run
  `backUpToFolderNow()` to prove write access; `'failed'` if that fails (keep
  the folder so the error shows in Settings).
- **`backUpToFolderNow`** (shared by auto, "Back up now" and choose-folder) —
  single-flight (§0). `new Directory(prefs.autoBackupDirUri)` →
  `createFile(autoBackupFileName(now), 'application/json')` →
  `file.write(await buildBackupJson())` → on success patch
  `{ lastBackupAt: now, lastAutoBackupAt: now, autoBackupError: null }`, then
  prune: `dir.list()`, keep `File` entries, `autoBackupsToPrune(names)` →
  `delete()` each (a prune failure is swallowed — the backup already
  succeeded). On any failure before success: patch
  `{ autoBackupError: <friendly message> }` — "Couldn't write to the backup
  folder. Choose it again in Settings." (keep the raw error out of the UI).
- **`runAutoBackupIfDue`** — no-op unless Android, a folder is set,
  `isAutoBackupDue(lastAutoBackupAt, now)`, and the journal has at least one
  log entry (`hasAnyLogEntry()`, below — don't write empty backups). Catches
  everything.
- **`turnOffAutoBackup`** — patch `{ autoBackupDirUri: null,
  autoBackupDirName: null, autoBackupError: null }`. Existing files stay.
- `src/db/repository.ts`: `hasAnyLogEntry(): Promise<boolean>` (`limit(1)`).
- Triggers: `MigrationGate`'s success effect → `void runAutoBackupIfDue()`;
  and an `AppState` `'change'` → `'active'` listener registered in
  `AppProviders` (after migrations succeed — put it in `MigrationGate`, with
  cleanup) → `void runAutoBackupIfDue()`.

## 4. Screens

- **Settings → Data section** (`settings.tsx`):
  - Under the section's intro text: the `lastBackupLabel(...)` line
    (`accessibilityLabel` = the same text; read `lastBackupAt` from the store
    and `now` from state set on mount — no `Date.now()` in render).
  - Export keeps its button; its handler becomes `exportBackupViaShare()`
    (same Alerts as today on failure / sharing unavailable).
  - **Android only** (`Platform.OS === 'android'`), below Export/Import, an
    "Automatic backup" block:
    - Copy: "Once a day, when you open the app, a backup is saved to a folder
      you choose. The newest 7 are kept. Pick a folder outside the app (like
      Documents or a cloud drive folder) so it survives reinstalling."
    - No folder: button **"Choose backup folder"**.
    - Folder set: "Saving to: <name>", buttons **"Back up now"**
      (`accessibilityLabel="Back up to folder now"`), **"Change folder"**,
      **"Turn off"** (`accessibilityLabel="Turn off automatic backup"`).
    - `autoBackupError` non-null → show it (theme error/danger color if the
      palette has one, else `textSecondary`).
    - Success of choose/back-up-now → a short Alert ("Backup saved to
      <name>."). Busy state disables the buttons (reuse `dataWorking`).
- **Home nudge** — new `src/features/backup/BackupNudge.tsx`, rendered in
  `(tabs)/index.tsx` **above** the day check-in card:
  - Props `{ hasData: boolean; now: number }`. Home fetches `hasAnyLogEntry()`
    in its existing `useFocusEffect` and keeps `now` in state, refreshed in
    the same places `today` is (focus + the AppState listener added last
    cycle).
  - Renders nothing unless the prefs store is `loaded` **and**
    `shouldNudgeBackup(...)` — so it never flashes on launch.
  - One compact row: the label ("Never backed up" / "Last backup: 34 days
    ago") + a button **"Back up now"** (`accessibilityLabel="Back up now"`).
    Tap → Android with a folder set: `backUpToFolderNow()` (Alert on failure
    with the friendly message); otherwise `exportBackupViaShare()`.
  - Don't reuse any existing Home label ("Log a symptom", "Scan a barcode",
    "Add an entry manually", "Mark today as …").

## 5. Tests (same change, CLAUDE.md §4)

- `src/lib/__tests__/autoBackup.test.ts` — file name format + zero padding;
  pattern rejects near-misses (`… (1).json`, manual `tummytracker-backup.json`,
  other prefixes); prune keeps newest 7, ignores non-matching names, returns
  [] under 8; due: null / same local day / previous day / across midnight;
  labels: never / today / yesterday / N days (use a DST-crossing pair); nudge:
  no data → false, day 7 false, day 8 true, never + data → true.
- `src/features/backup/__tests__/backupService.test.ts` (mock
  `expo-file-system` `Directory`/`File`, `expo-sharing`, repository, prefs,
  `react-native` `Platform`) — writes a new file with the generated name and
  the v4 JSON; prunes only matching old names beyond 7; failure records the
  error, prunes nothing, leaves `lastBackupAt`; two overlapping calls write
  once; not due / no folder / no data / iOS → no write; share export records
  `lastBackupAt` only when `shareAsync` resolves; choose-folder cancel.
- `BackupNudge` test — hidden when not loaded / not stale / no data; shows the
  label; tap routes to folder backup vs share export.
- Update, don't weaken: `settings.test.tsx` (export path still works via the
  service; Android block states; error line; iOS hides the block),
  `index.test.tsx` (mock the nudge; `hasAnyLogEntry` fetched on focus),
  `prefs`/`prefsStore` tests for the new fields, `backup.test.ts` unchanged
  and green.

## 6. Definition of done

- `npm run typecheck` && `npm run lint` clean; `npm run bundle:check` clean.
- **Targeted Jest only (owner instruction — never the full suite):** every
  test file you created or touched + `backup`, `prefs`, `prefsStore`,
  `settings`, `index`, `dayCheckInService`. `(tabs)` paths via
  `npx jest --runTestsByPath "<path>"` (plain path args silently skip them).
- No `@ts-ignore`, no lint disables, no `any` without `// reason:`, no new
  deps, no schema change, no new permission (if you think you need one, stop
  and report).
- Do NOT run Maestro, EAS, or `npx expo start` (Metro runs on 8081 — leave
  it). Do NOT edit `flows/`, `CLAUDE.md` or `docs/`.
- Commits (stage by path), suggested split:
  `feat(backup): pure auto-backup naming, pruning and staleness rules` ·
  `refactor(backup): move backup gathering + share export into a service` ·
  `feat(backup): automatic daily backup to a user-chosen folder (Android)` ·
  `feat(backup): last-backup line in Settings and a Home nudge` —
  each ending `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
  Do NOT push.
- Execute summary: files per commit, hashes, rung + bundle:check results,
  targeted Jest counts, how `pickDirectoryAsync` reports a cancel (what you
  found in the source), deviations with reasons, review/device-test pointers.

## 7. After this (review + test session)

- Opus review: §0 invariants (prune pattern, new-file-only, single-flight,
  failure path), prefs race, Android gating; re-run rungs + bundle:check.
- Update `CLAUDE.md` (§0 note), `docs/PROGRESS.md`, session handoff.
- Maestro (Opus writes it): seed one entry → Home shows "Never backed up" +
  "Back up now"; Settings shows the line + "Choose backup folder". The system
  folder picker, the daily run, pruning and survival across reinstall are a
  **manual** device check: choose a folder (e.g. Documents/TummyTracker),
  confirm a file appears, relaunch same day → no second file; change the
  device date forward a day → a new file; 8+ files → oldest auto one pruned.
