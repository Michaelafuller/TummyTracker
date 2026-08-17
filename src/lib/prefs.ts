import { File, Paths } from 'expo-file-system';

export type AppPrefs = {
  offlineMode: boolean;
  /** Set once the one-time historical tag re-derive backfill has run successfully. */
  tagBackfillV1Done: boolean;
  /** Whether the daily goals check-in is enabled — the persisted source of
   * truth (see checkInService.ts); no longer re-derived from the OS-scheduled
   * notification, which firing would otherwise consume. */
  checkInEnabled: boolean;
  /** Local hour (0-23) the daily check-in fires at. */
  checkInHour: number;
  /** Local minute (0-59) the daily check-in fires at. */
  checkInMinute: number;
  /** Set once the one-time check-in adoption (pre-existing OS-scheduled
   * notification -> these prefs, for installs that predate this field) has run. */
  checkInAdoptedV1: boolean;
};

const DEFAULT_PREFS: AppPrefs = {
  offlineMode: false,
  tagBackfillV1Done: false,
  checkInEnabled: false,
  checkInHour: 20,
  checkInMinute: 0,
  checkInAdoptedV1: false,
};
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
