import { loadPrefs, savePrefs } from '@/lib/prefs';
import { usePrefsStore } from '../prefsStore';

jest.mock('@/lib/prefs', () => ({
  loadPrefs: jest.fn(),
  savePrefs: jest.fn(),
}));

beforeEach(() => {
  usePrefsStore.setState({ offlineMode: false, loaded: false });
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
