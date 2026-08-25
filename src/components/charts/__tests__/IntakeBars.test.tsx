import { render } from '@testing-library/react-native';

import type { IntakeWeekBucket } from '@/lib/chartData';
import { IntakeBars } from '../IntakeBars';

// RNTL v14 renders asynchronously: `render` returns a promise.
describe('IntakeBars', () => {
  it('renders an accessibility label summarizing weeks with data', async () => {
    const buckets: IntakeWeekBucket[] = [
      { label: 'Jun 19', avg: 10 },
      { label: 'Jun 26', avg: 30 },
    ];
    const { getByLabelText } = await render(<IntakeBars buckets={buckets} noun="calories" unit="kcal" />);
    expect(
      getByLabelText(
        'Weekly calories intake: week of Jun 19, about 10 kcal per day; week of Jun 26, about 30 kcal per day.',
      ),
    ).toBeTruthy();
  });

  it('renders a fallback label when no bucket has data', async () => {
    const buckets: IntakeWeekBucket[] = [
      { label: 'Jun 19', avg: null },
      { label: 'Jun 26', avg: null },
    ];
    const { getByLabelText } = await render(<IntakeBars buckets={buckets} noun="fiber" unit="g" />);
    expect(getByLabelText('Weekly fiber intake: not enough nutrition data yet.')).toBeTruthy();
  });

  it('renders one slot per bucket via its label', async () => {
    const buckets: IntakeWeekBucket[] = [
      { label: 'Jun 19', avg: 1 },
      { label: 'Jun 26', avg: null },
    ];
    const { getByText } = await render(<IntakeBars buckets={buckets} noun="fiber" unit="g" />);
    expect(getByText('Jun 19')).toBeTruthy();
    expect(getByText('Jun 26')).toBeTruthy();
  });
});
