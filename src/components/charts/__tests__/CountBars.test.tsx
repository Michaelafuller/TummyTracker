import { render } from '@testing-library/react-native';

import type { BmWeekBucket } from '@/lib/bmTrends';
import { CountBars } from '../CountBars';

// RNTL v14 renders asynchronously: `render` returns a promise.
describe('CountBars', () => {
  it('renders an accessibility label summarizing weeks with BMs', async () => {
    const buckets: BmWeekBucket[] = [
      { label: 'Jun 19', count: 3, badCount: 1 },
      { label: 'Jun 26', count: 2, badCount: 0 },
    ];
    const { getByLabelText } = await render(<CountBars buckets={buckets} />);
    expect(
      getByLabelText(
        'Weekly BM count: week of Jun 19, 3 BMs (1 irregular); week of Jun 26, 2 BMs.',
      ),
    ).toBeTruthy();
  });

  it('renders a fallback label when no bucket has BMs', async () => {
    const buckets: BmWeekBucket[] = [
      { label: 'Jun 19', count: 0, badCount: 0 },
      { label: 'Jun 26', count: 0, badCount: 0 },
    ];
    const { getByLabelText } = await render(<CountBars buckets={buckets} />);
    expect(getByLabelText('Weekly BM count: no BMs logged yet.')).toBeTruthy();
  });

  it('renders one slot per bucket via its label', async () => {
    const buckets: BmWeekBucket[] = [
      { label: 'Jun 19', count: 1, badCount: 0 },
      { label: 'Jun 26', count: 0, badCount: 0 },
    ];
    const { getByText } = await render(<CountBars buckets={buckets} />);
    expect(getByText('Jun 19')).toBeTruthy();
    expect(getByText('Jun 26')).toBeTruthy();
  });
});
