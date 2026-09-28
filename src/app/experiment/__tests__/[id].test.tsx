import { fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { abandonExperiment, finishExperiment } from '@/db/repository';
import type { DayCheckIn, Experiment, LogEntry } from '@/db/schema';
import { VERDICT_DISCLAIMER } from '@/features/experiments/copy';
import { experimentSchedule } from '@/features/experiments/engine';
import ExperimentScreen from '../[id]';

const mockBack = jest.fn();
let mockParams: { id?: string } = { id: 'exp1' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/db/repository', () => ({
  abandonExperiment: jest.fn().mockResolvedValue(undefined),
  finishExperiment: jest.fn().mockResolvedValue(undefined),
}));

let mockEntries: LogEntry[] = [];
jest.mock('@/features/logging/useEntries', () => ({
  useAllEntries: () => mockEntries,
}));

let mockCheckIns: DayCheckIn[] = [];
jest.mock('@/features/checkin/useDayCheckIns', () => ({
  useDayCheckIns: () => mockCheckIns,
}));

let mockExperiment: Experiment | undefined;
jest.mock('@/features/experiments/useExperiments', () => ({
  useExperiment: () => mockExperiment,
}));

function baseExperiment(overrides: Partial<Experiment> = {}): Experiment {
  return {
    id: 'exp1',
    term: 'lactose',
    startDate: '2026-04-01',
    baselineDays: 14,
    eliminationDays: 7,
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

function dateKeyToMs(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
}

let idCounter = 0;
function foodEntry(day: string, overrides: Partial<LogEntry> = {}): LogEntry {
  idCounter++;
  return {
    id: `food-${idCounter}`,
    type: 'meal',
    mealSlot: null,
    name: 'Meal',
    barcode: null,
    loggedAt: dateKeyToMs(day),
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
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function bmEntry(day: string, overrides: Partial<LogEntry> = {}): LogEntry {
  idCounter++;
  return { ...foodEntry(day), id: `bm-${idCounter}`, type: 'bowel_movement', bristolScale: 1, ...overrides };
}

function daysEntries(
  days: readonly string[],
  { rough = new Set<string>(), exposed = new Set<string>() }: { rough?: Set<string>; exposed?: Set<string> } = {},
): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const day of days) {
    entries.push(foodEntry(day, exposed.has(day) ? { tagsJson: JSON.stringify(['lactose']) } : {}));
    if (rough.has(day)) entries.push(bmEntry(day));
  }
  return entries;
}

function daysSet(days: readonly string[], count: number): Set<string> {
  return new Set(days.slice(0, count));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: 'exp1' };
  mockEntries = [];
  mockCheckIns = [];
  mockExperiment = undefined;
});

afterEach(() => {
  (Date.now as jest.Mock).mockRestore?.();
  (Alert.alert as jest.Mock).mockRestore?.();
});

describe('ExperimentScreen — phase copy', () => {
  it('shows the elimination phase status line and instruction, naming the term', async () => {
    const exp = baseExperiment({ startDate: '2026-04-01' });
    mockExperiment = exp;
    jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 3, 5, 12, 0, 0).getTime()); // day 5 of 7

    const { getByText } = await render(<ExperimentScreen />);
    expect(getByText('Avoiding · day 5 of 7')).toBeTruthy();
    expect(getByText(/Avoid lactose today/)).toBeTruthy();
  });

  it('shows the challenge phase status line and a "Not logged yet" indicator with no exposure today', async () => {
    const exp = baseExperiment({ startDate: '2026-04-01' });
    mockExperiment = exp;
    const schedule = experimentSchedule(exp);
    jest.spyOn(Date, 'now').mockReturnValue(dateKeyToMs(schedule.challenge[1])); // challenge day 2

    const { getByText } = await render(<ExperimentScreen />);
    expect(getByText('Eat it once today · challenge day 2 of 3')).toBeTruthy();
    expect(getByText('Not logged yet')).toBeTruthy();
  });

  it('shows "Logged today ✓" once exposure is logged on a challenge day', async () => {
    const exp = baseExperiment({ startDate: '2026-04-01' });
    mockExperiment = exp;
    const schedule = experimentSchedule(exp);
    const today = schedule.challenge[1];
    jest.spyOn(Date, 'now').mockReturnValue(dateKeyToMs(today));
    mockEntries = [foodEntry(today, { tagsJson: JSON.stringify(['lactose']) })];

    const { getByText } = await render(<ExperimentScreen />);
    expect(getByText('Logged today ✓')).toBeTruthy();
  });

  it('shows the observation phase status line', async () => {
    const exp = baseExperiment({ startDate: '2026-04-01' });
    mockExperiment = exp;
    const schedule = experimentSchedule(exp);
    jest.spyOn(Date, 'now').mockReturnValue(dateKeyToMs(schedule.observation[0])); // observation day 1

    const { getByText } = await render(<ExperimentScreen />);
    expect(getByText('Keep logging · day 1 of 3')).toBeTruthy();
  });

  it('shows a slip sentence when the elimination phase had a slip', async () => {
    const exp = baseExperiment({ startDate: '2026-04-01' });
    mockExperiment = exp;
    const schedule = experimentSchedule(exp);
    jest.spyOn(Date, 'now').mockReturnValue(dateKeyToMs(schedule.elimination[6]));
    mockEntries = daysEntries(schedule.elimination.slice(0, 3), { exposed: new Set([schedule.elimination[1]]) });

    const { getByText } = await render(<ExperimentScreen />);
    expect(getByText('1 slip — the day after is left out too.')).toBeTruthy();
  });
});

describe('ExperimentScreen — End experiment', () => {
  it('confirming the alert abandons the experiment and navigates back', async () => {
    mockExperiment = baseExperiment({ startDate: '2026-04-01' });
    jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 3, 5, 12, 0, 0).getTime());
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const destructive = buttons?.find((b) => b.style === 'destructive');
      destructive?.onPress?.();
    });

    const { getByLabelText } = await render(<ExperimentScreen />);
    await fireEvent.press(getByLabelText('End experiment'));

    expect(abandonExperiment).toHaveBeenCalledWith('exp1', Date.now());
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('ExperimentScreen — ready phase and finish', () => {
  it('shows the verdict card and finishing writes the verdict via finishExperiment', async () => {
    const exp = baseExperiment({ startDate: '2026-04-01' });
    mockExperiment = exp;
    const schedule = experimentSchedule(exp);
    // The day after the last observation day — phase 'ready'.
    const readyToday = new Date(2026, 3, 21, 12, 0, 0).getTime();

    mockEntries = [
      // 10/14 rough, and lactose eaten throughout (it has to be in the diet
      // before the experiment for avoiding it to mean anything — rule 3b).
      ...daysEntries(schedule.baseline, { rough: daysSet(schedule.baseline, 10), exposed: new Set(schedule.baseline) }),
      ...daysEntries(schedule.elimination), // 0 rough
      ...daysEntries(schedule.challenge, { exposed: new Set(schedule.challenge), rough: daysSet(schedule.challenge, 2) }),
      ...daysEntries(schedule.observation, { rough: new Set(schedule.observation) }),
    ];
    jest.spyOn(Date, 'now').mockReturnValue(readyToday);

    const { getByText, getByLabelText } = await render(<ExperimentScreen />);
    expect(getByText('Likely a trigger')).toBeTruthy();
    expect(getByText(VERDICT_DISCLAIMER)).toBeTruthy();

    await fireEvent.press(getByLabelText('Finish experiment'));
    expect(finishExperiment).toHaveBeenCalledWith(
      'exp1',
      expect.objectContaining({ kind: 'likely-trigger' }),
      Date.now(),
    );
  });
});

describe('ExperimentScreen — completed (frozen verdict)', () => {
  it('shows the frozen verdict from verdictJson, unaffected by the current entries', async () => {
    mockExperiment = baseExperiment({
      status: 'completed',
      endedAt: new Date(2026, 4, 1).getTime(),
      verdictJson: JSON.stringify({
        kind: 'likely-not-trigger',
        confidence: 'medium',
        reason: "Rough days didn't meaningfully change while avoiding or reintroducing it.",
        baselineRate: 0.2,
        eliminationRate: 0.18,
        reintroductionRate: 0.2,
      }),
    });
    // Entries that, if read live, would suggest something completely different —
    // proving the screen reads the frozen verdict, not a fresh evaluation.
    mockEntries = [bmEntry('2026-04-01'), bmEntry('2026-04-02'), bmEntry('2026-04-03')];
    jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 5, 1).getTime());

    const { getByText } = await render(<ExperimentScreen />);
    expect(getByText('Likely not a trigger')).toBeTruthy();
    expect(getByText('Rough days: before 20% · while avoiding 18% · after reintroducing 20%')).toBeTruthy();
  });
});

describe('ExperimentScreen — abandoned', () => {
  it('shows when it ended early', async () => {
    mockExperiment = baseExperiment({ status: 'abandoned', endedAt: new Date(2026, 3, 10, 12, 0, 0).getTime() });
    jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 3, 15).getTime());

    const { getByText } = await render(<ExperimentScreen />);
    expect(getByText('Ended early on April 10, 2026.')).toBeTruthy();
  });
});
