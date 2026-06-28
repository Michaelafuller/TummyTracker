import { loadPrefs, savePrefs } from '../prefs';

// expo-file-system is mocked by jest-expo preset via the in-memory mock at
// node_modules/expo-file-system/mocks/FileSystem.ts

describe('loadPrefs', () => {
  it('returns defaults when no file exists', async () => {
    const prefs = await loadPrefs();
    expect(prefs).toEqual({ offlineMode: false });
  });
});

describe('savePrefs + loadPrefs round-trip', () => {
  it('persists offlineMode: true', async () => {
    await savePrefs({ offlineMode: true });
    const prefs = await loadPrefs();
    expect(prefs.offlineMode).toBe(true);
  });

  it('persists offlineMode: false after overwriting', async () => {
    await savePrefs({ offlineMode: true });
    await savePrefs({ offlineMode: false });
    const prefs = await loadPrefs();
    expect(prefs.offlineMode).toBe(false);
  });
});
