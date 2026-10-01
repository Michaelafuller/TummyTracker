import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { setDayFactors, type DayFactorPatch } from '@/db/repository';
import type { DayStatus } from '@/db/schema';
import { usePrefsStore } from '@/features/prefs/prefsStore';
import { useTheme } from '@/hooks/use-theme';
import { tapFeedback } from '@/lib/haptics';
import { recordDayCheckIn } from './dayCheckInService';
import {
  ALCOHOL_OPTIONS,
  CAFFEINE_OPTIONS,
  PERIOD_OPTIONS,
  SLEEP_OPTIONS,
  STRESS_OPTIONS,
  factorSummary,
  type ChipOption,
} from './dayFactorModel';
import { useDayCheckIns } from './useDayCheckIns';
import { useDayFactors } from './useDayFactors';

export interface DayCheckInCardProps {
  /** Today's local calendar day key ('YYYY-MM-DD', src/lib/datetime.ts `formatDateInput`). */
  date: string;
}

type FactorField = keyof DayFactorPatch;

/**
 * Home screen "How was today?" card (GitHub #13). Reads today's answer live
 * via `useDayCheckIns` — a fine/rough tap records it immediately and the
 * selected button fills in. Kept minimal (no emoji — CLAUDE.md §7's scale is
 * for BM feel-afterward only; one row of buttons; no navigation on answer).
 *
 * Under the buttons, an optional "Add details" row (GitHub #23) expands to
 * one-tap chips for today's sleep, stress, alcohol, caffeine and — only when
 * enabled in Settings — period. Each tap saves immediately; tapping the
 * selected chip clears it back to "not logged".
 */
export function DayCheckInCard({ date }: DayCheckInCardProps) {
  const theme = useTheme();
  const router = useRouter();
  const checkIns = useDayCheckIns();
  const factors = useDayFactors();
  const trackPeriod = usePrefsStore((s) => s.trackPeriod);
  const [expanded, setExpanded] = useState(false);
  const today = checkIns.find((c) => c.date === date);
  const status = today?.status ?? null;
  const factorRow = factors.find((f) => f.date === date);
  const summary = factorSummary(factorRow, { trackPeriod });

  function handlePress(next: DayStatus) {
    void tapFeedback('impact');
    void recordDayCheckIn(date, next);
  }

  /** Sets `value`, or clears the field when the tapped chip is already selected. */
  function handleFactor<T extends string | number | boolean>(field: FactorField, current: T | null | undefined, value: T) {
    void tapFeedback('impact');
    void setDayFactors(date, { [field]: current === value ? null : value });
  }

  function buttonStyle(selected: boolean) {
    return [
      styles.button,
      {
        backgroundColor: selected ? theme.primary : theme.backgroundElement,
        borderColor: selected ? theme.primary : theme.border,
      },
    ];
  }

  function labelStyle(selected: boolean) {
    return selected ? { color: theme.primaryText } : undefined;
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
                <ThemedText type="small" style={labelStyle(selected)}>
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
    <View style={styles.section}>
      <ThemedText type="smallBold">How was today?</ThemedText>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mark today as a fine day"
          accessibilityState={{ selected: status === 'fine' }}
          testID="day-check-in-fine"
          onPress={() => handlePress('fine')}
          style={buttonStyle(status === 'fine')}>
          <ThemedText type="smallBold" style={labelStyle(status === 'fine')}>
            Fine day
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mark today as a rough day"
          accessibilityState={{ selected: status === 'rough' }}
          testID="day-check-in-rough"
          onPress={() => handlePress('rough')}
          style={buttonStyle(status === 'rough')}>
          <ThemedText type="smallBold" style={labelStyle(status === 'rough')}>
            Rough day
          </ThemedText>
        </Pressable>
      </View>

      {status === 'rough' ? (
        <View style={styles.roughRow}>
          <ThemedText type="small" themeColor="textSecondary">
            Rough day noted.
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a symptom for today"
            onPress={() => router.push('/symptom/new')}>
            <ThemedText type="small" themeColor="link">
              Add a symptom
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Hide details for today' : 'Add details for today'}
        accessibilityState={{ expanded }}
        testID="day-factors-toggle"
        onPress={() => setExpanded((open) => !open)}>
        <ThemedText type="small" themeColor="link">
          {expanded ? 'Hide details' : (summary ?? 'Add details')}
        </ThemedText>
      </Pressable>

      {expanded ? (
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
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  button: {
    flex: 1,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  roughRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  factors: {
    gap: Spacing.two,
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
