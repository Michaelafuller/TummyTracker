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
  /** Whether the day check-in ("fine day / rough day", GitHub #13) is
   * enabled — off by default; the Goals check-in above is untouched. */
  dayCheckInEnabled: boolean;
  /** Local hour (0-23) the day check-in fires at. 21:00 by default so it
   * never collides with the Goals check-in's 20:00 default. */
  dayCheckInHour: number;
  /** Local minute (0-59) the day check-in fires at. */
  dayCheckInMinute: number;
  /** SAF tree URI of the user's automatic-backup folder (Android), or null = off. */
  autoBackupDirUri: string | null;
  /** Folder display name for Settings ("Documents"), captured when picked. */
  autoBackupDirName: string | null;
  /** Epoch ms of the last successful backup of ANY kind (folder write or share-sheet export). */
  lastBackupAt: number | null;
  /** Epoch ms of the last successful AUTOMATIC folder backup — drives "once per day". */
  lastAutoBackupAt: number | null;
  /** Last automatic/folder backup failure message, cleared on the next success. */
  autoBackupError: string | null;
};

const DEFAULT_PREFS: AppPrefs = {
  offlineMode: false,
  tagBackfillV1Done: false,
  checkInEnabled: false,
  checkInHour: 20,
  checkInMinute: 0,
  checkInAdoptedV1: false,
  dayCheckInEnabled: false,
  dayCheckInHour: 21,
  dayCheckInMinute: 0,
  autoBackupDirUri: null,
  autoBackupDirName: null,
  lastBackupAt: null,
  lastAutoBackupAt: null,
  autoBackupError: null,
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
