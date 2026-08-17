import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DateTimeField } from '@/components/date-time-field';
import { FormField, ThemedTextInput } from '@/components/form-fields';
import { PrimaryButton } from '@/components/primary-button';
import { Spacing } from '@/constants/theme';
import { formatDateInput, formatTimeInput } from '@/lib/datetime';
import { MAX_NOTES_LENGTH } from '@/lib/validation';
import { SentimentSelector } from '@/features/sentiment/SentimentSelector';
import { BristolSelector } from './BristolSelector';
import { type BmFormState, type BmFormErrors, buildBmEntry, type BuiltBmEntry } from './formModel';

function defaultState(initial?: Partial<BmFormState>): BmFormState {
  const now = Date.now();
  return {
    dateInput: formatDateInput(now),
    timeInput: formatTimeInput(now),
    bristol: null,
    sentiment: null,
    notes: '',
    ...initial,
  };
}

export interface BmFormProps {
  initial?: Partial<BmFormState>;
  onSubmit: (entry: BuiltBmEntry) => void | Promise<void>;
  submitLabel?: string;
  submitting?: boolean;
}

export function BmForm({ initial, onSubmit, submitLabel = 'Save', submitting = false }: BmFormProps) {
  const [state, setState] = useState<BmFormState>(() => defaultState(initial));
  const [errors, setErrors] = useState<BmFormErrors>({});

  function set<K extends keyof BmFormState>(key: K, value: BmFormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    const result = buildBmEntry(state);
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

      <FormField label="Bristol type (optional)">
        <BristolSelector
          value={state.bristol}
          onChange={(value) => set('bristol', value)}
          onClear={() => set('bristol', null)}
        />
      </FormField>

      <FormField label="How did it feel?">
        <SentimentSelector
          value={state.sentiment}
          onChange={(value) => set('sentiment', value)}
          onClear={() => set('sentiment', null)}
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
