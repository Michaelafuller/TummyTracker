import { fireEvent, render } from '@testing-library/react-native';

import { startExperiment } from '@/db/repository';
import type { DayCheckIn, Experiment, LogEntry } from '@/db/schema';
import { EXPERIMENT_ACTIVE_BLOCKED_MESSAGE, EXPERIMENT_SAFETY_NOTE } from '@/features/experiments/copy';
import NewExperimentScreen from '../new';

const mockReplace = jest.fn();
let mockParams: { term?: string } = { term: 'lactose' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/db/repository', () => ({
  startExperiment: jest.fn(),
}));

let mockEntries: LogEntry[] = [];
jest.mock('@/features/logging/useEntries', () => ({
  useAllEntries: () => mockEntries,
}));

let mockCheckIns: DayCheckIn[] = [];
jest.mock('@/features/checkin/useDayCheckIns', () => ({
  useDayCheckIns: () => mockCheckIns,
}));

let mockActiveExperiment: Experiment | undefined;
jest.mock('@/features/experiments/useExperiments', () => ({
  useActiveExperiment: () => mockActiveExperiment,
}));

function foodEntry(id: string, loggedAt: number, overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id,
    type: 'meal',
    mealSlot: null,
    name: 'Meal',
    barcode: null,
    loggedAt,
    sentiment: null,
    bristolScale: null,
    symptomType: null,
    severity: null,
    notes: null,
    ingredientsText: null,
    tagsJson: null,
    servingG: null,
    calories: null,
    fatG: null,
    saturatedFatG: null,
    carbsG: null,
    proteinG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    componentCount: null,
    createdAt: loggedAt,
    updatedAt: loggedAt,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { term: 'lactose' };
  mockEntries = [];
  mockCheckIns = [];
  mockActiveExperiment = undefined;
  jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 8, 28, 12, 0, 0).getTime()); // 2026-09-28
});

afterEach(() => {
  (Date.now as jest.Mock).mockRestore?.();
});

describe('NewExperimentScreen', () => {
  it('shows "Nothing to test" when no term param is given', async () => {
    mockParams = {};
    const { getByText } = await render(<NewExperimentScreen />);
    expect(getByText('Nothing to test')).toBeTruthy();
  });

  it('shows the term heading and the default-14-day plan dates (start-screen example)', async () => {
    const { getByText } = await render(<NewExperimentScreen />);
    expect(getByText('Test lactose')).toBeTruthy();
    expect(getByText('Avoid it: Sep 28 – Oct 11')).toBeTruthy();
    expect(getByText('Eat it once a day: Oct 12 – 14')).toBeTruthy();
    expect(getByText('Keep logging: Oct 15 – 17')).toBeTruthy();
  });

  it('renders an elimination-length chip for every choice, 14 selected by default', async () => {
    const { getByLabelText } = await render(<NewExperimentScreen />);
    expect(getByLabelText('14 days').props.accessibilityState.selected).toBe(true);
    expect(getByLabelText('7 days').props.accessibilityState.selected).toBe(false);
    expect(getByLabelText('21 days')).toBeTruthy();
    expect(getByLabelText('28 days')).toBeTruthy();
  });

  it('selecting a different elimination length recomputes the plan dates', async () => {
    const { getByLabelText, getByText } = await render(<NewExperimentScreen />);
    await fireEvent.press(getByLabelText('7 days'));
    expect(getByText('Avoid it: Sep 28 – Oct 4')).toBeTruthy();
    expect(getByText('Eat it once a day: Oct 5 – 7')).toBeTruthy();
  });

  it('shows the baseline preview sentence computed from existing logs', async () => {
    // 2 covered days in the 14-day baseline before 2026-09-28, one rough (bad Bristol).
    mockEntries = [
      foodEntry('e1', new Date(2026, 8, 20, 9, 0, 0).getTime()),
      foodEntry('bm1', new Date(2026, 8, 21, 9, 0, 0).getTime(), { type: 'bowel_movement', bristolScale: 1 }),
    ];
    const { getByText } = await render(<NewExperimentScreen />);
    expect(getByText('Your last 14 days: 2 logged, 1 rough.')).toBeTruthy();
  });

  it('warns when fewer than 7 baseline days are covered, but still allows starting', async () => {
    const { getByText, getByLabelText } = await render(<NewExperimentScreen />);
    expect(getByText(/inconclusive/)).toBeTruthy();
    expect(getByLabelText('Start experiment').props.accessibilityState.disabled).toBe(false);
  });

  it('shows the verbatim safety note', async () => {
    const { getByText } = await render(<NewExperimentScreen />);
    expect(getByText(EXPERIMENT_SAFETY_NOTE)).toBeTruthy();
  });

  it('disables the button and shows the blocked message when an experiment is already active', async () => {
    mockActiveExperiment = {
      id: 'exp0',
      term: 'soy',
      startDate: '2026-09-01',
      baselineDays: 14,
      eliminationDays: 14,
      challengeDays: 3,
      observationDays: 3,
      status: 'active',
      verdictJson: null,
      endedAt: null,
      createdAt: 0,
      updatedAt: 0,
    };
    const { getByLabelText, getByText } = await render(<NewExperimentScreen />);
    expect(getByText(EXPERIMENT_ACTIVE_BLOCKED_MESSAGE)).toBeTruthy();
    expect(getByLabelText('Start experiment').props.accessibilityState.disabled).toBe(true);
  });

  it('pressing "Start experiment" calls startExperiment and replaces to the experiment screen', async () => {
    (startExperiment as jest.Mock).mockResolvedValue({ id: 'exp1', term: 'lactose' });
    const { getByLabelText } = await render(<NewExperimentScreen />);
    await fireEvent.press(getByLabelText('Start experiment'));
    expect(startExperiment).toHaveBeenCalledWith({ term: 'lactose', eliminationDays: 14 }, Date.now());
    expect(mockReplace).toHaveBeenCalledWith('/experiment/exp1');
  });
});
