// Directory/File are exercised against the REAL expo-file-system in-memory
// mock (node_modules/expo-file-system/mocks/FileSystem.ts, the same backing
// store prefs.test.ts/backup.test.ts/settings.test.tsx already rely on) —
// only the system folder picker (`Directory.pickDirectoryAsync`, a static
// method) is spied per test, since nothing else can simulate a user picking
// or cancelling a folder. Repository, prefs and Sharing are mocked per
// HANDOFF.md §5; `loadPrefs` is wired to always reflect the current
// `usePrefsStore` state, which is how the real loadPrefs/savePrefs/setState
// chain in `patchPrefs` behaves in production (savePrefs and setState are
// always called together with the same patch) — so a `chooseBackupFolder`
// or `backUpToFolderNow` call's later `loadPrefs()` sees an earlier call's
// patch within the same test, without needing a real prefs.json round trip.
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import {
  hasAnyLogEntry,
  listAllDayCheckIns,
  listAllDayFactors,
  listAllExperiments,
  listAllMealComponents,
  listAllMedicationDoses,
  listAllMedicationEvents,
  listAllMedications,
  listAllSavedMealComponents,
  listAllSavedMeals,
  listLogEntries,
} from '@/db/repository';
import { usePrefsStore } from '@/features/prefs/prefsStore';
import { loadPrefs, savePrefs, type AppPrefs } from '@/lib/prefs';
import {
  backUpToFolderNow,
  buildBackupJson,
  chooseBackupFolder,
  exportBackupViaShare,
  runAutoBackupIfDue,
  turnOffAutoBackup,
} from '../backupService';

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

jest.mock('@/db/repository', () => ({
  hasAnyLogEntry: jest.fn(),
  listAllDayCheckIns: jest.fn(),
  listAllDayFactors: jest.fn(),
  listAllExperiments: jest.fn(),
  listAllSavedMeals: jest.fn(),
  listAllSavedMealComponents: jest.fn(),
  listAllMealComponents: jest.fn(),
  listAllMedicationDoses: jest.fn(),
  listAllMedicationEvents: jest.fn(),
  listAllMedications: jest.fn(),
  listLogEntries: jest.fn(),
}));

jest.mock('@/lib/prefs', () => ({
  loadPrefs: jest.fn(),
  savePrefs: jest.fn(),
}));

const BASE_PREFS: AppPrefs = {
  offlineMode: false,
  tagBackfillV1Done: false,
  checkInEnabled: false,
  checkInHour: 20,
  checkInMinute: 0,
  checkInAdoptedV1: false,
  dayCheckInEnabled: false,
  dayCheckInHour: 21,
  dayCheckInMinute: 0,
  trackPeriod: false,
  autoBackupDirUri: null,
  autoBackupDirName: null,
  lastBackupAt: null,
  lastAutoBackupAt: null,
  autoBackupError: null,
};

let dirCounter = 0;
/** A freshly created, real (mock-backed) empty directory, unique per call so
 * tests never collide on the shared in-memory filesystem. */
function freshDirectory(): Directory {
  const dir = new Directory(Paths.cache, `auto-backup-test-${Date.now()}-${dirCounter++}`);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function isFile(entry: Directory | File): entry is File {
  return entry instanceof File;
}

const originalOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
  usePrefsStore.setState({ ...BASE_PREFS, loaded: false });
  // Mirrors production's loadPrefs/savePrefs/setState contract (see file
  // header): whatever's currently in the store is what a fresh `loadPrefs()`
  // would read back.
  (loadPrefs as jest.Mock).mockImplementation(async () => ({ ...BASE_PREFS, ...usePrefsStore.getState() }));
  (savePrefs as jest.Mock).mockResolvedValue(undefined);
  (listLogEntries as jest.Mock).mockResolvedValue([]);
  (listAllMealComponents as jest.Mock).mockResolvedValue([]);
  (listAllMedications as jest.Mock).mockResolvedValue([]);
  (listAllMedicationEvents as jest.Mock).mockResolvedValue([]);
  (listAllMedicationDoses as jest.Mock).mockResolvedValue([]);
  (listAllDayCheckIns as jest.Mock).mockResolvedValue([]);
  (listAllDayFactors as jest.Mock).mockResolvedValue([]);
  (listAllExperiments as jest.Mock).mockResolvedValue([]);
  (listAllSavedMeals as jest.Mock).mockResolvedValue([]);
  (listAllSavedMealComponents as jest.Mock).mockResolvedValue([]);
  (hasAnyLogEntry as jest.Mock).mockResolvedValue(true);
  (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
  (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
  Platform.OS = originalOS;
  jest.restoreAllMocks();
});

describe('buildBackupJson', () => {
  it('gathers every table into the existing v8 JSON shape', async () => {
    (listLogEntries as jest.Mock).mockResolvedValue([{ id: 'e1' }]);
    const json = await buildBackupJson();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(9);
    expect(parsed.entries).toEqual([{ id: 'e1' }]);
    expect(parsed).toHaveProperty('mealComponents');
    expect(parsed).toHaveProperty('medications');
    expect(parsed).toHaveProperty('dayCheckIns');
    expect(parsed).toHaveProperty('experiments');
    expect(parsed).toHaveProperty('dayFactors');
    expect(parsed).toHaveProperty('savedMeals');
    expect(parsed).toHaveProperty('savedMealComponents');
    expect(listAllSavedMeals).toHaveBeenCalled();
    expect(listAllDayFactors).toHaveBeenCalled();
    expect(listAllExperiments).toHaveBeenCalled();
  });
});

describe('exportBackupViaShare', () => {
  it('records lastBackupAt only once shareAsync resolves', async () => {
    const result = await exportBackupViaShare();
    expect(result).toBe(true);
    expect(Sharing.shareAsync).toHaveBeenCalled();
    expect(usePrefsStore.getState().lastBackupAt).not.toBeNull();
    expect(savePrefs).toHaveBeenCalledWith(expect.objectContaining({ lastBackupAt: expect.any(Number) }));
  });

  it('returns false and records nothing when sharing is unavailable', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    const result = await exportBackupViaShare();
    expect(result).toBe(false);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(usePrefsStore.getState().lastBackupAt).toBeNull();
  });

  it('propagates a shareAsync failure without recording a backup', async () => {
    (Sharing.shareAsync as jest.Mock).mockRejectedValue(new Error('boom'));
    await expect(exportBackupViaShare()).rejects.toThrow('boom');
    expect(usePrefsStore.getState().lastBackupAt).toBeNull();
  });
});

describe('backUpToFolderNow', () => {
  it('writes a new file with the generated name and the v8 JSON', async () => {
    const dir = freshDirectory();
    usePrefsStore.setState({ autoBackupDirUri: dir.uri });

    const result = await backUpToFolderNow();

    expect(result).toEqual({ ok: true });
    const files = dir.list().filter(isFile);
    expect(files).toHaveLength(1);
    expect(files[0].name).toMatch(/^tummytracker-auto-\d{4}-\d{2}-\d{2}-\d{6}\.json$/);
    const written = JSON.parse(await files[0].text());
    expect(written.version).toBe(9);
    expect(usePrefsStore.getState().lastBackupAt).not.toBeNull();
    expect(usePrefsStore.getState().lastAutoBackupAt).toBe(usePrefsStore.getState().lastBackupAt);
    expect(usePrefsStore.getState().autoBackupError).toBeNull();
  });

  it('clears a previous autoBackupError on success', async () => {
    const dir = freshDirectory();
    usePrefsStore.setState({ autoBackupDirUri: dir.uri, autoBackupError: 'stale error' });

    await backUpToFolderNow();

    expect(usePrefsStore.getState().autoBackupError).toBeNull();
  });

  it('prunes only matching old names beyond the newest 7, leaving other files alone', async () => {
    const dir = freshDirectory();
    for (let day = 1; day <= 8; day++) {
      dir.createFile(`tummytracker-auto-2020-01-${String(day).padStart(2, '0')}-000000.json`, 'application/json');
    }
    dir.createFile('tummytracker-backup.json', 'application/json');
    dir.createFile('notes.txt', 'text/plain');
    usePrefsStore.setState({ autoBackupDirUri: dir.uri });

    await backUpToFolderNow();

    const names = dir.list().filter(isFile).map((f) => f.name);
    expect(names).not.toContain('tummytracker-auto-2020-01-01-000000.json');
    expect(names).not.toContain('tummytracker-auto-2020-01-02-000000.json');
    for (let day = 3; day <= 8; day++) {
      expect(names).toContain(`tummytracker-auto-2020-01-${String(day).padStart(2, '0')}-000000.json`);
    }
    expect(names).toContain('tummytracker-backup.json');
    expect(names).toContain('notes.txt');
    const autoNames = names.filter((n) => n.startsWith('tummytracker-auto-'));
    expect(autoNames).toHaveLength(7); // 6 kept old + 1 new
  });

  it('prunes by deleting the listed File objects, not a URI rebuilt from folder + name', async () => {
    // On Android the folder is a SAF content:// tree: a child's URI can't be
    // derived by joining its name onto the folder's. Model that by listing
    // files that physically live in ANOTHER directory — only deleting the
    // listed objects themselves removes them.
    const dir = freshDirectory();
    const elsewhere = freshDirectory();
    const listed = [1, 2, 3, 4, 5, 6, 7, 8].map((day) =>
      elsewhere.createFile(`tummytracker-auto-2020-01-0${day}-000000.json`, 'application/json'),
    );
    usePrefsStore.setState({ autoBackupDirUri: dir.uri });
    jest.spyOn(Directory.prototype, 'list').mockReturnValue(listed);

    await backUpToFolderNow();

    expect(listed[0].exists).toBe(false);
    expect(listed.slice(1).every((f) => f.exists)).toBe(true);
  });

  it('creates no file when gathering the data fails', async () => {
    const dir = freshDirectory();
    usePrefsStore.setState({ autoBackupDirUri: dir.uri });
    (listLogEntries as jest.Mock).mockRejectedValueOnce(new Error('db locked'));

    const result = await backUpToFolderNow();

    expect(result.ok).toBe(false);
    expect(dir.list().filter(isFile)).toHaveLength(0);
  });

  it('removes the new file again when writing it fails, so no empty backup counts toward the 7', async () => {
    const dir = freshDirectory();
    usePrefsStore.setState({ autoBackupDirUri: dir.uri });
    jest.spyOn(File.prototype, 'write').mockImplementation(() => {
      throw new Error('disk full');
    });

    const result = await backUpToFolderNow();

    expect(result.ok).toBe(false);
    expect(dir.list().filter(isFile)).toHaveLength(0);
  });

  it('on failure, records the friendly error, prunes nothing, and leaves lastBackupAt/lastAutoBackupAt untouched', async () => {
    // Never created — Directory#createFile throws "Parent directory does not exist".
    const missingUri = `${Paths.cache.uri}never-created-${Date.now()}`;
    usePrefsStore.setState({ autoBackupDirUri: missingUri, lastBackupAt: 555, lastAutoBackupAt: 555 });

    const result = await backUpToFolderNow();

    expect(result).toEqual({
      ok: false,
      error: "Couldn't write to the backup folder. Choose it again in Settings.",
    });
    expect(usePrefsStore.getState().autoBackupError).toBe(
      "Couldn't write to the backup folder. Choose it again in Settings.",
    );
    // Unchanged — a failed backup never updates these (HANDOFF.md §0).
    expect(usePrefsStore.getState().lastBackupAt).toBe(555);
    expect(usePrefsStore.getState().lastAutoBackupAt).toBe(555);
  });

  it('fails (rather than writing) when no folder is set', async () => {
    usePrefsStore.setState({ autoBackupDirUri: null });
    const result = await backUpToFolderNow();
    expect(result.ok).toBe(false);
  });

  it('two overlapping calls write only one file (single-flight)', async () => {
    const dir = freshDirectory();
    usePrefsStore.setState({ autoBackupDirUri: dir.uri });

    // The gate promise is created up front (a Promise executor runs
    // synchronously), so `resolveEntries` is wired before either call reaches
    // `listLogEntries()` — avoiding a race against however many microtasks
    // (loadPrefs, Directory ops) run first.
    let resolveEntries!: (rows: unknown[]) => void;
    const gate = new Promise<unknown[]>((resolve) => {
      resolveEntries = resolve;
    });
    (listLogEntries as jest.Mock).mockImplementation(() => gate);

    const p1 = backUpToFolderNow();
    const p2 = backUpToFolderNow();

    resolveEntries([]);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toEqual({ ok: true });
    expect(r2).toEqual({ ok: true });
    expect(listLogEntries).toHaveBeenCalledTimes(1);
    expect(dir.list().filter(isFile)).toHaveLength(1);
  });

  it('allows a fresh backup after the in-flight one completes', async () => {
    const dir = freshDirectory();
    usePrefsStore.setState({ autoBackupDirUri: dir.uri });

    // Filenames are second-granularity (HANDOFF.md §2) — force two distinct
    // seconds so two genuinely sequential calls don't collide on the name.
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    await backUpToFolderNow();
    nowSpy.mockReturnValue(1_700_000_001_000);
    await backUpToFolderNow();
    nowSpy.mockRestore();

    expect(dir.list().filter(isFile)).toHaveLength(2);
  });
});

describe('chooseBackupFolder', () => {
  it('treats a pickDirectoryAsync rejection as a cancel, not a failure', async () => {
    jest.spyOn(Directory, 'pickDirectoryAsync').mockRejectedValueOnce(new Error('User cancelled the picker'));

    const result = await chooseBackupFolder();

    expect(result).toBe('cancelled');
    expect(usePrefsStore.getState().autoBackupDirUri).toBeNull();
    expect(savePrefs).not.toHaveBeenCalled();
  });

  it('stores the chosen folder and proves write access with an immediate backup', async () => {
    const dir = freshDirectory();
    jest.spyOn(Directory, 'pickDirectoryAsync').mockResolvedValueOnce(dir);

    const result = await chooseBackupFolder();

    expect(result).toBe('chosen');
    expect(usePrefsStore.getState().autoBackupDirUri).toBe(dir.uri);
    expect(usePrefsStore.getState().autoBackupDirName).toBe(dir.name);
    expect(usePrefsStore.getState().lastBackupAt).not.toBeNull();
    expect(dir.list().filter(isFile)).toHaveLength(1);
  });

  it('keeps the folder and reports "failed" when the immediate backup fails', async () => {
    // A Directory instance whose uri was never `.create()`d.
    const notReallyThere = new Directory(Paths.cache, `never-created-${Date.now()}`);
    jest.spyOn(Directory, 'pickDirectoryAsync').mockResolvedValueOnce(notReallyThere);

    const result = await chooseBackupFolder();

    expect(result).toBe('failed');
    expect(usePrefsStore.getState().autoBackupDirUri).toBe(notReallyThere.uri);
    expect(usePrefsStore.getState().autoBackupError).toBe(
      "Couldn't write to the backup folder. Choose it again in Settings.",
    );
  });
});

describe('runAutoBackupIfDue', () => {
  it('does nothing on iOS, even with a due folder and data', async () => {
    Platform.OS = 'ios';
    const dir = freshDirectory();
    usePrefsStore.setState({ autoBackupDirUri: dir.uri, autoBackupDirName: dir.name });

    await runAutoBackupIfDue();

    expect(listLogEntries).not.toHaveBeenCalled();
    expect(dir.list()).toHaveLength(0);
  });

  it('does nothing when no folder is set', async () => {
    usePrefsStore.setState({ autoBackupDirUri: null });
    await runAutoBackupIfDue();
    expect(listLogEntries).not.toHaveBeenCalled();
  });

  it('does nothing when already backed up today', async () => {
    const dir = freshDirectory();
    usePrefsStore.setState({ autoBackupDirUri: dir.uri, lastAutoBackupAt: Date.now() });

    await runAutoBackupIfDue();

    expect(listLogEntries).not.toHaveBeenCalled();
    expect(dir.list()).toHaveLength(0);
  });

  it('does nothing when the journal has no entries yet', async () => {
    const dir = freshDirectory();
    usePrefsStore.setState({ autoBackupDirUri: dir.uri, lastAutoBackupAt: null });
    (hasAnyLogEntry as jest.Mock).mockResolvedValue(false);

    await runAutoBackupIfDue();

    expect(listLogEntries).not.toHaveBeenCalled();
    expect(dir.list()).toHaveLength(0);
  });

  it('runs the backup when due, on Android, with a folder and data', async () => {
    const dir = freshDirectory();
    usePrefsStore.setState({ autoBackupDirUri: dir.uri, lastAutoBackupAt: null });

    await runAutoBackupIfDue();

    expect(dir.list().filter(isFile)).toHaveLength(1);
    expect(usePrefsStore.getState().lastAutoBackupAt).not.toBeNull();
  });

  it('overlapping runs back up once, even when the first finishes before the second is checked', async () => {
    const dir = freshDirectory();
    usePrefsStore.setState({ autoBackupDirUri: dir.uri, lastAutoBackupAt: null });
    let release: (value: boolean) => void = () => undefined;
    const gate = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    // App-open's run sails through; a quick resume's run is slow to check for
    // data, so it would pass the "due" check before the first recorded its backup.
    (hasAnyLogEntry as jest.Mock).mockResolvedValueOnce(true).mockReturnValueOnce(gate);
    // Count attempts, not files: a second attempt in the same clock second
    // would collide on the name and fail, hiding the double run.
    const createFile = jest.spyOn(Directory.prototype, 'createFile');

    const first = runAutoBackupIfDue();
    const second = runAutoBackupIfDue();
    await first;
    release(true);
    await second;

    expect(createFile).toHaveBeenCalledTimes(1);
    expect(dir.list().filter(isFile)).toHaveLength(1);
  });

  it('never throws, even when the write fails', async () => {
    usePrefsStore.setState({
      autoBackupDirUri: `${Paths.cache.uri}never-created-${Date.now()}`,
      lastAutoBackupAt: null,
    });

    await expect(runAutoBackupIfDue()).resolves.toBeUndefined();
  });
});

describe('turnOffAutoBackup', () => {
  it('clears the folder prefs but leaves existing backup files alone', async () => {
    const dir = freshDirectory();
    dir.createFile('tummytracker-auto-2020-01-01-000000.json', 'application/json');
    usePrefsStore.setState({ autoBackupDirUri: dir.uri, autoBackupDirName: dir.name, autoBackupError: 'x' });

    await turnOffAutoBackup();

    expect(usePrefsStore.getState().autoBackupDirUri).toBeNull();
    expect(usePrefsStore.getState().autoBackupDirName).toBeNull();
    expect(usePrefsStore.getState().autoBackupError).toBeNull();
    expect(dir.list()).toHaveLength(1);
  });
});
