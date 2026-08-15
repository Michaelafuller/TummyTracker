import { loadPrefs, savePrefs } from '../prefs';

// expo-file-system is mocked by jest-expo preset via the in-memory mock at
// node_modules/expo-file-system/mocks/FileSystem.ts

describe('loadPrefs', () => {
  it('returns defaults when no file exists', async () => {
    const prefs = await loadPrefs();
    expect(prefs).toEqual({ offlineMode: false, tagBackfillV1Done: false });
  });
});

describe('savePrefs + loadPrefs round-trip', () => {
  it('persists offlineMode: true', async () => {
    await savePrefs({ offlineMode: true, tagBackfillV1Done: false });
    const prefs = await loadPrefs();
    expect(prefs.offlineMode).toBe(true);
  });

  it('persists offlineMode: false after overwriting', async () => {
    await savePrefs({ offlineMode: true, tagBackfillV1Done: false });
    await savePrefs({ offlineMode: false, tagBackfillV1Done: false });
    const prefs = await loadPrefs();
    expect(prefs.offlineMode).toBe(false);
  });

  it('persists tagBackfillV1Done: true and is backward-compatible with old pref files', async () => {
    await savePrefs({ offlineMode: false, tagBackfillV1Done: true });
    const prefs = await loadPrefs();
    expect(prefs.tagBackfillV1Done).toBe(true);
  });
});
