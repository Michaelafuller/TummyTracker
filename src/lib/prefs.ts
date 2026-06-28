import { File, Paths } from 'expo-file-system';

export type AppPrefs = {
  offlineMode: boolean;
};

const DEFAULT_PREFS: AppPrefs = { offlineMode: false };
const PREFS_FILENAME = 'prefs.json';

function prefsFile(): File {
  return new File(Paths.document, PREFS_FILENAME);
}

export async function loadPrefs(): Promise<AppPrefs> {
  const file = prefsFile();
  if (!file.exists) return DEFAULT_PREFS;
  try {
    const text = await file.text();
    return { ...DEFAULT_PREFS, ...JSON.parse(text) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(prefs: AppPrefs): Promise<void> {
  prefsFile().write(JSON.stringify(prefs));
}
