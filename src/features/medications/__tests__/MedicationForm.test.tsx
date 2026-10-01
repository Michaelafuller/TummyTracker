import { fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { MedicationForm } from '../MedicationForm';
import type { BuiltMedication } from '../formModel';

// Force the Android picker path (auto-closes on commit) so two DateTimeFields
// (Start/End date) on one screen never both have an open native picker with
// the same testID at once — see components/__tests__/date-time-field.test.tsx
// for why the underlying picker mock ignores Platform.OS but our own
// open/close wiring does not.
const originalOS = Platform.OS;
beforeEach(() => {
  Platform.OS = 'android';
});
afterEach(() => {
  Platform.OS = originalOS;
});

describe('MedicationForm', () => {
  it('saving with just a name calls onSubmit with every other field null', async () => {
    const onSubmit = jest.fn();
    const { getByLabelText, findByLabelText } = await render(<MedicationForm onSubmit={onSubmit} />);

    await fireEvent.changeText(getByLabelText('Medication name'), 'Omeprazole');
    await fireEvent.press(await findByLabelText('Save'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const built = onSubmit.mock.calls[0][0] as BuiltMedication;
    expect(built).toEqual({
      name: 'Omeprazole',
      defaultDose: null,
      doseUnit: null,
      frequency: null,
      startDate: null,
      endDate: null,
      notes: null,
      isRegular: false,
    });
  });

  it('shows a validation error and does not submit when the name is blank', async () => {
    const onSubmit = jest.fn();
    const { findByLabelText, findByText } = await render(<MedicationForm onSubmit={onSubmit} />);

    await fireEvent.press(await findByLabelText('Save'));

    expect(await findByText('Name is required.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('picking a unit chip and entering a dose + frequency builds the full summary fields', async () => {
    const onSubmit = jest.fn();
    const { getByLabelText, findByLabelText } = await render(<MedicationForm onSubmit={onSubmit} />);

    await fireEvent.changeText(getByLabelText('Medication name'), 'Vitamin D');
    await fireEvent.changeText(getByLabelText('Default dose'), '10');
    await fireEvent.press(await findByLabelText('mg'));
    await fireEvent.changeText(getByLabelText('Frequency'), 'once daily');
    await fireEvent.press(await findByLabelText('Save'));

    const built = onSubmit.mock.calls[0][0] as BuiltMedication;
    expect(built.defaultDose).toBe(10);
    expect(built.doseUnit).toBe('mg');
    expect(built.frequency).toBe('once daily');
  });

  it('choosing "Other" reveals a unit-name field, and its trimmed text becomes doseUnit', async () => {
    const onSubmit = jest.fn();
    const { getByLabelText, findByLabelText, queryByLabelText } = await render(
      <MedicationForm onSubmit={onSubmit} />,
    );

    expect(queryByLabelText('Other unit name')).toBeNull();

    await fireEvent.changeText(getByLabelText('Medication name'), 'Fish oil');
    await fireEvent.changeText(getByLabelText('Default dose'), '2');
    await fireEvent.press(await findByLabelText('Other'));
    await fireEvent.changeText(await findByLabelText('Other unit name'), '  softgel  ');
    await fireEvent.press(await findByLabelText('Save'));

    const built = onSubmit.mock.calls[0][0] as BuiltMedication;
    expect(built.doseUnit).toBe('softgel');
  });

  it('shows a doseUnit error when a dose is given but no unit is chosen', async () => {
    const onSubmit = jest.fn();
    const { getByLabelText, findByLabelText, findByText } = await render(
      <MedicationForm onSubmit={onSubmit} />,
    );

    await fireEvent.changeText(getByLabelText('Medication name'), 'Ibuprofen');
    await fireEvent.changeText(getByLabelText('Default dose'), '200');
    await fireEvent.press(await findByLabelText('Save'));

    expect(await findByText('Unit is required when a dose is given.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects an end date before the start date and does not submit', async () => {
    const onSubmit = jest.fn();
    const { getByLabelText, findByLabelText, findByTestId, findByText } = await render(
      <MedicationForm onSubmit={onSubmit} />,
    );

    await fireEvent.changeText(getByLabelText('Medication name'), 'Antibiotic');

    await fireEvent.press(await findByLabelText('Choose start date'));
    await fireEvent(
      await findByTestId('date-time-picker'),
      'onChange',
      { nativeEvent: { timestamp: new Date(2026, 5, 10).getTime(), utcOffset: 0 } },
    );

    await fireEvent.press(await findByLabelText('Choose end date'));
    await fireEvent(
      await findByTestId('date-time-picker'),
      'onChange',
      { nativeEvent: { timestamp: new Date(2026, 5, 1).getTime(), utcOffset: 0 } },
    );

    await fireEvent.press(await findByLabelText('Save'));

    expect(await findByText('End date must be on or after the start date.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('the Regular switch is saved with the medication, and a regular one without a dose is rejected (GitHub #26)', async () => {
    const onSubmit = jest.fn();
    const { getByLabelText, findByLabelText, findByText } = await render(<MedicationForm onSubmit={onSubmit} />);

    await fireEvent.changeText(getByLabelText('Medication name'), 'Levothyroxine');
    await fireEvent(await findByLabelText('Regular medication'), 'valueChange', true);
    await fireEvent.press(await findByLabelText('Save'));

    expect(await findByText('A regular medication needs a default dose and unit.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();

    await fireEvent.changeText(getByLabelText('Default dose'), '50');
    await fireEvent.press(await findByLabelText('mcg'));
    await fireEvent.press(await findByLabelText('Save'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const built = onSubmit.mock.calls[0][0] as BuiltMedication;
    expect(built).toMatchObject({ defaultDose: 50, doseUnit: 'mcg', isRegular: true });
  });

  it('seeds the Regular switch from `initial` and can switch it off', async () => {
    const onSubmit = jest.fn();
    const { findByLabelText } = await render(
      <MedicationForm
        onSubmit={onSubmit}
        initial={{ name: 'X', defaultDose: '1', unitChoice: 'mg', isRegular: true }}
      />,
    );
    await fireEvent.press(await findByLabelText('Save'));
    expect((onSubmit.mock.calls[0][0] as BuiltMedication).isRegular).toBe(true);

    await fireEvent(await findByLabelText('Regular medication'), 'valueChange', false);
    await fireEvent.press(await findByLabelText('Save'));
    expect((onSubmit.mock.calls[1][0] as BuiltMedication).isRegular).toBe(false);
  });

  it('pre-fills from `initial` (edit mode) and keeps the "Other" unit text visible', async () => {
    const onSubmit = jest.fn();
    const { getByLabelText, findByLabelText } = await render(
      <MedicationForm
        onSubmit={onSubmit}
        submitLabel="Save changes"
        initial={{
          name: 'Custom Blend',
          defaultDose: '3',
          unitChoice: 'other',
          otherUnitText: 'scoop',
          frequency: 'with breakfast',
        }}
      />,
    );

    expect(getByLabelText('Medication name').props.defaultValue).toBe('Custom Blend');
    expect(getByLabelText('Other unit name').props.defaultValue).toBe('scoop');

    await fireEvent.press(await findByLabelText('Save changes'));
    const built = onSubmit.mock.calls[0][0] as BuiltMedication;
    expect(built.doseUnit).toBe('scoop');
    expect(built.frequency).toBe('with breakfast');
  });
});
