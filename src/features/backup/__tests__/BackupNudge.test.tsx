import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';

import { usePrefsStore } from '@/features/prefs/prefsStore';
import { BackupNudge } from '../BackupNudge';
import { backUpToFolderNow, exportBackupViaShare } from '../backupService';

jest.mock('../backupService', () => ({
  backUpToFolderNow: jest.fn(),
  exportBackupViaShare: jest.fn(),
}));

const NOW = new Date(2026, 8, 27, 12, 0, 0, 0).getTime();
const originalOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = originalOS;
  usePrefsStore.setState({ loaded: true, lastBackupAt: null, autoBackupDirUri: null });
});

afterEach(() => {
  Platform.OS = originalOS;
});

describe('BackupNudge', () => {
  it('renders nothing when the prefs store has not loaded yet', async () => {
    usePrefsStore.setState({ loaded: false, lastBackupAt: null });
    const { queryByLabelText } = await render(<BackupNudge hasData now={NOW} />);
    expect(queryByLabelText('Back up now')).toBeNull();
  });

  it('renders nothing when there is no data yet, even if never backed up', async () => {
    usePrefsStore.setState({ loaded: true, lastBackupAt: null });
    const { queryByLabelText } = await render(<BackupNudge hasData={false} now={NOW} />);
    expect(queryByLabelText('Back up now')).toBeNull();
  });

  it('renders nothing when the last backup is not yet stale (7 days or fewer)', async () => {
    const sevenDaysAgo = NOW - 7 * 24 * 60 * 60 * 1000;
    usePrefsStore.setState({ loaded: true, lastBackupAt: sevenDaysAgo });
    const { queryByLabelText } = await render(<BackupNudge hasData now={NOW} />);
    expect(queryByLabelText('Back up now')).toBeNull();
  });

  it('shows "Never backed up" and a Back up now button once there is data and no backup yet', async () => {
    usePrefsStore.setState({ loaded: true, lastBackupAt: null });
    const { findByText, findByLabelText } = await render(<BackupNudge hasData now={NOW} />);
    expect(await findByText('Never backed up')).toBeTruthy();
    expect(await findByLabelText('Back up now')).toBeTruthy();
  });

  it('shows the "N days ago" label once the last backup is stale', async () => {
    const eightDaysAgo = NOW - 8 * 24 * 60 * 60 * 1000;
    usePrefsStore.setState({ loaded: true, lastBackupAt: eightDaysAgo });
    const { findByText } = await render(<BackupNudge hasData now={NOW} />);
    expect(await findByText('Last backup: 8 days ago')).toBeTruthy();
  });

  it('tapping Back up now on Android with a folder set uses the folder backup, not the share export', async () => {
    Platform.OS = 'android';
    usePrefsStore.setState({ loaded: true, lastBackupAt: null, autoBackupDirUri: 'content://tree/abc' });
    (backUpToFolderNow as jest.Mock).mockResolvedValue({ ok: true });

    const { findByLabelText } = await render(<BackupNudge hasData now={NOW} />);
    await fireEvent.press(await findByLabelText('Back up now'));

    await waitFor(() => expect(backUpToFolderNow).toHaveBeenCalled());
    expect(exportBackupViaShare).not.toHaveBeenCalled();
  });

  it('tapping Back up now without an Android folder set uses the share export', async () => {
    Platform.OS = 'android';
    usePrefsStore.setState({ loaded: true, lastBackupAt: null, autoBackupDirUri: null });
    (exportBackupViaShare as jest.Mock).mockResolvedValue(true);

    const { findByLabelText } = await render(<BackupNudge hasData now={NOW} />);
    await fireEvent.press(await findByLabelText('Back up now'));

    await waitFor(() => expect(exportBackupViaShare).toHaveBeenCalled());
    expect(backUpToFolderNow).not.toHaveBeenCalled();
  });

  it('tapping Back up now on iOS always uses the share export', async () => {
    Platform.OS = 'ios';
    usePrefsStore.setState({ loaded: true, lastBackupAt: null, autoBackupDirUri: null });
    (exportBackupViaShare as jest.Mock).mockResolvedValue(true);

    const { findByLabelText } = await render(<BackupNudge hasData now={NOW} />);
    await fireEvent.press(await findByLabelText('Back up now'));

    await waitFor(() => expect(exportBackupViaShare).toHaveBeenCalled());
    expect(backUpToFolderNow).not.toHaveBeenCalled();
  });

  it('shows a failure alert when the folder backup does not succeed', async () => {
    Platform.OS = 'android';
    usePrefsStore.setState({ loaded: true, lastBackupAt: null, autoBackupDirUri: 'content://tree/abc' });
    (backUpToFolderNow as jest.Mock).mockResolvedValue({ ok: false, error: 'nope' });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { findByLabelText } = await render(<BackupNudge hasData now={NOW} />);
    await fireEvent.press(await findByLabelText('Back up now'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Backup didn't complete", 'nope'));
    (Alert.alert as jest.Mock).mockRestore();
  });
});
