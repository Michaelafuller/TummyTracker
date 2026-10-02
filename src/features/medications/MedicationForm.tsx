import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { DateTimeField } from '@/components/date-time-field';
import { FormField, ThemedTextInput } from '@/components/form-fields';
import { PrimaryButton } from '@/components/primary-button';
import { SegmentedControl, type SegmentOption } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { TimeField } from '@/components/time-field';
import { Spacing } from '@/constants/theme';
import { ensureNotificationPermission } from '@/features/notifications/service';
import { useTheme } from '@/hooks/use-theme';
import { MAX_OTHER_UNIT_LENGTH } from '@/lib/medications';
import { MAX_NOTES_LENGTH } from '@/lib/validation';
import {
  buildMedication,
  hasDefaultDoseAndUnit,
  newReminderDraft,
  UNIT_CHOICES,
  type BuiltMedication,
  type MedicationFormErrors,
  type MedicationFormState,
  type ReminderDraft,
  type UnitChoice,
} from './formModel';
import { maskHas, WEEKDAY_LETTERS, WEEKDAY_NAMES, type ReminderInput } from './reminderModel';

const UNIT_OPTIONS: readonly SegmentOption<UnitChoice>[] = UNIT_CHOICES.map((value) => ({
  value,
  label: value === 'other' ? 'Other' : value,
}));

function defaultState(initial?: Partial<MedicationFormState>): MedicationFormState {
  return {
    name: '',
    defaultDose: '',
    unitChoice: null,
    otherUnitText: '',
    frequency: '',
    startDateInput: '',
    endDateInput: '',
    notes: '',
    isRegular: false,
    reminders: [],
    ...initial,
  };
}

export interface MedicationFormProps {
  initial?: Partial<MedicationFormState>;
  /** `reminders` replace the medication's saved reminder rows (GitHub #29). */
  onSubmit: (medication: BuiltMedication, reminders: ReminderInput[]) => void | Promise<void>;
  submitLabel?: string;
  submitting?: boolean;
}

/**
 * Add/edit form for a medication's inventory fields (HANDOFF.md #5, #6).
 * Shared by src/app/medication/new.tsx and src/app/medication/[id].tsx —
 * the latter renders its own "Mark inactive"/"Mark active" control below this.
 */
export function MedicationForm({
  initial,
  onSubmit,
  submitLabel = 'Save',
  submitting = false,
}: MedicationFormProps) {
  const [state, setState] = useState<MedicationFormState>(() => defaultState(initial));
  const [errors, setErrors] = useState<MedicationFormErrors>({});
  const theme = useTheme();
  // Stable React keys for rows added in this session (saved rows use their id).
  const nextReminderKey = useRef(0);
  // Notification permission is asked when a reminder is added; one notice per form is enough.
  const permissionNoticeShown = useRef(false);

  function set<K extends keyof MedicationFormState>(key: K, value: MedicationFormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    const result = buildMedication(state);
    setErrors(result.errors);
    if (result.valid && result.medication) {
      await onSubmit(result.medication, result.reminders ?? []);
    }
  }

  function updateReminder(index: number, patch: Partial<ReminderInput>) {
    setState((prev) => ({
      ...prev,
      reminders: prev.reminders.map((reminder, i) => (i === index ? { ...reminder, ...patch } : reminder)),
    }));
    // The row's own error is stale once it is edited; the next save re-validates.
    setErrors((prev) => {
      if (!prev.reminders?.[index]) return prev;
      const { [index]: _cleared, ...rest } = prev.reminders;
      return { ...prev, reminders: rest };
    });
  }

  function toggleDay(index: number, day: number) {
    const reminder = state.reminders[index];
    if (reminder) updateReminder(index, { daysMask: reminder.daysMask ^ (1 << day) });
  }

  function removeReminder(index: number) {
    setState((prev) => ({ ...prev, reminders: prev.reminders.filter((_, i) => i !== index) }));
    // Row indexes shift, so per-row errors no longer line up; the next save re-validates.
    setErrors((prev) => (prev.reminders ? { ...prev, reminders: undefined } : prev));
  }

  async function handleAddReminder() {
    const key = `new-${nextReminderKey.current++}`;
    setState((prev) => ({ ...prev, reminders: [...prev.reminders, newReminderDraft(key)] }));
    if (permissionNoticeShown.current) return;
    try {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        permissionNoticeShown.current = true;
        Alert.alert(
          'Notifications are off',
          'Enable notifications for TummyTracker in your system settings to get reminders. Your reminder is still saved.',
        );
      }
    } catch {
      // A failed permission check must not block adding a reminder.
    }
  }

  const showTookHint = state.reminders.length > 0 && !hasDefaultDoseAndUnit(state);

  return (
    <View style={styles.form}>
      <FormField label="Name" error={errors.name}>
        <ThemedTextInput
          value={state.name}
          onChangeText={(value) => set('name', value)}
          placeholder="e.g. Omeprazole"
          accessibilityLabel="Medication name"
          returnKeyType="next"
        />
      </FormField>

      <FormField label="Default dose (optional)" error={errors.defaultDose}>
        <ThemedTextInput
          value={state.defaultDose}
          onChangeText={(value) => set('defaultDose', value)}
          placeholder="e.g. 10"
          accessibilityLabel="Default dose"
          keyboardType="decimal-pad"
        />
      </FormField>

      <FormField label="Unit" error={errors.doseUnit}>
        <SegmentedControl
          options={UNIT_OPTIONS}
          value={state.unitChoice}
          onChange={(value) => set('unitChoice', value)}
          allowClear
        />
      </FormField>

      {state.unitChoice === 'other' ? (
        <FormField label="Unit name">
          <ThemedTextInput
            value={state.otherUnitText}
            onChangeText={(value) => set('otherUnitText', value)}
            placeholder="e.g. sachet"
            accessibilityLabel="Other unit name"
            maxLength={MAX_OTHER_UNIT_LENGTH}
          />
        </FormField>
      ) : null}

      <View style={styles.regularRow}>
        <View style={styles.regularLabel}>
          <ThemedText type="smallBold">Regular — I take this every day</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Powers the one-tap &quot;Took my regular meds&quot; button. Needs a default dose and unit.
          </ThemedText>
        </View>
        <Switch
          value={state.isRegular}
          onValueChange={(value) => set('isRegular', value)}
          accessibilityLabel="Regular medication"
          testID="medication-regular"
        />
      </View>

      <View style={styles.remindersBlock} testID="medication-reminders">
        <ThemedText type="smallBold">Reminders</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          A notification at these times. It never logs a dose by itself.
        </ThemedText>

        {state.reminders.map((reminder, index) => (
          <ReminderRow
            key={reminder.key}
            index={index}
            reminder={reminder}
            error={errors.reminders?.[index]}
            onTime={(hour, minute) => updateReminder(index, { hour, minute })}
            onToggleDay={(day) => toggleDay(index, day)}
            onEnabled={(enabled) => updateReminder(index, { enabled })}
            onRemove={() => removeReminder(index)}
          />
        ))}

        {showTookHint ? (
          <ThemedText type="small" themeColor="textSecondary" testID="reminder-took-hint">
            Add a default dose to get a &quot;Took them&quot; button on the reminder.
          </ThemedText>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add reminder"
          testID="reminder-add"
          onPress={handleAddReminder}
          style={[styles.addChip, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <ThemedText type="smallBold">Add reminder</ThemedText>
        </Pressable>
      </View>

      <FormField label="Frequency (optional)">
        <ThemedTextInput
          value={state.frequency}
          onChangeText={(value) => set('frequency', value)}
          placeholder="e.g. twice daily"
          accessibilityLabel="Frequency"
        />
      </FormField>

      <DateTimeField
        label="Start date (optional)"
        mode="date"
        dateInput={state.startDateInput}
        timeInput="00:00"
        onDateChange={(value) => set('startDateInput', value)}
        onTimeChange={() => {}}
        onClear={() => set('startDateInput', '')}
        dateAccessibilityLabel="Choose start date"
        clearAccessibilityLabel="Clear start date"
      />

      <DateTimeField
        label="End date (optional)"
        mode="date"
        dateInput={state.endDateInput}
        timeInput="00:00"
        onDateChange={(value) => set('endDateInput', value)}
        onTimeChange={() => {}}
        onClear={() => set('endDateInput', '')}
        dateAccessibilityLabel="Choose end date"
        clearAccessibilityLabel="Clear end date"
        error={errors.endDate}
      />

      <FormField label="Notes" error={errors.notes} hint={`${state.notes.length}/${MAX_NOTES_LENGTH}`}>
        <ThemedTextInput
          value={state.notes}
          onChangeText={(value) => set('notes', value)}
          placeholder="Anything worth remembering"
          accessibilityLabel="Notes"
          multiline
          maxLength={MAX_NOTES_LENGTH}
        />
      </FormField>

      <PrimaryButton
        label={submitting ? 'Saving…' : submitLabel}
        accessibilityLabel={submitLabel}
        disabled={submitting}
        onPress={handleSubmit}
      />
    </View>
  );
}

interface ReminderRowProps {
  index: number;
  reminder: ReminderDraft;
  error?: string;
  onTime: (hour: number, minute: number) => void;
  onToggleDay: (day: number) => void;
  onEnabled: (enabled: boolean) => void;
  onRemove: () => void;
}

/** One reminder: time, weekday chips, on/off and Remove (GitHub #29). */
function ReminderRow({ index, reminder, error, onTime, onToggleDay, onEnabled, onRemove }: ReminderRowProps) {
  const theme = useTheme();
  const n = index + 1;
  return (
    <View style={[styles.reminderRow, { borderColor: theme.border }]} testID={`reminder-${index}`}>
      <View style={styles.reminderHeader}>
        <TimeField
          hour={reminder.hour}
          minute={reminder.minute}
          onChange={onTime}
          accessibilityLabel={`Reminder ${n} time`}
        />
        <View style={styles.reminderHeaderRight}>
          <Switch
            value={reminder.enabled}
            onValueChange={onEnabled}
            accessibilityLabel={`Reminder ${n} enabled`}
            testID={`reminder-${index}-enabled`}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove reminder ${n}`}
            testID={`reminder-${index}-remove`}
            onPress={onRemove}
            hitSlop={Spacing.two}>
            <ThemedText type="link" themeColor="danger">
              Remove
            </ThemedText>
          </Pressable>
        </View>
      </View>

      <View style={styles.dayRow}>
        {WEEKDAY_LETTERS.map((letter, day) => {
          const selected = maskHas(reminder.daysMask, day);
          return (
            <Pressable
              key={WEEKDAY_NAMES[day]}
              accessibilityRole="button"
              accessibilityLabel={`${WEEKDAY_NAMES[day]} reminder ${n}`}
              accessibilityState={{ selected }}
              testID={`reminder-${index}-day-${day}`}
              onPress={() => onToggleDay(day)}
              style={[
                styles.dayChip,
                {
                  backgroundColor: selected ? theme.accent : theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}>
              <ThemedText type="smallBold" style={selected ? { color: theme.accentText } : undefined}>
                {letter}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <ThemedText type="small" themeColor="danger" testID={`reminder-${index}-error`}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.four,
  },
  regularRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  regularLabel: {
    flex: 1,
    gap: Spacing.half,
  },
  remindersBlock: {
    gap: Spacing.two,
  },
  reminderRow: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  reminderHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.one,
  },
  dayChip: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
  },
  addChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
