import { render } from '@testing-library/react-native';

import { BristolHistogram } from '../BristolHistogram';

// RNTL v14 renders asynchronously: `render` returns a promise.
describe('BristolHistogram', () => {
  it('renders an accessibility label describing the distribution', async () => {
    const { getByLabelText } = await render(<BristolHistogram counts={[1, 0, 2, 0, 0, 0, 3]} />);
    expect(
      getByLabelText(
        'Bristol distribution: 1 at 1, 0 at 2, 2 at 3, 0 at 4, 0 at 5, 0 at 6, 3 at 7, out of 6.',
      ),
    ).toBeTruthy();
  });

  it('renders a fallback label when there is no data', async () => {
    const { getByLabelText } = await render(<BristolHistogram counts={[0, 0, 0, 0, 0, 0, 0]} />);
    expect(getByLabelText('Bristol distribution: no BMs logged yet.')).toBeTruthy();
  });

  it('renders a label for each of the 7 Bristol values', async () => {
    const { getByText } = await render(<BristolHistogram counts={[1, 0, 0, 0, 0, 0, 0]} />);
    for (const value of [1, 2, 3, 4, 5, 6, 7]) {
      expect(getByText(String(value))).toBeTruthy();
    }
  });
});
