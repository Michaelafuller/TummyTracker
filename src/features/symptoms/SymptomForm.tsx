import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FormField, ThemedTextInput } from '@/components/form-fields';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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
  const theme = useTheme();
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
      <FormField label="When" error={errors.loggedAt}>
        <View style={styles.dateRow}>
          <ThemedTextInput
            value={state.dateInput}
            onChangeText={(value) => set('dateInput', value)}
            placeholder="YYYY-MM-DD"
            accessibilityLabel="Date logged"
            autoCapitalize="none"
            style={styles.flex}
          />
          <ThemedTextInput
            value={state.timeInput}
            onChangeText={(value) => set('timeInput', value)}
            placeholder="HH:MM"
            accessibilityLabel="Time logged"
            autoCapitalize="none"
            style={styles.timeInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Set to now"
            onPress={() => {
              const now = Date.now();
              setState((prev) => ({
                ...prev,
                dateInput: formatDateInput(now),
                timeInput: formatTimeInput(now),
              }));
            }}
            style={[styles.nowButton, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">Now</ThemedText>
          </Pressable>
        </View>
      </FormField>

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

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={submitLabel}
        accessibilityState={{ disabled: submitting }}
        disabled={submitting}
        onPress={handleSubmit}
        style={[styles.submit, { backgroundColor: theme.text, opacity: submitting ? 0.5 : 1 }]}>
        <ThemedText style={[styles.submitLabel, { color: theme.background }]}>
          {submitting ? 'Saving…' : submitLabel}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.four,
  },
  flex: {
    flex: 1,
  },
  dateRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  timeInput: {
    width: 96,
  },
  nowButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    minHeight: 44,
    justifyContent: 'center',
  },
  submit: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  submitLabel: {
    fontSize: 16,
    fontWeight: 600,
  },
});
