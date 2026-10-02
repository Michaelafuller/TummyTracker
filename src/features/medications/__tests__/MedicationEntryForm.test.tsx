import { fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { Medication } from '@/db/schema';
import { defaultEntryState, entryStateFromEvent } from '@/lib/medicationEntry';
import { MedicationEntryForm, type MedicationEntrySavePayload } from '../MedicationEntryForm';

// Force the Android picker path (auto-closes on commit), same rationale as
// MedicationForm.test.tsx.
const originalOS = Platform.OS;
beforeEach(() => {
  Platform.OS = 'android';
});
afterEach(() => {
  Platform.OS = originalOS;
});

function makeMedication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 'med1',
    name: 'Omeprazole',
    defaultDose: 20,
    doseUnit: 'mg',
    frequency: null,
    startDate: null,
    endDate: null,
    isActive: true,
    isRegular: false,
    notes: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const NOW = new Date(2026, 8, 26, 9, 0).getTime();

describe('MedicationEntryForm — new entry', () => {
  it('renders one unselected line per active medication, pre-filled from its default dose', async () => {
    const meds = [makeMedication({ id: 'med1', name: 'Omeprazole', defaultDose: 20, doseUnit: 'mg' })];
    const onSubmit = jest.fn();

    const { findByTestId, queryByLabelText } = await render(
      <MedicationEntryForm medications={meds} initial={defaultEntryState(meds, NOW)} onSubmit={onSubmit} />,
    );

    const line = await findByTestId('dose-line-med1');
    expect(line.props.accessibilityState.checked).toBe(false);
    // Dose input for an unselected line isn't rendered.
    expect(queryByLabelText('Dose of Omeprazole')).toBeNull();
  });

  it('selecting a line reveals its pre-filled dose/unit, and saving builds the event + dose payload', async () => {
    const meds = [makeMedication({ id: 'med1', name: 'Omeprazole', defaultDose: 20, doseUnit: 'mg' })];
    const onSubmit = jest.fn();

    const { findByTestId, findByLabelText } = await render(
      <MedicationEntryForm medications={meds} initial={defaultEntryState(meds, NOW)} onSubmit={onSubmit} />,
    );

    await fireEvent.press(await findByTestId('dose-line-med1'));
    expect((await findByLabelText('Dose of Omeprazole')).props.defaultValue).toBe('20');

    await fireEvent.press(await findByLabelText('Save'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as MedicationEntrySavePayload;
    expect(payload.event).toEqual({ takenAt: NOW, timeKnown: true, notes: null });
    expect(payload.doses).toEqual([{ medicationId: 'med1', dose: 20, doseUnit: 'mg' }]);
  });

  it('overriding the dose to half the default saves the overridden value, not the default', async () => {
    const meds = [makeMedication({ id: 'med1', name: 'Omeprazole', defaultDose: 20, doseUnit: 'mg' })];
    const onSubmit = jest.fn();

    const { findByTestId, findByLabelText } = await render(
      <MedicationEntryForm medications={meds} initial={defaultEntryState(meds, NOW)} onSubmit={onSubmit} />,
    );

    await fireEvent.press(await findByTestId('dose-line-med1'));
    await fireEvent.changeText(await findByLabelText('Dose of Omeprazole'), '10');
    await fireEvent.press(await findByLabelText('Save'));

    const payload = onSubmit.mock.calls[0][0] as MedicationEntrySavePayload;
    expect(payload.doses).toEqual([{ medicationId: 'med1', dose: 10, doseUnit: 'mg' }]);
    // The medication itself is untouched (invariant, HANDOFF.md §0).
    expect(meds[0].defaultDose).toBe(20);
  });

  it('logging two medications, one overridden, saves both doses', async () => {
    const meds = [
      makeMedication({ id: 'med1', name: 'Omeprazole', defaultDose: 20, doseUnit: 'mg' }),
      makeMedication({ id: 'med2', name: 'Ibuprofen', defaultDose: 200, doseUnit: 'mg' }),
    ];
    const onSubmit = jest.fn();

    const { findByTestId, findByLabelText } = await render(
      <MedicationEntryForm medications={meds} initial={defaultEntryState(meds, NOW)} onSubmit={onSubmit} />,
    );

    await fireEvent.press(await findByTestId('dose-line-med1'));
    await fireEvent.press(await findByTestId('dose-line-med2'));
    await fireEvent.changeText(await findByLabelText('Dose of Ibuprofen'), '100');
    await fireEvent.press(await findByLabelText('Save'));

    const payload = onSubmit.mock.calls[0][0] as MedicationEntrySavePayload;
    expect(payload.doses).toEqual([
      { medicationId: 'med1', dose: 20, doseUnit: 'mg' },
      { medicationId: 'med2', dose: 100, doseUnit: 'mg' },
    ]);
  });

  it('shows a validation error and does not submit when nothing is selected', async () => {
    const meds = [makeMedication()];
    const onSubmit = jest.fn();

    const { findByLabelText, findByText } = await render(
      <MedicationEntryForm medications={meds} initial={defaultEntryState(meds, NOW)} onSubmit={onSubmit} />,
    );

    await fireEvent.press(await findByLabelText('Save'));

    expect(await findByText('Select at least one medication.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a dose error for a selected line with an empty dose and does not submit', async () => {
    const meds = [makeMedication({ id: 'med1', name: 'Omeprazole', defaultDose: null, doseUnit: null })];
    const onSubmit = jest.fn();

    const { findByTestId, findByLabelText, findByText } = await render(
      <MedicationEntryForm medications={meds} initial={defaultEntryState(meds, NOW)} onSubmit={onSubmit} />,
    );

    await fireEvent.press(await findByTestId('dose-line-med1'));
    await fireEvent.press(await findByLabelText('mg'));
    await fireEvent.press(await findByLabelText('Save'));

    expect(await findByText('Dose must be a number greater than 0.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('"Time not known" hides the time chip and lands on local noon', async () => {
    const meds = [makeMedication({ id: 'med1', defaultDose: 20, doseUnit: 'mg' })];
    const onSubmit = jest.fn();

    const { findByTestId, findByLabelText, queryByLabelText } = await render(
      <MedicationEntryForm medications={meds} initial={defaultEntryState(meds, NOW)} onSubmit={onSubmit} />,
    );

    await fireEvent.press(await findByLabelText('Time not known'));
    expect(queryByLabelText('Choose time')).toBeNull();

    await fireEvent.press(await findByTestId('dose-line-med1'));
    await fireEvent.press(await findByLabelText('Save'));

    const payload = onSubmit.mock.calls[0][0] as MedicationEntrySavePayload;
    expect(payload.event.timeKnown).toBe(false);
    expect(payload.event.takenAt).toBe(new Date(2026, 8, 26, 12, 0).getTime());
  });

  it('shows the default unit as text with a "Change unit" link, collapsing the chip row', async () => {
    const meds = [makeMedication({ id: 'med1', name: 'Omeprazole', defaultDose: 20, doseUnit: 'mg' })];
    const onSubmit = jest.fn();

    const { findByTestId, findByLabelText, queryByLabelText, getByText } = await render(
      <MedicationEntryForm medications={meds} initial={defaultEntryState(meds, NOW)} onSubmit={onSubmit} />,
    );

    await fireEvent.press(await findByTestId('dose-line-med1'));

    expect(getByText('mg')).toBeTruthy();
    expect(await findByLabelText('Change unit for Omeprazole')).toBeTruthy();
    // The chip row itself isn't rendered while collapsed.
    expect(queryByLabelText('mg')).toBeNull();
    expect(queryByLabelText('Other')).toBeNull();
  });

  it('tapping "Change unit" reveals the chip row, and picking a chip collapses it again and saves that unit', async () => {
    const meds = [makeMedication({ id: 'med1', name: 'Omeprazole', defaultDose: 20, doseUnit: 'mg' })];
    const onSubmit = jest.fn();

    const { findByTestId, findByLabelText, queryByTestId, getByText } = await render(
      <MedicationEntryForm medications={meds} initial={defaultEntryState(meds, NOW)} onSubmit={onSubmit} />,
    );

    await fireEvent.press(await findByTestId('dose-line-med1'));
    await fireEvent.press(await findByTestId('change-unit-med1'));

    expect(await findByLabelText('mL')).toBeTruthy();

    await fireEvent.press(await findByLabelText('mL'));

    // Collapsed again, now showing the newly picked unit as text.
    expect(queryByTestId('change-unit-med1')).toBeTruthy();
    expect(getByText('mL')).toBeTruthy();

    await fireEvent.press(await findByLabelText('Save'));
    const payload = onSubmit.mock.calls[0][0] as MedicationEntrySavePayload;
    expect(payload.doses).toEqual([{ medicationId: 'med1', dose: 20, doseUnit: 'mL' }]);
  });

  it('a medication with no default unit shows the chip row straight away, with no "Change unit" link', async () => {
    const meds = [makeMedication({ id: 'med1', name: 'Fish oil', defaultDose: null, doseUnit: null })];
    const onSubmit = jest.fn();

    const { findByTestId, findByLabelText, queryByTestId } = await render(
      <MedicationEntryForm medications={meds} initial={defaultEntryState(meds, NOW)} onSubmit={onSubmit} />,
    );

    await fireEvent.press(await findByTestId('dose-line-med1'));

    expect(await findByLabelText('mg')).toBeTruthy();
    expect(queryByTestId('change-unit-med1')).toBeNull();
  });

  it('choosing "Other" reveals a unit-name field for that line only', async () => {
    const meds = [makeMedication({ id: 'med1', name: 'Fish oil', defaultDose: null, doseUnit: null })];
    const onSubmit = jest.fn();

    const { findByTestId, findByLabelText, queryByLabelText } = await render(
      <MedicationEntryForm medications={meds} initial={defaultEntryState(meds, NOW)} onSubmit={onSubmit} />,
    );

    await fireEvent.press(await findByTestId('dose-line-med1'));
    expect(queryByLabelText('Unit for Fish oil')).toBeNull();

    await fireEvent.press(await findByLabelText('Other'));
    await fireEvent.changeText(await findByLabelText('Unit for Fish oil'), 'softgel');
    await fireEvent.changeText(await findByLabelText('Dose of Fish oil'), '2');
    await fireEvent.press(await findByLabelText('Save'));

    const payload = onSubmit.mock.calls[0][0] as MedicationEntrySavePayload;
    expect(payload.doses).toEqual([{ medicationId: 'med1', dose: 2, doseUnit: 'softgel' }]);
  });
  it('a medication whose default is a custom unit starts collapsed too, and "Change unit" opens Other', async () => {
    const meds = [makeMedication({ id: 'med1', name: 'Electrolytes', defaultDose: 1, doseUnit: 'sachet' })];
    const onSubmit = jest.fn();

    const { findByTestId, findByText, findByLabelText, queryByLabelText } = await render(
      <MedicationEntryForm medications={meds} initial={defaultEntryState(meds, NOW)} onSubmit={onSubmit} />,
    );

    await fireEvent.press(await findByTestId('dose-line-med1'));
    expect(await findByText('sachet')).toBeTruthy();
    expect(queryByLabelText('Other')).toBeNull();
    expect(queryByLabelText('Unit for Electrolytes')).toBeNull();

    await fireEvent.press(await findByTestId('change-unit-med1'));
    expect(await findByLabelText('Unit for Electrolytes')).toBeTruthy();

    await fireEvent.press(await findByLabelText('Save'));
    const payload = onSubmit.mock.calls[0][0] as MedicationEntrySavePayload;
    expect(payload.doses).toEqual([{ medicationId: 'med1', dose: 1, doseUnit: 'sachet' }]);
  });

  it('typing an Other unit keeps the field open after the first keystroke', async () => {
    const meds = [makeMedication({ id: 'med1', name: 'Omeprazole' })];
    const { findByTestId, findByLabelText } = await render(
      <MedicationEntryForm medications={meds} initial={defaultEntryState(meds, NOW)} onSubmit={jest.fn()} />,
    );

    await fireEvent.press(await findByTestId('dose-line-med1'));
    await fireEvent.press(await findByTestId('change-unit-med1'));
    await fireEvent.press(await findByLabelText('Other'));
    await fireEvent.changeText(await findByLabelText('Unit for Omeprazole'), 's');

    expect(await findByLabelText('Unit for Omeprazole')).toBeTruthy();
  });
});

describe('MedicationEntryForm — edit entry', () => {
  it('shows an "inactive" tag for a medication that has since gone inactive', async () => {
    const event = { id: 'evt1', takenAt: NOW, timeKnown: true, notes: null, createdAt: 0, updatedAt: 0 };
    const doses = [
      { id: 'd1', eventId: 'evt1', medicationId: 'med1', dose: 20, doseUnit: 'mg', reason: null, createdAt: 0, updatedAt: 0 },
    ];
    const meds = [makeMedication({ id: 'med1', name: 'Discontinued Med', isActive: false })];
    const onSubmit = jest.fn();

    const { findByText } = await render(
      <MedicationEntryForm
        medications={meds}
        initial={entryStateFromEvent(event, doses, meds)}
        onSubmit={onSubmit}
        submitLabel="Save changes"
      />,
    );

    expect(await findByText('inactive')).toBeTruthy();
  });

  it('pre-fills from the event and keeps the notes editable', async () => {
    const event = { id: 'evt1', takenAt: NOW, timeKnown: true, notes: 'with food', createdAt: 0, updatedAt: 0 };
    const doses = [
      { id: 'd1', eventId: 'evt1', medicationId: 'med1', dose: 20, doseUnit: 'mg', reason: null, createdAt: 0, updatedAt: 0 },
    ];
    const meds = [makeMedication({ id: 'med1', name: 'Omeprazole' })];
    const onSubmit = jest.fn();

    const { findByLabelText, getByLabelText } = await render(
      <MedicationEntryForm
        medications={meds}
        initial={entryStateFromEvent(event, doses, meds)}
        onSubmit={onSubmit}
        submitLabel="Save changes"
      />,
    );

    expect(getByLabelText('Notes').props.defaultValue).toBe('with food');
    await fireEvent.changeText(getByLabelText('Notes'), 'with breakfast');
    await fireEvent.press(await findByLabelText('Save changes'));

    const payload = onSubmit.mock.calls[0][0] as MedicationEntrySavePayload;
    expect(payload.event.notes).toBe('with breakfast');
  });
});
