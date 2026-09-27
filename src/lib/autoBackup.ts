// Pure logic for the automatic folder backup + "last backup" nudge
// (GitHub #14). No filesystem/native imports here — kept pure so naming,
// pruning and staleness rules are trivially unit-testable (CLAUDE.md §5).

/** Newest automatic backups kept in the chosen folder; older ones are pruned. */
export const AUTO_BACKUP_KEEP = 7;

/** A backup strictly more than this many local days old triggers the Home nudge. */
export const BACKUP_STALE_DAYS = 7;

const AUTO_BACKUP_NAME_RE = /^tummytracker-auto-\d{4}-\d{2}-\d{2}-\d{6}\.json$/;

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * 'tummytracker-auto-2026-09-27-213005.json' — local time, seconds included so
 * two backups in the same minute never collide, and the zero-padded fields
 * make filenames sort chronologically as plain strings.
 */
export function autoBackupFileName(now: number): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `tummytracker-auto-${y}-${m}-${day}-${hh}${mm}${ss}.json`;
}

/** Exact-pattern match — a renamed/duplicated file (e.g. "… (1).json") or a
 * manual export ("tummytracker-backup.json") never matches, per the "never
 * touch a file we didn't write" invariant (HANDOFF.md §0). */
export function isAutoBackupFileName(name: string): boolean {
  return AUTO_BACKUP_NAME_RE.test(name);
}

/**
 * Names to delete: only names matching {@link isAutoBackupFileName}, newest
 * `keep` retained, oldest-first. Filenames sort chronologically as plain
 * strings (zero-padded date/time fields), so a descending string sort orders
 * newest-first without parsing the embedded timestamp; the oldest-beyond-`keep`
 * tail is reversed back to ascending before returning.
 */
export function autoBackupsToPrune(names: readonly string[], keep = AUTO_BACKUP_KEEP): string[] {
  const matching = names.filter(isAutoBackupFileName);
  const newestFirst = [...matching].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return newestFirst.slice(keep).reverse();
}

/**
 * Epoch-ms-independent local calendar-day index: the number of local calendar
 * days since the Unix epoch's local date. Built from `Date.UTC` on the LOCAL
 * year/month/day components (not the raw epoch ms), so a difference between
 * two of these is exactly the number of local calendar days apart regardless
 * of any DST transition (23/25-hour days) between them — unlike dividing a raw
 * ms difference by 86_400_000, which drifts across a DST boundary.
 */
function localDayIndex(epochMs: number): number {
  const d = new Date(epochMs);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
}

/** True when never auto-backed-up, or the last one was on an earlier LOCAL day. */
export function isAutoBackupDue(lastAutoBackupAt: number | null, now: number): boolean {
  if (lastAutoBackupAt == null) return true;
  return localDayIndex(lastAutoBackupAt) < localDayIndex(now);
}

/**
 * 'Never backed up' | 'Last backup: today' | 'Last backup: yesterday' |
 * 'Last backup: 34 days ago' — whole local calendar days between the two
 * dates (DST-safe, via {@link localDayIndex}, not `ms / 86_400_000`).
 */
export function lastBackupLabel(lastBackupAt: number | null, now: number): string {
  if (lastBackupAt == null) return 'Never backed up';
  const days = localDayIndex(now) - localDayIndex(lastBackupAt);
  if (days <= 0) return 'Last backup: today';
  if (days === 1) return 'Last backup: yesterday';
  return `Last backup: ${days} days ago`;
}

/**
 * Nudge rule: only when the journal has data, and only once the last backup
 * is strictly more than {@link BACKUP_STALE_DAYS} local days old (day 7 does
 * not nudge, day 8 does) — or there has never been one.
 */
export function shouldNudgeBackup(lastBackupAt: number | null, now: number, hasData: boolean): boolean {
  if (!hasData) return false;
  if (lastBackupAt == null) return true;
  return localDayIndex(now) - localDayIndex(lastBackupAt) > BACKUP_STALE_DAYS;
}
