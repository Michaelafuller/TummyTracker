import { fireEvent, render } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';

import { ensureNotificationPermission } from '@/features/notifications/service';

import { MedicationForm } from '../MedicationForm';
import type { BuiltMedication } from '../formModel';
import type { ReminderInput } from '../reminderModel';

jest.mock('@/features/notifications/service', () => ({
  ensureNotificationPermission: jest.fn(),
}));

// Force the Android picker path (auto-closes on commit) so two DateTimeFields
// (Start/End date) on one screen never both have an open native picker with
// the same testID at once — see components/__tests__/date-time-field.test.tsx
// for why the underlying picker mock ignores Platform.OS but our own
// open/close wiring does not.
const originalOS = Platform.OS;
beforeEach(() => {
  Platform.OS = 'android';
  (ensureNotificationPermission as jest.Mock).mockReset().mockResolvedValue(true);
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

describe('MedicationForm reminders (GitHub #29)', () => {
  it('saving without touching reminders passes an empty list as the second argument', async () => {
    const onSubmit = jest.fn();
    const { getByLabelText, findByLabelText, queryByTestId } = await render(<MedicationForm onSubmit={onSubmit} />);

    expect(queryByTestId('reminder-0')).toBeNull();
    await fireEvent.changeText(getByLabelText('Medication name'), 'Omeprazole');
    await fireEvent.press(await findByLabelText('Save'));

    expect(onSubmit.mock.calls[0][1]).toEqual([]);
  });

  it('Add reminder adds an 08:00 every-day row, which is saved with the medication', async () => {
    const onSubmit = jest.fn();
    const { getByLabelText, findByLabelText, findByTestId, getByTestId } = await render(
      <MedicationForm onSubmit={onSubmit} />,
    );

    await fireEvent.changeText(getByLabelText('Medication name'), 'Vitamin D');
    await fireEvent.press(await findByTestId('reminder-add'));

    expect(await findByTestId('reminder-0')).toBeTruthy();
    for (let day = 0; day < 7; day++) {
      expect(getByTestId(`reminder-0-day-${day}`).props.accessibilityState).toEqual({ selected: true });
    }

    await fireEvent.press(await findByLabelText('Save'));
    expect(onSubmit.mock.calls[0][1]).toEqual([{ hour: 8, minute: 0, daysMask: 127, enabled: true }]);
  });

  it('asks for notification permission when a reminder is added, and still adds it (with a notice) when denied', async () => {
    (ensureNotificationPermission as jest.Mock).mockResolvedValue(false);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { findByTestId } = await render(<MedicationForm onSubmit={jest.fn()} />);

    await fireEvent.press(await findByTestId('reminder-add'));
    await findByTestId('reminder-0');

    expect(ensureNotificationPermission).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith('Notifications are off', expect.stringContaining('system settings'));

    // One notice per form: a second add neither re-asks nor re-alerts.
    await fireEvent.press(await findByTestId('reminder-add'));
    await findByTestId('reminder-1');
    expect(alertSpy).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it('toggling a weekday chip changes the mask; the label names the day for accessibility', async () => {
    const onSubmit = jest.fn();
    const { findByLabelText, findByTestId, getByTestId } = await render(
      <MedicationForm
        onSubmit={onSubmit}
        initial={{ name: 'X', reminders: [{ key: 'a', hour: 9, minute: 30, daysMask: 127, enabled: true }] }}
      />,
    );

    await fireEvent.press(await findByLabelText('Saturday reminder 1'));
    await fireEvent.press(await findByTestId('reminder-0-day-6')); // Sunday

    expect(getByTestId('reminder-0-day-5').props.accessibilityState).toEqual({ selected: false });
    expect(getByTestId('reminder-0-day-6').props.accessibilityState).toEqual({ selected: false });
    await fireEvent.press(await findByLabelText('Save'));
    expect(onSubmit.mock.calls[0][1]).toEqual([{ hour: 9, minute: 30, daysMask: 31, enabled: true }]);
  });

  it('the on/off switch is saved on the reminder', async () => {
    const onSubmit = jest.fn();
    const { findByLabelText, findByTestId } = await render(
      <MedicationForm
        onSubmit={onSubmit}
        initial={{ name: 'X', reminders: [{ key: 'a', hour: 9, minute: 30, daysMask: 127, enabled: true }] }}
      />,
    );

    await fireEvent(await findByTestId('reminder-0-enabled'), 'valueChange', false);
    await fireEvent.press(await findByLabelText('Save'));
    expect((onSubmit.mock.calls[0][1] as ReminderInput[])[0].enabled).toBe(false);
  });

  it('Remove drops just that row', async () => {
    const onSubmit = jest.fn();
    const { findByLabelText, findByTestId, queryByTestId } = await render(
      <MedicationForm
        onSubmit={onSubmit}
        initial={{
          name: 'X',
          reminders: [
            { key: 'a', hour: 8, minute: 0, daysMask: 127, enabled: true },
            { key: 'b', hour: 20, minute: 0, daysMask: 127, enabled: true },
          ],
        }}
      />,
    );

    await fireEvent.press(await findByTestId('reminder-0-remove'));
    expect(queryByTestId('reminder-1')).toBeNull();

    await fireEvent.press(await findByLabelText('Save'));
    expect(onSubmit.mock.calls[0][1]).toEqual([{ hour: 20, minute: 0, daysMask: 127, enabled: true }]);
  });

  it('shows "Pick at least one day." on the row and does not submit when every day is off', async () => {
    const onSubmit = jest.fn();
    const { findByLabelText, findByTestId, findByText } = await render(
      <MedicationForm
        onSubmit={onSubmit}
        initial={{ name: 'X', reminders: [{ key: 'a', hour: 8, minute: 0, daysMask: 1, enabled: true }] }}
      />,
    );

    await fireEvent.press(await findByTestId('reminder-0-day-0')); // turn Monday off -> mask 0
    await fireEvent.press(await findByLabelText('Save'));

    expect(await findByText('Pick at least one day.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();

    // Editing the row clears its stale error.
    await fireEvent.press(await findByTestId('reminder-0-day-1'));
    expect(await findByTestId('reminder-0')).toBeTruthy();
  });

  it('hints about the "Took them" button only when reminders exist and there is no default dose + unit', async () => {
    const { findByTestId, queryByTestId, getByLabelText, findByLabelText } = await render(
      <MedicationForm onSubmit={jest.fn()} />,
    );
    expect(queryByTestId('reminder-took-hint')).toBeNull();

    await fireEvent.press(await findByTestId('reminder-add'));
    expect(await findByTestId('reminder-took-hint')).toBeTruthy();

    await fireEvent.changeText(getByLabelText('Default dose'), '10');
    await fireEvent.press(await findByLabelText('mg'));
    expect(queryByTestId('reminder-took-hint')).toBeNull();
  });
});
