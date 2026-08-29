import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { RootErrorBoundary } from '../root-error-boundary';

/** Throws in render when `shouldThrow` is true; otherwise renders normal content. */
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('kaboom');
  }
  return <Text>Safe content</Text>;
}

function Wrapper({ shouldThrow }: { shouldThrow: boolean }) {
  return (
    <RootErrorBoundary>
      <Bomb shouldThrow={shouldThrow} />
    </RootErrorBoundary>
  );
}

describe('RootErrorBoundary', () => {
  it('renders children when nothing throws', async () => {
    const { getByText } = await render(<Wrapper shouldThrow={false} />);

    expect(getByText('Safe content')).toBeTruthy();
  });

  it('shows the themed fallback when a child throws', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { getByText, getByLabelText } = await render(<Wrapper shouldThrow={true} />);

    expect(getByText('Something went wrong')).toBeTruthy();
    expect(getByText('kaboom')).toBeTruthy();
    expect(getByLabelText('Try again')).toBeTruthy();

    consoleError.mockRestore();
  });

  it('recovers once "Try again" is pressed after the underlying condition is fixed', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { getByText, getByLabelText, queryByText, rerender } = await render(<Wrapper shouldThrow={true} />);

    expect(getByText('Something went wrong')).toBeTruthy();

    // The bomb prop flips to non-throwing (e.g. a real fix upstream), but the
    // boundary still shows its cached fallback until it's explicitly reset.
    await rerender(<Wrapper shouldThrow={false} />);
    expect(getByText('Something went wrong')).toBeTruthy();

    await fireEvent.press(getByLabelText('Try again'));

    expect(getByText('Safe content')).toBeTruthy();
    expect(queryByText('Something went wrong')).toBeNull();

    consoleError.mockRestore();
  });
});
