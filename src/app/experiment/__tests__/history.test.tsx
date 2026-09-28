import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { Experiment } from '@/db/schema';
import ExperimentHistoryScreen from '../history';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

let mockExperiments: Experiment[] = [];
jest.mock('@/features/experiments/useExperiments', () => ({
  useExperiments: () => mockExperiments,
}));

const TEST_INSETS: Metrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={TEST_INSETS}>
      <ExperimentHistoryScreen />
    </SafeAreaProvider>,
  );
}

function row(overrides: Partial<Experiment> = {}): Experiment {
  return {
    id: 'exp1',
    term: 'lactose',
    startDate: '2026-09-28',
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

const VERDICT_JSON = JSON.stringify({
  kind: 'likely-trigger',
  confidence: 'medium',
  reason: 'x',
  baselineRate: 0.7,
  eliminationRate: 0,
  reintroductionRate: 0.8,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockExperiments = [];
  jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 9, 2, 12, 0, 0).getTime()); // 2026-10-02
});

afterEach(() => {
  (Date.now as jest.Mock).mockRestore?.();
});

describe('ExperimentHistoryScreen', () => {
  it('shows an empty state when there are no experiments', async () => {
    const { getByText } = await renderScreen();
    expect(getByText('No experiments yet.')).toBeTruthy();
  });

  it('lists every experiment in the order given (newest first) with term, dates and status', async () => {
    mockExperiments = [
      row({ id: 'active', term: 'lactose', startDate: '2026-09-28' }),
      row({
        id: 'done',
        term: 'gluten',
        startDate: '2026-08-01',
        status: 'completed',
        verdictJson: VERDICT_JSON,
        endedAt: 5,
      }),
      row({ id: 'quit', term: 'soy', startDate: '2026-07-01', status: 'abandoned', endedAt: 5 }),
    ];
    const { getAllByRole, getByText } = await renderScreen();

    // Newest first: rendered in the order the hook returned them.
    expect(getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual([
      'Open lactose experiment, Sep 28 – Oct 17, Avoiding · day 5 of 14',
      'Open gluten experiment, Aug 1 – 20, Likely a trigger · medium',
      'Open soy experiment, Jul 1 – 20, Ended early',
    ]);
    expect(getByText('Sep 28 – Oct 17')).toBeTruthy();
    expect(getByText('Avoiding · day 5 of 14')).toBeTruthy();
    expect(getByText('Likely a trigger · medium')).toBeTruthy();
    expect(getByText('Ended early')).toBeTruthy();
  });

  it('a completed row shows its frozen verdict, whatever the current day', async () => {
    mockExperiments = [
      row({ status: 'completed', verdictJson: VERDICT_JSON, endedAt: 5, startDate: '2026-04-01' }),
    ];
    const { getByText } = await renderScreen();
    expect(getByText('Likely a trigger · medium')).toBeTruthy();
  });

  it('tapping a row opens that experiment', async () => {
    mockExperiments = [row({ id: 'exp9', term: 'soy' })];
    const { getByLabelText } = await renderScreen();
    await fireEvent.press(getByLabelText(/^Open soy experiment/));
    expect(mockPush).toHaveBeenCalledWith('/experiment/exp9');
  });
});
