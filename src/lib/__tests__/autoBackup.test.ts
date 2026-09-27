import {
  AUTO_BACKUP_KEEP,
  autoBackupFileName,
  autoBackupsToPrune,
  BACKUP_STALE_DAYS,
  isAutoBackupDue,
  isAutoBackupFileName,
  lastBackupLabel,
  shouldNudgeBackup,
} from '../autoBackup';

describe('autoBackupFileName', () => {
  it('formats local date/time with zero padding and includes seconds', () => {
    const now = new Date(2026, 8, 27, 21, 30, 5, 0).getTime(); // 2026-09-27 21:30:05
    expect(autoBackupFileName(now)).toBe('tummytracker-auto-2026-09-27-213005.json');
  });

  it('zero-pads single-digit month/day/hour/minute/second', () => {
    const now = new Date(2026, 0, 2, 3, 4, 5, 0).getTime(); // 2026-01-02 03:04:05
    expect(autoBackupFileName(now)).toBe('tummytracker-auto-2026-01-02-030405.json');
  });
});

describe('isAutoBackupFileName', () => {
  it('matches a well-formed automatic backup name', () => {
    expect(isAutoBackupFileName('tummytracker-auto-2026-09-27-213005.json')).toBe(true);
  });

  it('rejects a duplicated/renamed variant', () => {
    expect(isAutoBackupFileName('tummytracker-auto-2026-09-27-213005 (1).json')).toBe(false);
  });

  it('rejects the manual export filename', () => {
    expect(isAutoBackupFileName('tummytracker-backup.json')).toBe(false);
  });

  it('rejects an unrelated prefix', () => {
    expect(isAutoBackupFileName('some-other-file-2026-09-27-213005.json')).toBe(false);
  });

  it('rejects a name missing the seconds field', () => {
    expect(isAutoBackupFileName('tummytracker-auto-2026-09-27-2130.json')).toBe(false);
  });
});

describe('autoBackupsToPrune', () => {
  it('returns [] when at or under the keep count', () => {
    const names = [
      'tummytracker-auto-2026-09-20-000000.json',
      'tummytracker-auto-2026-09-21-000000.json',
    ];
    expect(autoBackupsToPrune(names)).toEqual([]);
  });

  it('keeps the newest 7 and returns older ones to delete', () => {
    const names = Array.from(
      { length: 9 },
      (_, i) => `tummytracker-auto-2026-09-${String(10 + i).padStart(2, '0')}-000000.json`,
    );
    const toPrune = autoBackupsToPrune(names, AUTO_BACKUP_KEEP);
    expect(toPrune).toEqual([
      'tummytracker-auto-2026-09-10-000000.json',
      'tummytracker-auto-2026-09-11-000000.json',
    ]);
  });

  it('ignores non-matching names entirely (never counted, never pruned)', () => {
    const names = [
      'tummytracker-backup.json',
      'some-random-file.txt',
      ...Array.from(
        { length: 8 },
        (_, i) => `tummytracker-auto-2026-09-${String(10 + i).padStart(2, '0')}-000000.json`,
      ),
    ];
    const toPrune = autoBackupsToPrune(names);
    expect(toPrune).toEqual(['tummytracker-auto-2026-09-10-000000.json']);
    expect(toPrune).not.toContain('tummytracker-backup.json');
    expect(toPrune).not.toContain('some-random-file.txt');
  });

  it('honors a custom keep count', () => {
    const names = Array.from(
      { length: 5 },
      (_, i) => `tummytracker-auto-2026-09-${String(10 + i).padStart(2, '0')}-000000.json`,
    );
    expect(autoBackupsToPrune(names, 2)).toEqual([
      'tummytracker-auto-2026-09-10-000000.json',
      'tummytracker-auto-2026-09-11-000000.json',
      'tummytracker-auto-2026-09-12-000000.json',
    ]);
  });
});

describe('isAutoBackupDue', () => {
  it('is due when never backed up (null)', () => {
    expect(isAutoBackupDue(null, Date.now())).toBe(true);
  });

  it('is not due on the same local day', () => {
    const last = new Date(2026, 5, 15, 8, 0, 0, 0).getTime();
    const now = new Date(2026, 5, 15, 23, 0, 0, 0).getTime();
    expect(isAutoBackupDue(last, now)).toBe(false);
  });

  it('is due on the previous local day', () => {
    const last = new Date(2026, 5, 14, 10, 0, 0, 0).getTime();
    const now = new Date(2026, 5, 15, 10, 0, 0, 0).getTime();
    expect(isAutoBackupDue(last, now)).toBe(true);
  });

  it('is due across midnight even a few minutes later', () => {
    const last = new Date(2026, 5, 15, 23, 59, 0, 0).getTime();
    const now = new Date(2026, 5, 16, 0, 1, 0, 0).getTime();
    expect(isAutoBackupDue(last, now)).toBe(true);
  });
});

describe('lastBackupLabel', () => {
  it('reports "Never backed up" for null', () => {
    expect(lastBackupLabel(null, Date.now())).toBe('Never backed up');
  });

  it('reports "today" for a backup earlier the same local day', () => {
    const last = new Date(2026, 5, 15, 8, 0, 0, 0).getTime();
    const now = new Date(2026, 5, 15, 20, 0, 0, 0).getTime();
    expect(lastBackupLabel(last, now)).toBe('Last backup: today');
  });

  it('reports "yesterday" for a backup on the previous local day, even across an overnight gap', () => {
    const last = new Date(2026, 5, 14, 23, 50, 0, 0).getTime();
    const now = new Date(2026, 5, 15, 0, 10, 0, 0).getTime();
    expect(lastBackupLabel(last, now)).toBe('Last backup: yesterday');
  });

  it('reports "N days ago" across a DST-crossing pair (calendar-day count, not ms/86_400_000)', () => {
    // 2026-03-08 is the US spring-forward DST transition — a 23-hour local
    // day. A naive ms/86_400_000 divide would under-count by the missing
    // hour; the local-calendar-day-index approach does not.
    const last = new Date(2026, 2, 1, 0, 30, 0, 0).getTime(); // March 1
    const now = new Date(2026, 2, 15, 0, 10, 0, 0).getTime(); // March 15
    expect(lastBackupLabel(last, now)).toBe('Last backup: 14 days ago');
  });
});

describe('shouldNudgeBackup', () => {
  const now = new Date(2026, 8, 27, 12, 0, 0, 0).getTime();

  it('never nudges when the journal has no data, even if never backed up', () => {
    expect(shouldNudgeBackup(null, now, false)).toBe(false);
  });

  it('does not nudge at exactly the stale threshold (day 7)', () => {
    const last = now - BACKUP_STALE_DAYS * 24 * 60 * 60 * 1000;
    expect(shouldNudgeBackup(last, now, true)).toBe(false);
  });

  it('nudges once strictly past the stale threshold (day 8)', () => {
    const last = now - (BACKUP_STALE_DAYS + 1) * 24 * 60 * 60 * 1000;
    expect(shouldNudgeBackup(last, now, true)).toBe(true);
  });

  it('nudges when there is data and there has never been a backup', () => {
    expect(shouldNudgeBackup(null, now, true)).toBe(true);
  });
});
