import { tapFeedback } from '../haptics';

const mockImpactAsync = jest.fn().mockResolvedValue(undefined);
const mockNotificationAsync = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-haptics', () => ({
  impactAsync: (...args: unknown[]) => mockImpactAsync(...args),
  notificationAsync: (...args: unknown[]) => mockNotificationAsync(...args),
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('tapFeedback', () => {
  it('fires impactAsync with Medium style for kind "impact"', async () => {
    await tapFeedback('impact');
    expect(mockImpactAsync).toHaveBeenCalledWith('medium');
    expect(mockNotificationAsync).not.toHaveBeenCalled();
  });

  it('fires notificationAsync with Success type for kind "success"', async () => {
    await tapFeedback('success');
    expect(mockNotificationAsync).toHaveBeenCalledWith('success');
    expect(mockImpactAsync).not.toHaveBeenCalled();
  });

  it('resolves without throwing when the native call rejects', async () => {
    mockImpactAsync.mockRejectedValueOnce(new Error('no native module'));
    await expect(tapFeedback('impact')).resolves.toBeUndefined();
  });

  it('resolves without throwing when expo-haptics itself is unavailable', async () => {
    jest.resetModules();
    jest.doMock('expo-haptics', () => {
      throw new Error('module not found');
    });
    const { tapFeedback: freshTapFeedback } = await import('../haptics');
    await expect(freshTapFeedback('success')).resolves.toBeUndefined();
    jest.dontMock('expo-haptics');
  });
});
