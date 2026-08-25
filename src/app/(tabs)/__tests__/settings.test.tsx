import type { ReactElement } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { listLogEntries } from '@/db/repository';
import { DEFAULT_REMINDERS } from '@/features/notifications/model';
import { getReminders } from '@/features/notifications/service';
import { usePrefsStore } from '@/features/prefs/prefsStore';
import SettingsScreen from '../settings';

const mockPrintToFileAsync = jest.fn();
jest.mock('expo-print', () => ({
  printToFileAsync: (...args: unknown[]) => mockPrintToFileAsync(...args),
}));

const mockShareAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));

jest.mock('@/db/repository', () => ({
  listLogEntries: jest.fn(),
  listAllMealComponents: jest.fn(),
  createLogEntry: jest.fn(),
  getLogEntry: jest.fn(),
  insertMealComponents: jest.fn(),
}));

jest.mock('@/features/notifications/service', () => ({
  getReminders: jest.fn(),
  enableReminder: jest.fn(),
  disableReminder: jest.fn(),
}));

const TEST_INSETS: Metrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderScreen(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={TEST_INSETS}>{ui}</SafeAreaProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  usePrefsStore.setState({
    offlineMode: false,
    tagBackfillV1Done: false,
    checkInEnabled: false,
    checkInHour: 20,
    checkInMinute: 0,
    checkInAdoptedV1: false,
    loaded: false,
  });
  (getReminders as jest.Mock).mockResolvedValue(DEFAULT_REMINDERS);
  (listLogEntries as jest.Mock).mockResolvedValue([]);
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
