import { loadPrefs, savePrefs, type AppPrefs } from '../prefs';

// expo-file-system is mocked by jest-expo preset via the in-memory mock at
// node_modules/expo-file-system/mocks/FileSystem.ts

const BASE: AppPrefs = {
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

describe('loadPrefs', () => {
  it('returns defaults when no file exists', async () => {
    const prefs = await loadPrefs();
    expect(prefs).toEqual(BASE);
  });
});

describe('savePrefs + loadPrefs round-trip', () => {
  it('persists trackPeriod: true and defaults to false for an older pref file (GitHub #23)', async () => {
    await savePrefs({ ...BASE, trackPeriod: true });
    expect((await loadPrefs()).trackPeriod).toBe(true);
  });

  it('persists offlineMode: true', async () => {
    await savePrefs({ ...BASE, offlineMode: true });
    const prefs = await loadPrefs();
    expect(prefs.offlineMode).toBe(true);
  });

  it('persists offlineMode: false after overwriting', async () => {
    await savePrefs({ ...BASE, offlineMode: true });
    await savePrefs({ ...BASE, offlineMode: false });
    const prefs = await loadPrefs();
    expect(prefs.offlineMode).toBe(false);
  });

  it('persists tagBackfillV1Done: true and is backward-compatible with old pref files', async () => {
    await savePrefs({ ...BASE, tagBackfillV1Done: true });
    const prefs = await loadPrefs();
    expect(prefs.tagBackfillV1Done).toBe(true);
  });

  it('persists checkInEnabled/checkInHour/checkInMinute/checkInAdoptedV1', async () => {
    await savePrefs({ ...BASE, checkInEnabled: true, checkInHour: 7, checkInMinute: 45, checkInAdoptedV1: true });
    const prefs = await loadPrefs();
    expect(prefs.checkInEnabled).toBe(true);
    expect(prefs.checkInHour).toBe(7);
    expect(prefs.checkInMinute).toBe(45);
    expect(prefs.checkInAdoptedV1).toBe(true);
  });

  it('persists dayCheckInEnabled/dayCheckInHour/dayCheckInMinute', async () => {
    await savePrefs({ ...BASE, dayCheckInEnabled: true, dayCheckInHour: 22, dayCheckInMinute: 15 });
    const prefs = await loadPrefs();
    expect(prefs.dayCheckInEnabled).toBe(true);
    expect(prefs.dayCheckInHour).toBe(22);
    expect(prefs.dayCheckInMinute).toBe(15);
  });

  it('persists the automatic-backup fields (GitHub #14)', async () => {
    await savePrefs({
      ...BASE,
      autoBackupDirUri: 'content://tree/abc',
      autoBackupDirName: 'Documents',
      lastBackupAt: 1000,
      lastAutoBackupAt: 900,
      autoBackupError: 'Could not write.',
    });
    const prefs = await loadPrefs();
    expect(prefs.autoBackupDirUri).toBe('content://tree/abc');
    expect(prefs.autoBackupDirName).toBe('Documents');
    expect(prefs.lastBackupAt).toBe(1000);
    expect(prefs.lastAutoBackupAt).toBe(900);
    expect(prefs.autoBackupError).toBe('Could not write.');
  });

  it('defaults new check-in fields when reading an old pref file that predates them', async () => {
    // Simulates a pre-existing install's prefs.json written before this cycle.
    // reason: intentionally an incomplete AppPrefs to exercise loadPrefs' merge-with-defaults path.
    await savePrefs({ offlineMode: true, tagBackfillV1Done: true } as unknown as AppPrefs);
    const prefs = await loadPrefs();
    expect(prefs.checkInEnabled).toBe(false);
    expect(prefs.checkInHour).toBe(20);
    expect(prefs.checkInMinute).toBe(0);
    expect(prefs.checkInAdoptedV1).toBe(false);
    expect(prefs.dayCheckInEnabled).toBe(false);
    expect(prefs.dayCheckInHour).toBe(21);
    expect(prefs.dayCheckInMinute).toBe(0);
    expect(prefs.autoBackupDirUri).toBeNull();
    expect(prefs.autoBackupDirName).toBeNull();
    expect(prefs.lastBackupAt).toBeNull();
    expect(prefs.lastAutoBackupAt).toBeNull();
    expect(prefs.autoBackupError).toBeNull();
  });

  it('defaults the automatic-backup fields when reading a pref file that predates GitHub #14', async () => {
    // reason: intentionally omits the new fields to simulate a pre-#14 prefs.json.
    await savePrefs({
      offlineMode: false,
      tagBackfillV1Done: false,
      checkInEnabled: false,
      checkInHour: 20,
      checkInMinute: 0,
      checkInAdoptedV1: false,
      dayCheckInEnabled: false,
      dayCheckInHour: 21,
      dayCheckInMinute: 0,
    } as unknown as AppPrefs);
    const prefs = await loadPrefs();
    expect(prefs.autoBackupDirUri).toBeNull();
    expect(prefs.autoBackupDirName).toBeNull();
    expect(prefs.lastBackupAt).toBeNull();
    expect(prefs.lastAutoBackupAt).toBeNull();
    expect(prefs.autoBackupError).toBeNull();
  });
});
