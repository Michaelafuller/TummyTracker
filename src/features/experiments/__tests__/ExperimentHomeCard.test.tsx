import { fireEvent, render } from '@testing-library/react-native';

import type { Experiment } from '@/db/schema';
import { ExperimentHomeCard } from '../ExperimentHomeCard';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

let mockActiveExperiment: Experiment | undefined;
jest.mock('../useExperiments', () => ({
  useActiveExperiment: () => mockActiveExperiment,
}));

function experimentRow(overrides: Partial<Experiment> = {}): Experiment {
  return {
    id: 'exp1',
    term: 'lactose',
    startDate: '2026-04-01',
    baselineDays: 14,
    eliminationDays: 14,
    challengeDays: 3,
    observationDays: 3,
    status: 'active',
    verdictJson: null,
    endedAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  mockActiveExperiment = undefined;
  jest.clearAllMocks();
});

describe('ExperimentHomeCard', () => {
  it('renders nothing when no experiment is active', async () => {
    const { toJSON } = await render(<ExperimentHomeCard now={Date.parse('2026-04-05T12:00:00')} />);
    expect(toJSON()).toBeNull();
  });

  it('shows the term (capitalized) and the elimination phase status line', async () => {
    mockActiveExperiment = experimentRow({ startDate: '2026-04-01' });
    const now = new Date(2026, 3, 5, 12, 0, 0).getTime(); // day 5 of elimination
    const { getByText } = await render(<ExperimentHomeCard now={now} />);
    expect(getByText('Lactose experiment · Avoiding · day 5 of 14')).toBeTruthy();
  });

  it('shows "Verdict ready" once the schedule is complete', async () => {
    mockActiveExperiment = experimentRow({ startDate: '2026-04-01' });
    const now = new Date(2026, 5, 1, 12, 0, 0).getTime(); // well past the 20-day schedule
    const { getByText } = await render(<ExperimentHomeCard now={now} />);
    expect(getByText('Lactose experiment · Verdict ready')).toBeTruthy();
  });

  it('tapping navigates to the experiment screen with an accessibility label naming the (lowercase) term', async () => {
    mockActiveExperiment = experimentRow({ id: 'exp1', term: 'soy', startDate: '2026-04-01' });
    const now = new Date(2026, 3, 5, 12, 0, 0).getTime();
    const { getByLabelText } = await render(<ExperimentHomeCard now={now} />);
    await fireEvent.press(getByLabelText('Open soy experiment'));
    expect(mockPush).toHaveBeenCalledWith('/experiment/exp1');
  });
});
