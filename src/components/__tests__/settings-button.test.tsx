import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { SettingsButton } from '../settings-button';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const TEST_INSETS: Metrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

beforeEach(() => {
  mockPush.mockClear();
});

describe('SettingsButton', () => {
  it('renders as an accessible button labeled "Settings"', async () => {
    const { getByLabelText, getByTestId } = await render(
      <SafeAreaProvider initialMetrics={TEST_INSETS}>
        <SettingsButton />
      </SafeAreaProvider>,
    );
    const button = getByLabelText('Settings');
    expect(button).toBeTruthy();
    expect(getByTestId('open-settings')).toBe(button);
  });

  it('pushes /settings when pressed', async () => {
    const { getByLabelText } = await render(
      <SafeAreaProvider initialMetrics={TEST_INSETS}>
        <SettingsButton />
      </SafeAreaProvider>,
    );

    await fireEvent.press(getByLabelText('Settings'));

    expect(mockPush).toHaveBeenCalledWith('/settings');
  });
});
