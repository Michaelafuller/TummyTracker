import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateTimeField } from '@/components/date-time-field';
import { FormField, ThemedTextInput } from '@/components/form-fields';
import { PrimaryButton } from '@/components/primary-button';
import { SegmentedControl, type SegmentOption } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Medication } from '@/db/schema';
import { useTheme } from '@/hooks/use-theme';
import {
  buildMedicationEntry,
  type BuiltMedicationDose,
  type BuiltMedicationEvent,
  type DoseLineState,
  type MedicationEntryErrors,
  type MedicationEntryFormState,
} from '@/lib/medicationEntry';
import { DOSE_UNITS, MAX_OTHER_UNIT_LENGTH } from '@/lib/medications';
import { MAX_NOTES_LENGTH } from '@/lib/validation';

/** The unit chips: every fixed DOSE_UNITS value, plus "other" for the free-text field (mirrors MedicationForm). */
type UnitChip = (typeof DOSE_UNITS)[number] | 'other';
const UNIT_OPTIONS: readonly SegmentOption<UnitChip>[] = [...DOSE_UNITS, 'other'].map((value) => ({
  value: value as UnitChip,
  label: value === 'other' ? 'Other' : value,
}));

function isKnownDoseUnit(unit: string): boolean {
  return (DOSE_UNITS as readonly string[]).includes(unit);
}

export interface MedicationEntrySavePayload {
  event: BuiltMedicationEvent;
  doses: BuiltMedicationDose[];
}

export interface MedicationEntryFormProps {
  /** Every medication (active + inactive) — used for name lookup and the "inactive" tag. */
  medications: readonly Medication[];
  initial: MedicationEntryFormState;
  onSubmit: (payload: MedicationEntrySavePayload) => void | Promise<void>;
  submitLabel?: string;
  submitting?: boolean;
}

/**
 * Shared create/edit form for a medication entry ("I took these", HANDOFF.md
 * #7, #8, #9). Shared by src/app/medication/entry/new.tsx and entry/[id].tsx.
 * Never mutates the `medications` it's given — every edit only updates local
 * form state, and `buildMedicationEntry` only ever reads it.
 */
export function MedicationEntryForm({
  medications,
  initial,
  onSubmit,
  submitLabel = 'Save',
  submitting = false,
}: MedicationEntryFormProps) {
  const theme = useTheme();
  const [state, setState] = useState<MedicationEntryFormState>(initial);
  const [errors, setErrors] = useState<MedicationEntryErrors>({});
  // A line is in "Other" unit mode when its doseUnit is a custom free-text
  // value rather than one of the fixed DOSE_UNITS chips — tracked separately
  // from `doseUnit` itself so switching to "Other" can show an empty field to
  // type into without losing which mode the chip row is in.
  const [otherUnitIds, setOtherUnitIds] = useState<Set<string>>(
    () =>
      new Set(
        initial.lines
          .filter((line) => line.doseUnit.length > 0 && !isKnownDoseUnit(line.doseUnit))
          .map((line) => line.medicationId),
      ),
  );
  // Lines the user tapped "Change unit" on — expands the chip row for them.
  // A line with no unit at all, or one already in "Other" mode, is expanded
  // regardless of whether it's in this set (HANDOFF.md #16 §1).
  const [expandedUnitIds, setExpandedUnitIds] = useState<Set<string>>(new Set());

  const medsById = new Map(medications.map((med) => [med.id, med] as const));

  function setLine(medicationId: string, patch: Partial<DoseLineState>) {
    setState((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => (line.medicationId === medicationId ? { ...line, ...patch } : line)),
    }));
  }

  function handleUnitChipChange(medicationId: string, value: UnitChip | null) {
    if (value === 'other') {
      setOtherUnitIds((prev) => new Set(prev).add(medicationId));
      setLine(medicationId, { doseUnit: '' });
      return;
    }
    setOtherUnitIds((prev) => {
      if (!prev.has(medicationId)) return prev;
      const next = new Set(prev);
      next.delete(medicationId);
      return next;
    });
    setLine(medicationId, { doseUnit: value ?? '' });
    // Picking a fixed-unit chip collapses the line again.
    setExpandedUnitIds((prev) => {
      if (!prev.has(medicationId)) return prev;
      const next = new Set(prev);
      next.delete(medicationId);
      return next;
    });
  }

  function handleChangeUnit(medicationId: string) {
    setExpandedUnitIds((prev) => new Set(prev).add(medicationId));
  }

  async function handleSubmit() {
    const result = buildMedicationEntry(state);
    setErrors(result.errors);
    if (result.valid && result.event && result.doses) {
      await onSubmit({ event: result.event, doses: result.doses });
    }
  }

  return (
    <View style={styles.form}>
      <DateTimeField
        dateInput={state.dateInput}
        timeInput={state.timeInput}
        mode={state.timeKnown ? 'datetime' : 'date'}
        onDateChange={(value) => setState((prev) => ({ ...prev, dateInput: value }))}
        onTimeChange={(value) => setState((prev) => ({ ...prev, timeInput: value }))}
        error={errors.loggedAt}
      />

      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Time not known"
        accessibilityState={{ checked: !state.timeKnown }}
        onPress={() => setState((prev) => ({ ...prev, timeKnown: !prev.timeKnown }))}
        style={styles.switchRow}>
        <View
          style={[
            styles.checkbox,
            { borderColor: theme.border, backgroundColor: !state.timeKnown ? theme.accent : 'transparent' },
          ]}>
          {!state.timeKnown ? <ThemedText style={{ color: theme.accentText }}>✓</ThemedText> : null}
        </View>
        <ThemedText type="small">Time not known</ThemedText>
      </Pressable>

      <FormField label="Medications" error={errors.lines}>
        <View style={styles.lines}>
          {state.lines.map((line) => {
            const med = medsById.get(line.medicationId);
            if (!med) return null;
            const inOtherMode = otherUnitIds.has(med.id);
            const chipValue: UnitChip | null = inOtherMode ? 'other' : line.doseUnit ? (line.doseUnit as UnitChip) : null;
            // Collapsed by default once the line has a unit; expanded while empty
            // (nothing to show as text yet), in "Other" mode, or after "Change unit".
            const unitExpanded = inOtherMode || line.doseUnit.length === 0 || expandedUnitIds.has(med.id);

            return (
              <View
                key={med.id}
                style={[styles.lineCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: line.selected }}
                  accessibilityLabel={`Took ${med.name}`}
                  testID={`dose-line-${med.id}`}
                  onPress={() => setLine(med.id, { selected: !line.selected })}
                  style={styles.lineHeader}>
                  <View
                    style={[
                      styles.checkbox,
                      { borderColor: theme.border, backgroundColor: line.selected ? theme.accent : 'transparent' },
                    ]}>
                    {line.selected ? <ThemedText style={{ color: theme.accentText }}>✓</ThemedText> : null}
                  </View>
                  <ThemedText type="smallBold" style={styles.lineName} numberOfLines={1}>
                    {med.name}
                  </ThemedText>
                  {!med.isActive ? (
                    <View style={[styles.inactiveTag, { borderColor: theme.border }]}>
                      <ThemedText type="small" themeColor="textSecondary">
                        inactive
                      </ThemedText>
                    </View>
                  ) : null}
                </Pressable>

                {line.selected ? (
                  <View style={styles.doseFields}>
                    <FormField label="Dose" error={errors.doseErrors?.[med.id]}>
                      <ThemedTextInput
                        value={line.doseInput}
                        onChangeText={(value) => setLine(med.id, { doseInput: value })}
                        accessibilityLabel={`Dose of ${med.name}`}
                        placeholder="e.g. 10"
                        keyboardType="decimal-pad"
                      />
                    </FormField>

                    <FormField label="Unit">
                      {unitExpanded ? (
                        <SegmentedControl
                          options={UNIT_OPTIONS}
                          value={chipValue}
                          onChange={(value) => handleUnitChipChange(med.id, value)}
                        />
                      ) : (
                        <View style={styles.unitRow}>
                          <ThemedText type="small">{line.doseUnit}</ThemedText>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Change unit for ${med.name}`}
                            testID={`change-unit-${med.id}`}
                            onPress={() => handleChangeUnit(med.id)}>
                            <ThemedText type="linkPrimary">Change unit</ThemedText>
                          </Pressable>
                        </View>
                      )}
                    </FormField>

                    {inOtherMode ? (
                      <FormField label="Unit name">
                        <ThemedTextInput
                          value={line.doseUnit}
                          onChangeText={(value) => setLine(med.id, { doseUnit: value })}
                          accessibilityLabel={`Unit for ${med.name}`}
                          placeholder="e.g. sachet"
                          maxLength={MAX_OTHER_UNIT_LENGTH}
                        />
                      </FormField>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </FormField>

      <FormField label="Notes" error={errors.notes} hint={`${state.notes.length}/${MAX_NOTES_LENGTH}`}>
        <ThemedTextInput
          value={state.notes}
          onChangeText={(value) => setState((prev) => ({ ...prev, notes: value }))}
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lines: {
    gap: Spacing.two,
  },
  lineCard: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  lineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  lineName: {
    flex: 1,
  },
  inactiveTag: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
  },
  doseFields: {
    gap: Spacing.three,
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
});
