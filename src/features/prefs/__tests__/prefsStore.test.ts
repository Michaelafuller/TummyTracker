import { loadPrefs, savePrefs } from '@/lib/prefs';
import { usePrefsStore } from '../prefsStore';

jest.mock('@/lib/prefs', () => ({
  loadPrefs: jest.fn(),
  savePrefs: jest.fn(),
}));

beforeEach(() => {
  usePrefsStore.setState({
    offlineMode: false,
    checkInEnabled: false,
    checkInHour: 20,
    checkInMinute: 0,
    checkInAdoptedV1: false,
    loaded: false,
  });
  jest.clearAllMocks();
});

describe('prefsStore.load', () => {
  it('reads from loadPrefs and marks loaded:true', async () => {
    (loadPrefs as jest.Mock).mockResolvedValue({ offlineMode: true });
    await usePrefsStore.getState().load();
    expect(usePrefsStore.getState().offlineMode).toBe(true);
    expect(usePrefsStore.getState().loaded).toBe(true);
  });

  it('marks loaded:true even when offlineMode is false', async () => {
    (loadPrefs as jest.Mock).mockResolvedValue({ offlineMode: false });
    await usePrefsStore.getState().load();
    expect(usePrefsStore.getState().loaded).toBe(true);
    expect(usePrefsStore.getState().offlineMode).toBe(false);
  });
});

describe('prefsStore.setOfflineMode', () => {
  it('updates offlineMode in store state', () => {
    (savePrefs as jest.Mock).mockResolvedValue(undefined);
    usePrefsStore.getState().setOfflineMode(true);
    expect(usePrefsStore.getState().offlineMode).toBe(true);
  });

  it('persists the new value by calling savePrefs', () => {
    (savePrefs as jest.Mock).mockResolvedValue(undefined);
    usePrefsStore.getState().setOfflineMode(true);
    expect(savePrefs).toHaveBeenCalledWith(
      expect.objectContaining({ offlineMode: true }),
    );
  });

  it('toggling false after true persists the false value', () => {
    (savePrefs as jest.Mock).mockResolvedValue(undefined);
    usePrefsStore.getState().setOfflineMode(true);
    usePrefsStore.getState().setOfflineMode(false);
    expect(usePrefsStore.getState().offlineMode).toBe(false);
    expect(savePrefs).toHaveBeenLastCalledWith(
      expect.objectContaining({ offlineMode: false }),
    );
  });
});

describe('prefsStore.setCheckIn', () => {
  it('updates checkInEnabled/checkInHour/checkInMinute and marks checkInAdoptedV1', () => {
    (savePrefs as jest.Mock).mockResolvedValue(undefined);
    usePrefsStore.getState().setCheckIn(true, 7, 30);
    expect(usePrefsStore.getState()).toMatchObject({
      checkInEnabled: true,
      checkInHour: 7,
      checkInMinute: 30,
      checkInAdoptedV1: true,
    });
  });

  it('persists the new check-in state by calling savePrefs', () => {
    (savePrefs as jest.Mock).mockResolvedValue(undefined);
    usePrefsStore.getState().setCheckIn(true, 7, 30);
    expect(savePrefs).toHaveBeenCalledWith(
      expect.objectContaining({ checkInEnabled: true, checkInHour: 7, checkInMinute: 30, checkInAdoptedV1: true }),
    );
  });

  it('disabling after enabling persists checkInEnabled: false while keeping the last time', () => {
    (savePrefs as jest.Mock).mockResolvedValue(undefined);
    usePrefsStore.getState().setCheckIn(true, 7, 30);
    usePrefsStore.getState().setCheckIn(false, 7, 30);
    expect(usePrefsStore.getState().checkInEnabled).toBe(false);
    expect(savePrefs).toHaveBeenLastCalledWith(expect.objectContaining({ checkInEnabled: false }));
  });
});
