import type { ReactElement } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import {
  insertDayCheckInsPreservingIds,
  insertExperimentsPreservingIds,
  listAllDayCheckIns,
  listAllExperiments,
  listAllMedicationDoses,
  listAllMedicationEvents,
  listAllMedications,
  listLogEntries,
} from '@/db/repository';
import { disableDayCheckIn, refreshDayCheckIn } from '@/features/checkin/dayCheckInService';
import { DEFAULT_REMINDERS } from '@/features/notifications/model';
import { ensureNotificationPermission, getReminders } from '@/features/notifications/service';
import { usePrefsStore } from '@/features/prefs/prefsStore';
import SettingsScreen from '../settings';

// The gathering/export path (exportBackupViaShare/buildBackupJson) is kept
// REAL here — it runs against the expo-file-system/expo-sharing/repository
// mocks below, exactly as the pre-service handleExport used to, so the
// existing export-content tests keep exercising the real v4 JSON shape. Only
// the folder-picker actions (which need a real SAF folder to do anything
// meaningful) are replaced with jest.fn()s for the new Automatic backup tests.
const mockChooseBackupFolder = jest.fn();
const mockBackUpToFolderNow = jest.fn();
const mockTurnOffAutoBackup = jest.fn();
jest.mock('@/features/backup/backupService', () => {
  const actual = jest.requireActual('@/features/backup/backupService');
  return {
    ...actual,
    chooseBackupFolder: (...args: unknown[]) => mockChooseBackupFolder(...args),
    backUpToFolderNow: (...args: unknown[]) => mockBackUpToFolderNow(...args),
    turnOffAutoBackup: (...args: unknown[]) => mockTurnOffAutoBackup(...args),
  };
});

const mockPrintToFileAsync = jest.fn();
jest.mock('expo-print', () => ({
  printToFileAsync: (...args: unknown[]) => mockPrintToFileAsync(...args),
}));

const mockShareAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));

const mockPickFileAsync = jest.fn();
jest.mock('expo-file-system', () => {
  const actual = jest.requireActual('expo-file-system');
  return {
    ...actual,
    File: class MockFile extends actual.File {
      static pickFileAsync = (...args: unknown[]) => mockPickFileAsync(...args);
    },
  };
});

jest.mock('@/db/repository', () => ({
  listLogEntries: jest.fn(),
  listAllMealComponents: jest.fn(),
  createLogEntry: jest.fn(),
  getLogEntry: jest.fn(),
  insertMealComponents: jest.fn(),
  listAllMedications: jest.fn(),
  listAllMedicationEvents: jest.fn(),
  listAllMedicationDoses: jest.fn(),
  insertMedicationsPreservingIds: jest.fn(),
  insertMedicationEventsPreservingIds: jest.fn().mockResolvedValue({ inserted: 0, skipped: 0, insertedIds: [] }),
  insertMedicationDosesPreservingIds: jest.fn(),
  listAllDayCheckIns: jest.fn(),
  insertDayCheckInsPreservingIds: jest.fn(),
  listAllExperiments: jest.fn(),
  insertExperimentsPreservingIds: jest.fn(),
}));

jest.mock('@/features/notifications/service', () => ({
  getReminders: jest.fn(),
  enableReminder: jest.fn(),
  disableReminder: jest.fn(),
  ensureNotificationPermission: jest.fn(),
}));

jest.mock('@/features/checkin/dayCheckInService', () => ({
  disableDayCheckIn: jest.fn(),
  refreshDayCheckIn: jest.fn(),
}));

const TEST_INSETS: Metrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderScreen(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={TEST_INSETS}>{ui}</SafeAreaProvider>);
}

const originalOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = originalOS;
  usePrefsStore.setState({
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
    loaded: false,
  });
  (getReminders as jest.Mock).mockResolvedValue(DEFAULT_REMINDERS);
  (listLogEntries as jest.Mock).mockResolvedValue([]);
  (listAllMedications as jest.Mock).mockResolvedValue([]);
  (listAllMedicationEvents as jest.Mock).mockResolvedValue([]);
  (listAllMedicationDoses as jest.Mock).mockResolvedValue([]);
  (listAllDayCheckIns as jest.Mock).mockResolvedValue([]);
  (insertDayCheckInsPreservingIds as jest.Mock).mockResolvedValue({ inserted: 0, skipped: 0 });
  (listAllExperiments as jest.Mock).mockResolvedValue([]);
  (insertExperimentsPreservingIds as jest.Mock).mockResolvedValue({ inserted: 0, skipped: 0 });
  (ensureNotificationPermission as jest.Mock).mockResolvedValue(true);
});

afterEach(() => {
  Platform.OS = originalOS;
});

describe('SettingsScreen — Doctor report section', () => {
  it('renders the section with "30 days" selected by default', async () => {
    const { findByText, findByLabelText } = await renderScreen(<SettingsScreen />);
    await findByText('Doctor report');
    expect(
      await findByText('A printable summary of your logs and patterns to share with a professional.'),
    ).toBeTruthy();

    const thirty = await findByLabelText('30 days');
    const fourteen = await findByLabelText('2 weeks');
    const ninety = await findByLabelText('90 days');
    expect(thirty.props.accessibilityState.selected).toBe(true);
    expect(fourteen.props.accessibilityState.selected).toBe(false);
    expect(ninety.props.accessibilityState.selected).toBe(false);
  });

  it('selecting a different range chip updates accessibilityState.selected', async () => {
    const { findByLabelText } = await renderScreen(<SettingsScreen />);
    const ninety = await findByLabelText('90 days');
    await fireEvent.press(ninety);

    await waitFor(async () => {
      expect((await findByLabelText('90 days')).props.accessibilityState.selected).toBe(true);
    });
    expect((await findByLabelText('30 days')).props.accessibilityState.selected).toBe(false);
  });

  it('pressing "Create PDF report" builds the HTML and shares the resulting PDF', async () => {
    mockPrintToFileAsync.mockResolvedValue({ uri: 'file:///report.pdf' });
    const { findByLabelText } = await renderScreen(<SettingsScreen />);
    await fireEvent.press(await findByLabelText('Create PDF report'));

    await waitFor(() => expect(mockShareAsync).toHaveBeenCalled());
    expect(mockPrintToFileAsync).toHaveBeenCalledWith(
      expect.objectContaining({ html: expect.stringContaining('TummyTracker report') }),
    );
    expect(mockShareAsync).toHaveBeenCalledWith('file:///report.pdf', {
      mimeType: 'application/pdf',
      dialogTitle: 'Share report',
    });
  });

  it('fetches medications, events, and doses and includes them in the report HTML (#17)', async () => {
    mockPrintToFileAsync.mockResolvedValue({ uri: 'file:///report.pdf' });
    const now = Date.now();
    (listAllMedications as jest.Mock).mockResolvedValue([
      {
        id: 'med1',
        name: 'Omeprazole',
        defaultDose: 20,
        doseUnit: 'mg',
        frequency: 'once daily',
        startDate: null,
        endDate: null,
        isActive: true,
        notes: null,
        createdAt: 0,
        updatedAt: 0,
      },
    ]);
    (listAllMedicationEvents as jest.Mock).mockResolvedValue([
      { id: 'evt1', takenAt: now, timeKnown: true, notes: null, createdAt: 0, updatedAt: 0 },
    ]);
    (listAllMedicationDoses as jest.Mock).mockResolvedValue([
      { id: 'dose1', eventId: 'evt1', medicationId: 'med1', dose: 20, doseUnit: 'mg', createdAt: 0, updatedAt: 0 },
    ]);

    const { findByLabelText } = await renderScreen(<SettingsScreen />);
    await fireEvent.press(await findByLabelText('Create PDF report'));

    await waitFor(() => expect(mockShareAsync).toHaveBeenCalled());
    expect(listAllMedications).toHaveBeenCalled();
    expect(listAllMedicationEvents).toHaveBeenCalled();
    expect(listAllMedicationDoses).toHaveBeenCalled();
    expect(mockPrintToFileAsync).toHaveBeenCalledWith(
      expect.objectContaining({ html: expect.stringContaining('Medications') }),
    );
  });

  it('shows the Update-required alert when printToFileAsync rejects (old dev client)', async () => {
    mockPrintToFileAsync.mockRejectedValue(new Error('printToFileAsync is not a function'));
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { findByLabelText } = await renderScreen(<SettingsScreen />);
    await fireEvent.press(await findByLabelText('Create PDF report'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Update required',
        'Creating a PDF needs the app build that includes printing — install the next dev build, then try again.',
      ),
    );
    expect(mockShareAsync).not.toHaveBeenCalled();
    (Alert.alert as jest.Mock).mockRestore();
  });
});

describe('SettingsScreen — Data section (day check-ins, GitHub #13)', () => {
  it('export includes the day check-ins in the shared backup JSON', async () => {
    (listAllDayCheckIns as jest.Mock).mockResolvedValue([
      { id: 'ci1', date: '2026-06-15', status: 'fine', createdAt: 1, updatedAt: 1 },
    ]);

    const { findByLabelText } = await renderScreen(<SettingsScreen />);
    await fireEvent.press(await findByLabelText('Export data'));

    await waitFor(() => expect(mockShareAsync).toHaveBeenCalled());
    expect(listAllDayCheckIns).toHaveBeenCalled();

    const [uri] = mockShareAsync.mock.calls[0];
    const { File } = jest.requireActual('expo-file-system');
    const written = JSON.parse(await new File(uri).text());
    expect(written.version).toBe(5);
    expect(written.dayCheckIns).toEqual([
      { id: 'ci1', date: '2026-06-15', status: 'fine', createdAt: 1, updatedAt: 1 },
    ]);
  });

  it('import summary reports the imported day check-in count', async () => {
    const backup = {
      version: 4,
      entries: [],
      dayCheckIns: [{ id: 'ci1', date: '2026-06-10', status: 'rough', createdAt: 1, updatedAt: 1 }],
    };
    mockPickFileAsync.mockResolvedValue({
      canceled: false,
      result: { text: async () => JSON.stringify(backup) },
    });
    (insertDayCheckInsPreservingIds as jest.Mock).mockResolvedValue({ inserted: 1, skipped: 0 });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { findByLabelText } = await renderScreen(<SettingsScreen />);
    await fireEvent.press(await findByLabelText('Import data'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Import complete',
        'Imported 0 entries (0 already existed). Imported 1 day check-in (0 already existed).',
      ),
    );
    expect(insertDayCheckInsPreservingIds).toHaveBeenCalledWith(backup.dayCheckIns);
    (Alert.alert as jest.Mock).mockRestore();
  });

  it('import summary omits the day-check-in sentence when the file had none', async () => {
    const backup = { version: 1, entries: [] };
    mockPickFileAsync.mockResolvedValue({
      canceled: false,
      result: { text: async () => JSON.stringify(backup) },
    });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { findByLabelText } = await renderScreen(<SettingsScreen />);
    await fireEvent.press(await findByLabelText('Import data'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Import complete', 'Imported 0 entries (0 already existed).'),
    );
    (Alert.alert as jest.Mock).mockRestore();
  });
});

describe('SettingsScreen — Data section (elimination experiments, GitHub #19)', () => {
  it('export includes experiments in the shared backup JSON (v5)', async () => {
    (listAllExperiments as jest.Mock).mockResolvedValue([
      {
        id: 'exp1',
        term: 'lactose',
        startDate: '2026-04-01',
        baselineDays: 14,
        eliminationDays: 14,
        challengeDays: 3,
        observationDays: 3,
        status: 'active',
        verdictJson: null,
        endedAt: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    const { findByLabelText } = await renderScreen(<SettingsScreen />);
    await fireEvent.press(await findByLabelText('Export data'));

    await waitFor(() => expect(mockShareAsync).toHaveBeenCalled());
    expect(listAllExperiments).toHaveBeenCalled();

    const [uri] = mockShareAsync.mock.calls[0];
    const { File } = jest.requireActual('expo-file-system');
    const written = JSON.parse(await new File(uri).text());
    expect(written.experiments).toEqual([
      expect.objectContaining({ id: 'exp1', term: 'lactose', status: 'active' }),
    ]);
  });

  it('import summary reports the imported experiment count', async () => {
    const backup = {
      version: 5,
      entries: [],
      experiments: [
        {
          id: 'exp1',
          term: 'lactose',
          startDate: '2026-04-01',
          baselineDays: 14,
          eliminationDays: 14,
          challengeDays: 3,
          observationDays: 3,
          status: 'completed',
          verdictJson: '{"kind":"inconclusive"}',
          endedAt: 5000,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    mockPickFileAsync.mockResolvedValue({
      canceled: false,
      result: { text: async () => JSON.stringify(backup) },
    });
    (insertExperimentsPreservingIds as jest.Mock).mockResolvedValue({ inserted: 1, skipped: 0 });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { findByLabelText } = await renderScreen(<SettingsScreen />);
    await fireEvent.press(await findByLabelText('Import data'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Import complete',
        'Imported 0 entries (0 already existed). Imported 1 experiment (0 already existed).',
      ),
    );
    expect(insertExperimentsPreservingIds).toHaveBeenCalledWith(backup.experiments);
    (Alert.alert as jest.Mock).mockRestore();
  });
});

describe('SettingsScreen — Day check-in section (GitHub #13)', () => {
  it('renders the switch and time field', async () => {
    const { findByLabelText } = await renderScreen(<SettingsScreen />);
    expect(await findByLabelText('Day check-in')).toBeTruthy();
    expect(await findByLabelText('Day check-in time')).toBeTruthy();
  });

  it('turning the switch on requests permission, persists enabled, and refreshes the schedule', async () => {
    const { findByLabelText } = await renderScreen(<SettingsScreen />);
    const toggle = await findByLabelText('Day check-in');
    await fireEvent(toggle, 'valueChange', true);

    await waitFor(() => expect(refreshDayCheckIn).toHaveBeenCalledWith(21, 0));
    expect(ensureNotificationPermission).toHaveBeenCalled();
    expect(usePrefsStore.getState().dayCheckInEnabled).toBe(true);
  });

  it('shows an alert and leaves the switch off when permission is declined', async () => {
    (ensureNotificationPermission as jest.Mock).mockResolvedValue(false);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { findByLabelText } = await renderScreen(<SettingsScreen />);
    const toggle = await findByLabelText('Day check-in');
    await fireEvent(toggle, 'valueChange', true);

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Notifications are off',
        'Enable notifications for TummyTracker in your system settings to get the day check-in.',
      ),
    );
    expect(refreshDayCheckIn).not.toHaveBeenCalled();
    expect(usePrefsStore.getState().dayCheckInEnabled).toBe(false);
    (Alert.alert as jest.Mock).mockRestore();
  });

  it('turning the switch off persists disabled and cancels the schedule', async () => {
    usePrefsStore.setState({ dayCheckInEnabled: true });
    const { findByLabelText } = await renderScreen(<SettingsScreen />);
    const toggle = await findByLabelText('Day check-in');
    expect(toggle.props.value).toBe(true);

    await fireEvent(toggle, 'valueChange', false);

    expect((await findByLabelText('Day check-in')).props.value).toBe(false);
    expect(usePrefsStore.getState().dayCheckInEnabled).toBe(false);
    expect(disableDayCheckIn).toHaveBeenCalled();
  });
});

describe('SettingsScreen — last backup line (GitHub #14)', () => {
  it('shows "Never backed up" when there has been no backup', async () => {
    const { findByText } = await renderScreen(<SettingsScreen />);
    expect(await findByText('Never backed up')).toBeTruthy();
  });

  it('shows "Last backup: today" right after a lastBackupAt is recorded', async () => {
    usePrefsStore.setState({ lastBackupAt: Date.now() });
    const { findByText } = await renderScreen(<SettingsScreen />);
    expect(await findByText('Last backup: today')).toBeTruthy();
  });
});

describe('SettingsScreen — Automatic backup section (Android only, GitHub #14)', () => {
  it('is not rendered on iOS', async () => {
    Platform.OS = 'ios';
    const { queryByText } = await renderScreen(<SettingsScreen />);
    expect(queryByText('Automatic backup')).toBeNull();
  });

  it('shows "Choose backup folder" on Android when no folder is set', async () => {
    Platform.OS = 'android';
    const { findByText, findByLabelText } = await renderScreen(<SettingsScreen />);
    expect(await findByText('Automatic backup')).toBeTruthy();
    expect(await findByLabelText('Choose backup folder')).toBeTruthy();
  });

  it('shows "Saving to: <name>" and the folder-set actions once a folder is chosen', async () => {
    Platform.OS = 'android';
    usePrefsStore.setState({ autoBackupDirUri: 'content://tree/abc', autoBackupDirName: 'Documents' });
    const { findByText, findByLabelText } = await renderScreen(<SettingsScreen />);
    expect(await findByText('Saving to: Documents')).toBeTruthy();
    expect(await findByLabelText('Back up to folder now')).toBeTruthy();
    expect(await findByLabelText('Change folder')).toBeTruthy();
    expect(await findByLabelText('Turn off automatic backup')).toBeTruthy();
  });

  it('shows the friendly error line when autoBackupError is set', async () => {
    Platform.OS = 'android';
    usePrefsStore.setState({
      autoBackupDirUri: 'content://tree/abc',
      autoBackupDirName: 'Documents',
      autoBackupError: "Couldn't write to the backup folder. Choose it again in Settings.",
    });
    const { findByText } = await renderScreen(<SettingsScreen />);
    expect(
      await findByText("Couldn't write to the backup folder. Choose it again in Settings."),
    ).toBeTruthy();
  });

  it('does not show an error line when autoBackupError is null', async () => {
    Platform.OS = 'android';
    const { queryByText } = await renderScreen(<SettingsScreen />);
    expect(queryByText(/Couldn't write to the backup folder/)).toBeNull();
  });

  it('"Choose backup folder" calls chooseBackupFolder and alerts with the folder name on success', async () => {
    Platform.OS = 'android';
    mockChooseBackupFolder.mockImplementation(async () => {
      usePrefsStore.setState({ autoBackupDirUri: 'content://tree/abc', autoBackupDirName: 'Documents' });
      return 'chosen';
    });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { findByLabelText } = await renderScreen(<SettingsScreen />);
    await fireEvent.press(await findByLabelText('Choose backup folder'));

    await waitFor(() => expect(mockChooseBackupFolder).toHaveBeenCalled());
    expect(Alert.alert).toHaveBeenCalledWith('Backup saved to Documents.');
    (Alert.alert as jest.Mock).mockRestore();
  });

  it('a cancelled folder pick shows no alert and keeps the "Choose backup folder" state', async () => {
    Platform.OS = 'android';
    mockChooseBackupFolder.mockResolvedValue('cancelled');
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { findByLabelText } = await renderScreen(<SettingsScreen />);
    await fireEvent.press(await findByLabelText('Choose backup folder'));

    await waitFor(() => expect(mockChooseBackupFolder).toHaveBeenCalled());
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(usePrefsStore.getState().autoBackupDirUri).toBeNull();
    (Alert.alert as jest.Mock).mockRestore();
  });

  it('"Back up now" calls backUpToFolderNow and alerts with the folder name on success', async () => {
    Platform.OS = 'android';
    usePrefsStore.setState({ autoBackupDirUri: 'content://tree/abc', autoBackupDirName: 'Documents' });
    mockBackUpToFolderNow.mockResolvedValue({ ok: true });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { findByLabelText } = await renderScreen(<SettingsScreen />);
    await fireEvent.press(await findByLabelText('Back up to folder now'));

    await waitFor(() => expect(mockBackUpToFolderNow).toHaveBeenCalled());
    expect(Alert.alert).toHaveBeenCalledWith('Backup saved to Documents.');
    (Alert.alert as jest.Mock).mockRestore();
  });

  it('"Back up now" failure shows no success alert (the error line above carries the message)', async () => {
    Platform.OS = 'android';
    usePrefsStore.setState({ autoBackupDirUri: 'content://tree/abc', autoBackupDirName: 'Documents' });
    mockBackUpToFolderNow.mockResolvedValue({ ok: false, error: 'nope' });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { findByLabelText } = await renderScreen(<SettingsScreen />);
    await fireEvent.press(await findByLabelText('Back up to folder now'));

    await waitFor(() => expect(mockBackUpToFolderNow).toHaveBeenCalled());
    expect(Alert.alert).not.toHaveBeenCalled();
    (Alert.alert as jest.Mock).mockRestore();
  });

  it('"Turn off" calls turnOffAutoBackup and returns to the "Choose backup folder" state', async () => {
    Platform.OS = 'android';
    usePrefsStore.setState({ autoBackupDirUri: 'content://tree/abc', autoBackupDirName: 'Documents' });
    mockTurnOffAutoBackup.mockImplementation(async () => {
      usePrefsStore.setState({ autoBackupDirUri: null, autoBackupDirName: null, autoBackupError: null });
    });

    const { findByLabelText } = await renderScreen(<SettingsScreen />);
    await fireEvent.press(await findByLabelText('Turn off automatic backup'));

    await waitFor(() => expect(mockTurnOffAutoBackup).toHaveBeenCalled());
    expect(await findByLabelText('Choose backup folder')).toBeTruthy();
  });
});
