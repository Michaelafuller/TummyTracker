import { render } from '@testing-library/react-native';

import { MiniHistogram } from '../MiniHistogram';

// RNTL v14 renders asynchronously: `render` returns a promise.
describe('MiniHistogram', () => {
  it('renders an accessibility label describing the distribution', async () => {
    const { getByLabelText } = await render(<MiniHistogram counts={[1, 2, 0, 0, 3]} />);
    expect(
      getByLabelText('Sentiment distribution: 1 rated 1, 2 rated 2, 0 rated 3, 0 rated 4, 3 rated 5, out of 6 total.'),
    ).toBeTruthy();
  });

  it('renders a fallback label when there is no data', async () => {
    const { getByLabelText } = await render(<MiniHistogram counts={[0, 0, 0, 0, 0]} />);
    expect(getByLabelText('Sentiment distribution: no rated entries yet.')).toBeTruthy();
  });
});
