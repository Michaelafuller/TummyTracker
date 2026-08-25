import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DateTimeField } from '@/components/date-time-field';
import { FormField, ThemedTextInput } from '@/components/form-fields';
import { PrimaryButton } from '@/components/primary-button';
import { Spacing } from '@/constants/theme';
import { formatDateInput, formatTimeInput } from '@/lib/datetime';
import { MAX_NOTES_LENGTH } from '@/lib/validation';
import { SeveritySelector } from './SeveritySelector';
import { buildSymptomEntries, type BuiltSymptomEntry, type SymptomFormErrors, type SymptomFormState } from './formModel';
import type { SymptomTypeValue } from './symptomTypes';
import { SymptomTypePicker } from './SymptomTypePicker';

function defaultState(initial?: Partial<SymptomFormState>): SymptomFormState {
  const now = Date.now();
  return {
    dateInput: formatDateInput(now),
    timeInput: formatTimeInput(now),
    symptomTypes: [],
    severity: null,
    notes: '',
    ...initial,
  };
}

export interface SymptomFormProps {
  initial?: Partial<SymptomFormState>;
  onSubmit: (entries: BuiltSymptomEntry[]) => void | Promise<void>;
  submitLabel?: string;
  submitting?: boolean;
  /** Edit-screen mode: tapping a chip replaces the selection instead of toggling membership. */
  single?: boolean;
}

export function SymptomForm({
  initial,
  onSubmit,
  submitLabel = 'Save',
  submitting = false,
  single = false,
}: SymptomFormProps) {
  const [state, setState] = useState<SymptomFormState>(() => defaultState(initial));
  const [errors, setErrors] = useState<SymptomFormErrors>({});

  function set<K extends keyof SymptomFormState>(key: K, value: SymptomFormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function handleToggleType(value: SymptomTypeValue) {
    setState((prev) => {
      if (single) {
        return { ...prev, symptomTypes: [value] };
      }
      const isSelected = prev.symptomTypes.includes(value);
      return {
        ...prev,
        symptomTypes: isSelected
          ? prev.symptomTypes.filter((v) => v !== value)
          : [...prev.symptomTypes, value],
      };
    });
  }

  async function handleSubmit() {
    const result = buildSymptomEntries(state);
    setErrors(result.errors);
    if (result.valid && result.entries) {
      await onSubmit(result.entries);
    }
  }

  return (
    <View style={styles.form}>
      <DateTimeField
        dateInput={state.dateInput}
        timeInput={state.timeInput}
        onDateChange={(v) => set('dateInput', v)}
        onTimeChange={(v) => set('timeInput', v)}
        error={errors.loggedAt}
      />

      <FormField
        label={single ? 'Symptom type (optional)' : 'Symptom types (optional)'}
        hint={single ? undefined : 'Select all that apply'}>
        <SymptomTypePicker
          values={state.symptomTypes}
          onToggle={handleToggleType}
          onClear={() => set('symptomTypes', [])}
        />
      </FormField>

      <FormField label="Severity (optional)">
        <SeveritySelector
          value={state.severity}
          onChange={(value) => set('severity', value)}
          onClear={() => set('severity', null)}
        />
      </FormField>

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
