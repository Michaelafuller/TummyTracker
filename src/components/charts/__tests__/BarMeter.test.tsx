import { render } from '@testing-library/react-native';

import { BarMeter } from '../BarMeter';

// RNTL v14 renders asynchronously: `render` returns a promise.
describe('BarMeter', () => {
  it('renders an accessibility label with the tag, rate, and base rate as percentages', async () => {
    const { getByLabelText } = await render(<BarMeter label="onion" rate={0.6} baseRate={0.3} />);
    expect(
      getByLabelText('onion: followed by a rough outcome 60% of the time, versus 30% baseline.'),
    ).toBeTruthy();
  });

  it('renders the rate and base rate percentages as text', async () => {
    const { getByText } = await render(<BarMeter label="onion" rate={0.6} baseRate={0.3} />);
    expect(getByText('60%')).toBeTruthy();
    expect(getByText('30%')).toBeTruthy();
  });
});
