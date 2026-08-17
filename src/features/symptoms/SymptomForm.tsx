import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DateTimeField } from '@/components/date-time-field';
import { FormField, ThemedTextInput } from '@/components/form-fields';
import { PrimaryButton } from '@/components/primary-button';
import { Spacing } from '@/constants/theme';
import { formatDateInput, formatTimeInput } from '@/lib/datetime';
import { MAX_NOTES_LENGTH } from '@/lib/validation';
import { SeveritySelector } from './SeveritySelector';
import { buildSymptomEntry, type BuiltSymptomEntry, type SymptomFormErrors, type SymptomFormState } from './formModel';
import { SymptomTypePicker } from './SymptomTypePicker';

function defaultState(initial?: Partial<SymptomFormState>): SymptomFormState {
  const now = Date.now();
  return {
    dateInput: formatDateInput(now),
    timeInput: formatTimeInput(now),
    symptomType: null,
    severity: null,
    notes: '',
    ...initial,
  };
}

export interface SymptomFormProps {
  initial?: Partial<SymptomFormState>;
  onSubmit: (entry: BuiltSymptomEntry) => void | Promise<void>;
  submitLabel?: string;
  submitting?: boolean;
}

export function SymptomForm({
  initial,
  onSubmit,
  submitLabel = 'Save',
  submitting = false,
}: SymptomFormProps) {
  const [state, setState] = useState<SymptomFormState>(() => defaultState(initial));
  const [errors, setErrors] = useState<SymptomFormErrors>({});

  function set<K extends keyof SymptomFormState>(key: K, value: SymptomFormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    const result = buildSymptomEntry(state);
    setErrors(result.errors);
    if (result.valid && result.entry) {
      await onSubmit(result.entry);
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

      <FormField label="Symptom type (optional)">
        <SymptomTypePicker
          value={state.symptomType}
          onChange={(value) => set('symptomType', value)}
          onClear={() => set('symptomType', null)}
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
