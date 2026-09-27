import { render } from '@testing-library/react-native';
import { Text as MockText } from 'react-native';

import TabsLayout from '../_layout';

jest.mock('@/components/app-tabs', () => ({
  __esModule: true,
  default: () => <MockText testID="mock-app-tabs" />,
}));

jest.mock('@/components/settings-button', () => ({
  SettingsButton: () => <MockText testID="mock-settings-button" />,
}));

describe('TabsLayout', () => {
  it('renders the tab navigator and the settings gear overlay together', async () => {
    const { getByTestId } = await render(<TabsLayout />);

    expect(getByTestId('mock-app-tabs')).toBeTruthy();
    expect(getByTestId('mock-settings-button')).toBeTruthy();
  });
});
