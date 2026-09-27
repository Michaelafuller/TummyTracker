import { render } from '@testing-library/react-native';

import { KeyboardDoneToolbar } from '../keyboard-done-toolbar';

jest.mock('expo-router', () => ({ usePathname: () => '/meal/review' }));

// Default Jest env: getKeyboardController() returns null (no native module),
// exactly like a dev client that predates react-native-keyboard-controller.
describe('KeyboardDoneToolbar (fallback)', () => {
  it('renders nothing without the native keyboard module', async () => {
    const { toJSON } = await render(<KeyboardDoneToolbar />);
    expect(toJSON()).toBeNull();
  });
});
