import type { ReactNode } from 'react';
import { useEffect as mockUseEffect } from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import type { LogEntry, Medication, MedicationDose, MedicationEvent } from '@/db/schema';
import { getLogEntry } from '@/db/repository';
import { useAllEntries } from '@/features/logging/useEntries';
import { useMedicationDoses, useMedicationEvents, useMedications } from '@/features/medications/useMedicationData';
import OutcomeScreen from '../[id]';

const capturedLinkProps: { href: unknown }[] = [];
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'outcome1' }),
  // No NavigationContainer in these tests — approximate useFocusEffect as
  // "run once on mount" (mirrors entry/[id].test.tsx).
  useFocusEffect: (effect: () => void | (() => void)) => mockUseEffect(effect, []),
  Stack: { Screen: () => null },
  Link: (props: { href: unknown; children: ReactNode }) => {
    capturedLinkProps.push(props);
    return props.children;
  },
}));

jest.mock('@/db/repository', () => ({
  getLogEntry: jest.fn(),
}));

jest.mock('@/features/logging/useEntries', () => ({
  useAllEntries: jest.fn(),
}));

jest.mock('@/features/medications/useMedicationData', () => ({
  useMedications: jest.fn(),
  useMedicationEvents: jest.fn(),
  useMedicationDoses: jest.fn(),
}));

let seq = 0;
function makeEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: `e${seq++}`,
    type: 'meal',
    mealSlot: null,
    name: 'Food',
    barcode: null,
    loggedAt: 0,
    sentiment: null,
    bristolScale: null,
    symptomType: null,
    severity: null,
    notes: null,
    calories: null,
    fatG: null,
    saturatedFatG: null,
    carbsG: null,
    proteinG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    servingG: null,
    ingredientsText: null,
    tagsJson: null,
    componentCount: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const HOUR = 60 * 60 * 1000;

const MED: Medication = {
  id: 'med1',
  name: 'Omeprazole',
  defaultDose: 20,
  doseUnit: 'mg',
  frequency: null,
  startDate: null,
  endDate: null,
  isActive: true,
  notes: null,
  createdAt: 0,
  updatedAt: 0,
};

function makeMedEvent(overrides: Partial<MedicationEvent>): MedicationEvent {
  return {
    id: `evt${seq++}`,
    takenAt: 0,
    timeKnown: true,
    notes: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeMedDose(eventId: string): MedicationDose {
  return {
    id: `dose${seq++}`,
    eventId,
    medicationId: MED.id,
    dose: 20,
    doseUnit: 'mg',
    createdAt: 0,
    updatedAt: 0,
  };
}

function setEntries(entries: LogEntry[]) {
  (useAllEntries as jest.Mock).mockReturnValue(entries);
}

function setMedications(events: MedicationEvent[], doses: MedicationDose[], meds: Medication[] = [MED]) {
  (useMedications as jest.Mock).mockReturnValue(meds);
  (useMedicationEvents as jest.Mock).mockReturnValue(events);
  (useMedicationDoses as jest.Mock).mockReturnValue(doses);
}

beforeEach(() => {
  jest.clearAllMocks();
  capturedLinkProps.length = 0;
  seq = 0;
  setEntries([]);
  setMedications([], []);
});

describe('OutcomeScreen — invalid states', () => {
  it('shows "Nothing to show" for a non-outcome (food) entry', async () => {
    const food = makeEntry({ id: 'outcome1', type: 'meal', name: 'Lunch' });
    (getLogEntry as jest.Mock).mockResolvedValue(food);

    const { findByText } = await render(<OutcomeScreen />);

    expect(await findByText('Nothing to show')).toBeTruthy();
  });

  it('shows "Nothing to show" when the entry is missing', async () => {
    (getLogEntry as jest.Mock).mockResolvedValue(undefined);

    const { findByText } = await render(<OutcomeScreen />);

    expect(await findByText('Nothing to show')).toBeTruthy();
  });
});

describe('OutcomeScreen — timeline', () => {
  const outcome = makeEntry({ id: 'outcome1', type: 'symptom', name: 'Symptom', severity: 4, loggedAt: 100 * HOUR });

  it('renders the outcome row and its long date', async () => {
    (getLogEntry as jest.Mock).mockResolvedValue(outcome);
    setEntries([outcome]);

    const { findByText, findByTestId } = await render(<OutcomeScreen />);

    expect(await findByTestId('entry-row-symptom')).toBeTruthy();
    expect(await findByText('January 4, 1970')).toBeTruthy();
  });

  it('default 24 h hides a 30-h-earlier meal; switching to 48 h shows it', async () => {
    const meal = makeEntry({ name: 'Old Lunch', loggedAt: outcome.loggedAt - 30 * HOUR });
    (getLogEntry as jest.Mock).mockResolvedValue(outcome);
    setEntries([outcome, meal]);

    const { findByText, findByTestId, getByText, queryByText, getByLabelText } = await render(<OutcomeScreen />);

    await findByTestId('entry-row-symptom');
    expect(queryByText('Old Lunch')).toBeNull();
    expect(getByText('Nothing logged in the 24 h before this.')).toBeTruthy();

    await fireEvent.press(getByLabelText('48 h'));

    expect(await findByText('Old Lunch')).toBeTruthy();
  });

  it('shows a matched meal\'s tier and linked labels', async () => {
    // Same fixture shape as insights.test.ts's analyzeIngredientOutcomes case:
    // 3 lactose meals each followed by a symptom within 24h, 3 unrelated
    // control meals far away — this surfaces a real (low-confidence) 'lactose'
    // finding from the real engine, with no lookback-specific mocking.
    const lactoseMeals = [
      makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: 0 }),
      makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: 48 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["lactose"]', loggedAt: 96 * HOUR }),
    ];
    const controlMeals = [
      makeEntry({ type: 'meal', tagsJson: '["rice"]', loggedAt: 500 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["rice"]', loggedAt: 548 * HOUR }),
      makeEntry({ type: 'meal', tagsJson: '["rice"]', loggedAt: 596 * HOUR }),
    ];
    const earlierOutcomes = [
      makeEntry({ type: 'symptom', name: 'Symptom', severity: 4, loggedAt: 1 * HOUR }),
      makeEntry({ type: 'symptom', severity: 4, loggedAt: 49 * HOUR }),
      makeEntry({ id: 'outcome1', type: 'symptom', severity: 4, loggedAt: 97 * HOUR }), // this is the outcome we open
    ];
    const unmatched = makeEntry({ name: 'Plain Rice', loggedAt: 90 * HOUR });
    const thisOutcome = earlierOutcomes[2];
    (getLogEntry as jest.Mock).mockResolvedValue(thisOutcome);
    setEntries([...lactoseMeals, ...controlMeals, ...earlierOutcomes, unmatched]);

    const { findByText } = await render(<OutcomeScreen />);

    expect(await findByText('Low')).toBeTruthy();
    expect(await findByText('Linked to rough outcomes: lactose')).toBeTruthy();
    expect(await findByText('No pattern yet')).toBeTruthy();
  });

  it('renders a medication row with no suspicion', async () => {
    (getLogEntry as jest.Mock).mockResolvedValue(outcome);
    const event = makeMedEvent({ takenAt: outcome.loggedAt - 2 * HOUR, timeKnown: true });
    setEntries([outcome]);
    setMedications([event], [makeMedDose(event.id)]);

    const { findByText } = await render(<OutcomeScreen />);

    expect(await findByText('💊 Medication')).toBeTruthy();
    expect(await findByText('Omeprazole 20 mg')).toBeTruthy();
  });

  it('shows the empty-window copy with "Try a longer window" below 72 h', async () => {
    (getLogEntry as jest.Mock).mockResolvedValue(outcome);
    setEntries([outcome]);

    const { findByText } = await render(<OutcomeScreen />);

    expect(await findByText('Nothing logged in the 24 h before this.')).toBeTruthy();
    expect(await findByText('Try a longer window.')).toBeTruthy();
  });
});
