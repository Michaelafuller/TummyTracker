import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DateTimeField } from '@/components/date-time-field';
import { FormField, ThemedTextInput } from '@/components/form-fields';
import { PrimaryButton } from '@/components/primary-button';
import { SegmentedControl, type SegmentOption } from '@/components/segmented-control';
import { Spacing } from '@/constants/theme';
import { MAX_OTHER_UNIT_LENGTH } from '@/lib/medications';
import { MAX_NOTES_LENGTH } from '@/lib/validation';
import {
  buildMedication,
  UNIT_CHOICES,
  type BuiltMedication,
  type MedicationFormErrors,
  type MedicationFormState,
  type UnitChoice,
} from './formModel';

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
    ...initial,
  };
}

export interface MedicationFormProps {
  initial?: Partial<MedicationFormState>;
  onSubmit: (medication: BuiltMedication) => void | Promise<void>;
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

  function set<K extends keyof MedicationFormState>(key: K, value: MedicationFormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    const result = buildMedication(state);
    setErrors(result.errors);
    if (result.valid && result.medication) {
      await onSubmit(result.medication);
    }
  }

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

const styles = StyleSheet.create({
  form: {
    gap: Spacing.four,
  },
});
