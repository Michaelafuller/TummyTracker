import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { setDayFactors, type DayFactorPatch } from '@/db/repository';
import { usePrefsStore } from '@/features/prefs/prefsStore';
import { useTheme } from '@/hooks/use-theme';
import { tapFeedback } from '@/lib/haptics';
import {
  ALCOHOL_OPTIONS,
  CAFFEINE_OPTIONS,
  PERIOD_OPTIONS,
  SLEEP_OPTIONS,
  STRESS_OPTIONS,
  type ChipOption,
} from './dayFactorModel';
import { useDayFactors } from './useDayFactors';

export interface DayFactorChipsProps {
  /** The local calendar day key ('YYYY-MM-DD') whose factors these chips edit. */
  date: string;
}

type FactorField = keyof DayFactorPatch;

/**
 * One-tap chips for a day's sleep, stress, alcohol, caffeine and — only when
 * enabled in Settings — period (GitHub #23). Each tap saves immediately;
 * tapping the selected chip clears it back to "not logged". Lives on the
 * day-details screen (`src/app/day-details.tsx`), not inline on Home, so every
 * row stays reachable.
 */
export function DayFactorChips({ date }: DayFactorChipsProps) {
  const theme = useTheme();
  const factors = useDayFactors();
  const trackPeriod = usePrefsStore((s) => s.trackPeriod);
  const factorRow = factors.find((f) => f.date === date);

  /** Sets `value`, or clears the field when the tapped chip is already selected. */
  function handleFactor<T extends string | number | boolean>(field: FactorField, current: T | null | undefined, value: T) {
    void tapFeedback('impact');
    void setDayFactors(date, { [field]: current === value ? null : value });
  }

  function chipRow<T extends string | number | boolean>(
    field: FactorField,
    caption: string,
    options: readonly ChipOption<T>[],
    current: T | null | undefined,
  ) {
    return (
      <View style={styles.factorRow} key={field}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.factorCaption}>
          {caption}
        </ThemedText>
        <View style={styles.chips}>
          {options.map((option) => {
            const selected = current === option.value;
            return (
              <Pressable
                key={String(option.value)}
                accessibilityRole="button"
                accessibilityLabel={`${caption}: ${option.label}`}
                accessibilityState={{ selected }}
                testID={`day-factor-${field}-${String(option.value)}`}
                onPress={() => handleFactor(field, current, option.value)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.primary : theme.backgroundElement,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}>
                <ThemedText type="small" style={selected ? { color: theme.primaryText } : undefined}>
                  {option.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.factors} testID="day-factors">
      {chipRow('sleep', 'Sleep', SLEEP_OPTIONS, factorRow?.sleep)}
      {chipRow('stress', 'Stress', STRESS_OPTIONS, factorRow?.stress)}
      {chipRow('alcohol', 'Alcohol', ALCOHOL_OPTIONS, factorRow?.alcohol)}
      {chipRow('caffeine', 'Caffeine', CAFFEINE_OPTIONS, factorRow?.caffeine)}
      {trackPeriod ? chipRow('period', 'Period', PERIOD_OPTIONS, factorRow?.period) : null}
      <ThemedText type="small" themeColor="textSecondary">
        Optional. Tap a chosen chip again to clear it.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  factors: {
    gap: Spacing.three,
  },
  factorRow: {
    gap: Spacing.one,
  },
  factorCaption: {
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
});
