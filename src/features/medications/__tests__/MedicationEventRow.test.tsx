import type { ReactNode } from 'react';
import { render } from '@testing-library/react-native';

import { MedicationEventRow, type MedicationJournalItem } from '../MedicationEventRow';

// MedicationEventRow wraps its Pressable in expo-router's <Link>; stub it to a
// passthrough (same pattern as EntryRow.test.tsx) but capture each render's
// props so the href can still be asserted.
const capturedLinkProps: { href: unknown }[] = [];
jest.mock('expo-router', () => ({
  Link: (props: { href: unknown; children: ReactNode }) => {
    capturedLinkProps.push(props);
    return props.children;
  },
}));

beforeEach(() => {
  capturedLinkProps.length = 0;
});

function makeItem(overrides: Partial<MedicationJournalItem> = {}): MedicationJournalItem {
  return {
    kind: 'medication',
    id: 'evt1',
    loggedAt: new Date(2026, 8, 26, 14, 30).getTime(),
    timeKnown: true,
    summary: 'Omeprazole 20 mg',
    notes: null,
    ...overrides,
  };
}

describe('MedicationEventRow', () => {
  it('shows the time, "Medication" label, and summary', async () => {
    const { getByText, getByTestId } = await render(<MedicationEventRow item={makeItem()} />);

    expect(getByText('2:30 PM')).toBeTruthy();
    expect(getByText('💊 Medication')).toBeTruthy();
    expect(getByText('Omeprazole 20 mg')).toBeTruthy();
    expect(getByTestId('journal-med-evt1')).toBeTruthy();
  });

  it('shows "time not set" when timeKnown is false', async () => {
    const { getByText, queryByText } = await render(<MedicationEventRow item={makeItem({ timeKnown: false })} />);

    expect(getByText('time not set')).toBeTruthy();
    expect(queryByText('2:30 PM')).toBeNull();
  });

  it('shows a notes glyph when the event has notes', async () => {
    const { getByText } = await render(<MedicationEventRow item={makeItem({ notes: 'with food' })} />);
    expect(getByText('📝')).toBeTruthy();
  });

  it('shows no notes glyph when the event has no notes', async () => {
    const { queryByText } = await render(<MedicationEventRow item={makeItem({ notes: null })} />);
    expect(queryByText('📝')).toBeNull();
  });

  it('the accessibility label includes the summary and a "has notes" clause when notes exist', async () => {
    const { getByLabelText } = await render(
      <MedicationEventRow item={makeItem({ summary: 'Ibuprofen 200 mg', notes: 'with food' })} />,
    );
    expect(getByLabelText('Medication, Ibuprofen 200 mg, has notes')).toBeTruthy();
  });

  it('links to the entry\'s edit screen', async () => {
    await render(<MedicationEventRow item={makeItem({ id: 'evt42' })} />);

    expect(capturedLinkProps[0].href).toEqual({ pathname: '/medication/entry/[id]', params: { id: 'evt42' } });
  });
});
