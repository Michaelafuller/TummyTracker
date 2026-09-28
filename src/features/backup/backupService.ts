// Backup service (GitHub #14): the existing share-sheet export, plus a new
// automatic daily backup to a user-chosen folder (Android). See
// docs/HANDOFF.md §0 for the invariants this file is built around: never
// touch a file we didn't write, never overwrite (always create a new file),
// a failed backup never deletes anything and never blocks the app, and at
// most one backup runs at a time.

import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import {
  hasAnyLogEntry,
  listAllDayCheckIns,
  listAllExperiments,
  listAllMealComponents,
  listAllMedicationDoses,
  listAllMedicationEvents,
  listAllMedications,
  listLogEntries,
} from '@/db/repository';
import { usePrefsStore } from '@/features/prefs/prefsStore';
import { autoBackupFileName, autoBackupsToPrune, isAutoBackupDue } from '@/lib/autoBackup';
import { entriesToJson } from '@/lib/backup';
import { loadPrefs, savePrefs, type AppPrefs } from '@/lib/prefs';

/** Shown in Settings on any folder-backup failure. The raw error (permission
 * revoked, storage-provider quirk, etc.) is deliberately kept out of the UI. */
const FOLDER_ERROR_MESSAGE = "Couldn't write to the backup folder. Choose it again in Settings.";

/** Gathers every backed-up table and serializes it in the existing v5 format
 * (src/lib/backup.ts) — the one source both the share-sheet export and the
 * folder backups use, so they can never drift apart. */
export async function buildBackupJson(): Promise<string> {
  const entries = await listLogEntries();
  const mealComponents = await listAllMealComponents();
  const medications = await listAllMedications();
  const medicationEvents = await listAllMedicationEvents();
  const medicationDoses = await listAllMedicationDoses();
  const dayCheckIns = await listAllDayCheckIns();
  const experiments = await listAllExperiments();
  return entriesToJson(
    entries,
    mealComponents,
    medications,
    medicationEvents,
    medicationDoses,
    dayCheckIns,
    experiments,
  );
}

/**
 * Prefs is the source of truth (HANDOFF.md §0): read the current file fresh,
 * apply the patch, write it back, then mirror the same patch into the store.
 * Deliberately does not depend on the store having finished `load()` —
 * app-open runs (`runAutoBackupIfDue`) can race the store's own hydration.
 */
async function patchPrefs(patch: Partial<AppPrefs>): Promise<void> {
  const fresh = await loadPrefs();
  await savePrefs({ ...fresh, ...patch });
  usePrefsStore.setState(patch);
}

/**
 * Today's Export flow (share sheet). Resolves `true` only once
 * `Sharing.shareAsync` resolves without throwing — we can't see what the user
 * did in the sheet, so that's the same signal the Export button has always
 * used — and records `lastBackupAt` on that signal. Resolves `false` when
 * sharing isn't available on this device (caller shows its own alert); any
 * other failure (gathering the data, writing the cache file, sharing itself)
 * propagates to the caller.
 */
export async function exportBackupViaShare(): Promise<boolean> {
  const json = await buildBackupJson();
  const file = new File(Paths.cache, 'tummytracker-backup.json');
  file.write(json);
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) return false;
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save backup' });
  await patchPrefs({ lastBackupAt: Date.now() });
  return true;
}

/**
 * In-flight guard for {@link backUpToFolderNow} (HANDOFF.md §0 — "at most one
 * backup in flight"). App-open and a foreground resume can both fire; a
 * second call while one is already running returns that SAME promise rather
 * than starting a second write.
 */
let backupInFlight: Promise<{ ok: true } | { ok: false; error: string }> | null = null;

async function performFolderBackup(): Promise<{ ok: true } | { ok: false; error: string }> {
  const prefs = await loadPrefs();
  if (!prefs.autoBackupDirUri) {
    return { ok: false, error: FOLDER_ERROR_MESSAGE };
  }

  try {
    const dir = new Directory(prefs.autoBackupDirUri);
    const now = Date.now();
    // Gather first: a failure here must not leave an empty, validly-named
    // file behind — it would count toward the newest 7 and push out a real one.
    const json = await buildBackupJson();
    // Always create a new file (never overwrite, HANDOFF.md §0) — some
    // Android storage providers don't truncate on rewrite, which would leave
    // stale bytes at the end of a shorter file.
    const file = dir.createFile(autoBackupFileName(now), 'application/json');
    try {
      file.write(json);
    } catch (e) {
      try {
        file.delete(); // Don't leave a truncated backup behind.
      } catch {
        // Best-effort; the outer catch still reports the failure.
      }
      throw e;
    }

    // The write succeeded — record it before pruning, so a prune failure
    // below can never make a successful backup look like it didn't happen.
    await patchPrefs({ lastBackupAt: now, lastAutoBackupAt: now, autoBackupError: null });

    try {
      // Delete the File objects the listing returns: on Android a picked
      // folder is a SAF content:// tree, whose children's URIs can't be built
      // by joining a name onto the folder URI (`new File(dir, name)` would
      // point nowhere and every delete would silently fail).
      const files = new Map<string, File>();
      for (const entry of dir.list()) {
        if (entry instanceof File) files.set(entry.name, entry);
      }
      for (const name of autoBackupsToPrune([...files.keys()])) {
        try {
          files.get(name)?.delete();
        } catch {
          // A single stale file failing to delete never blocks the rest —
          // the backup already succeeded (HANDOFF.md §0).
        }
      }
    } catch {
      // Listing the folder failed — prune nothing. The backup already
      // succeeded, so this is not reported as an error either.
    }

    return { ok: true };
  } catch {
    // Never partially succeed: on any failure before the new file was
    // written, prune nothing and leave lastBackupAt/lastAutoBackupAt
    // untouched — only autoBackupError is patched.
    await patchPrefs({ autoBackupError: FOLDER_ERROR_MESSAGE });
    return { ok: false, error: FOLDER_ERROR_MESSAGE };
  }
}

/**
 * Writes one backup to the chosen folder right now. Shared by the automatic
 * daily run, the Settings "Back up now" button, and `chooseBackupFolder`
 * (which calls this immediately after picking, to prove write access).
 * Single-flight per {@link backupInFlight}.
 */
export async function backUpToFolderNow(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (backupInFlight) return backupInFlight;
  const run = performFolderBackup();
  backupInFlight = run;
  try {
    return await run;
  } finally {
    backupInFlight = null;
  }
}

/**
 * Opens the system folder picker, stores the chosen folder, then immediately
 * backs up to it to prove write access. The folder is kept even when that
 * first backup fails ('failed') so the error shows in Settings and the user
 * can retry with "Back up now" rather than re-picking.
 */
export async function chooseBackupFolder(): Promise<'chosen' | 'cancelled' | 'failed'> {
  let directory: Directory;
  try {
    // Android rejects this promise on cancel (throws a PickerCancelledException
    // natively — node_modules/expo-file-system/android/.../FileSystemModule.kt
    // FilePickerContract.kt: RESULT_CANCELED -> FilePickerContractResult.Cancelled
    // -> the module throws). Any rejection here is therefore treated as a
    // cancel, not a failure.
    directory = await Directory.pickDirectoryAsync();
  } catch {
    return 'cancelled';
  }

  await patchPrefs({
    autoBackupDirUri: directory.uri,
    autoBackupDirName: directory.name,
    autoBackupError: null,
  });

  const result = await backUpToFolderNow();
  return result.ok ? 'chosen' : 'failed';
}

/** In-flight guard for {@link runAutoBackupIfDue}. */
let autoRunInFlight: Promise<void> | null = null;

/**
 * Fire-and-forget hook for app-open/foreground-resume. No-op unless: running
 * on Android, a folder is set, a day has passed since the last automatic
 * backup ({@link isAutoBackupDue}), and the journal has at least one entry
 * (never write an empty backup). Catches everything — a failed automatic run
 * must never throw into its caller or block the app (HANDOFF.md §0).
 */
export function runAutoBackupIfDue(): Promise<void> {
  // Single-flight over the WHOLE check-then-write, not just the write:
  // app-open and a quick resume could otherwise both pass the "due" check
  // before either records its backup, writing two files in one day.
  autoRunInFlight ??= checkAndRunAutoBackup().finally(() => {
    autoRunInFlight = null;
  });
  return autoRunInFlight;
}

async function checkAndRunAutoBackup(): Promise<void> {
  try {
    if (Platform.OS !== 'android') return;
    const prefs = await loadPrefs();
    if (!prefs.autoBackupDirUri) return;
    if (!isAutoBackupDue(prefs.lastAutoBackupAt, Date.now())) return;
    if (!(await hasAnyLogEntry())) return;
    await backUpToFolderNow();
  } catch {
    // Never throws — see doc comment above.
  }
}

/** Turns off the automatic folder backup. Existing backup files in the
 * folder are left alone — only the pref pointing at it is cleared. */
export async function turnOffAutoBackup(): Promise<void> {
  await patchPrefs({ autoBackupDirUri: null, autoBackupDirName: null, autoBackupError: null });
}
