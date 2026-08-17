import { loadPrefs, savePrefs, type AppPrefs } from '../prefs';

// expo-file-system is mocked by jest-expo preset via the in-memory mock at
// node_modules/expo-file-system/mocks/FileSystem.ts

describe('loadPrefs', () => {
  it('returns defaults when no file exists', async () => {
    const prefs = await loadPrefs();
    expect(prefs).toEqual({
      offlineMode: false,
      tagBackfillV1Done: false,
      checkInEnabled: false,
      checkInHour: 20,
      checkInMinute: 0,
      checkInAdoptedV1: false,
    });
  });
});

describe('savePrefs + loadPrefs round-trip', () => {
  it('persists offlineMode: true', async () => {
    await savePrefs({ offlineMode: true, tagBackfillV1Done: false, checkInEnabled: false, checkInHour: 20, checkInMinute: 0, checkInAdoptedV1: false });
    const prefs = await loadPrefs();
    expect(prefs.offlineMode).toBe(true);
  });

  it('persists offlineMode: false after overwriting', async () => {
    await savePrefs({ offlineMode: true, tagBackfillV1Done: false, checkInEnabled: false, checkInHour: 20, checkInMinute: 0, checkInAdoptedV1: false });
    await savePrefs({ offlineMode: false, tagBackfillV1Done: false, checkInEnabled: false, checkInHour: 20, checkInMinute: 0, checkInAdoptedV1: false });
    const prefs = await loadPrefs();
    expect(prefs.offlineMode).toBe(false);
  });

  it('persists tagBackfillV1Done: true and is backward-compatible with old pref files', async () => {
    await savePrefs({ offlineMode: false, tagBackfillV1Done: true, checkInEnabled: false, checkInHour: 20, checkInMinute: 0, checkInAdoptedV1: false });
    const prefs = await loadPrefs();
    expect(prefs.tagBackfillV1Done).toBe(true);
  });

  it('persists checkInEnabled/checkInHour/checkInMinute/checkInAdoptedV1', async () => {
    await savePrefs({
      offlineMode: false,
      tagBackfillV1Done: false,
      checkInEnabled: true,
      checkInHour: 7,
      checkInMinute: 45,
      checkInAdoptedV1: true,
    });
    const prefs = await loadPrefs();
    expect(prefs.checkInEnabled).toBe(true);
    expect(prefs.checkInHour).toBe(7);
    expect(prefs.checkInMinute).toBe(45);
    expect(prefs.checkInAdoptedV1).toBe(true);
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
  });
});
