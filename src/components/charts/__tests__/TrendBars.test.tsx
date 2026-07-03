import { render } from '@testing-library/react-native';

import type { WeekBucket } from '@/lib/chartData';
import { TrendBars } from '../TrendBars';

// RNTL v14 renders asynchronously: `render` returns a promise.
describe('TrendBars', () => {
  it('renders an accessibility label summarizing weeks with data', async () => {
    const buckets: WeekBucket[] = [
      { label: 'Jun 19', avg: 5, count: 1 },
      { label: 'Jun 26', avg: 3, count: 2 },
    ];
    const { getByLabelText } = await render(<TrendBars buckets={buckets} />);
    expect(
      getByLabelText(
        'Weekly sentiment trend: week of Jun 19, average 5 from 1 rated entry; week of Jun 26, average 3 from 2 rated entries.',
      ),
    ).toBeTruthy();
  });

  it('renders a fallback label when no bucket has data', async () => {
    const buckets: WeekBucket[] = [
      { label: 'Jun 19', avg: null, count: 0 },
      { label: 'Jun 26', avg: null, count: 0 },
    ];
    const { getByLabelText } = await render(<TrendBars buckets={buckets} />);
    expect(getByLabelText('Weekly sentiment trend: not enough rated entries yet.')).toBeTruthy();
  });

  it('renders a label per bucket', async () => {
    const buckets: WeekBucket[] = [
      { label: 'Jun 19', avg: 5, count: 1 },
      { label: 'Jun 26', avg: null, count: 0 },
    ];
    const { getByText } = await render(<TrendBars buckets={buckets} />);
    expect(getByText('Jun 19')).toBeTruthy();
    expect(getByText('Jun 26')).toBeTruthy();
  });
});
