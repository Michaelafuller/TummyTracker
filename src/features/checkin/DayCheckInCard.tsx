import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { DayStatus } from '@/db/schema';
import { usePrefsStore } from '@/features/prefs/prefsStore';
import { useTheme } from '@/hooks/use-theme';
import { tapFeedback } from '@/lib/haptics';
import { recordDayCheckIn } from './dayCheckInService';
import { factorSummary } from './dayFactorModel';
import { useDayCheckIns } from './useDayCheckIns';
import { useDayFactors } from './useDayFactors';

export interface DayCheckInCardProps {
  /** Today's local calendar day key ('YYYY-MM-DD', src/lib/datetime.ts `formatDateInput`). */
  date: string;
}

/**
 * Home screen "How was today?" card (GitHub #13). Reads today's answer live
 * via `useDayCheckIns` — a fine/rough tap records it immediately and the
 * selected button fills in. Kept minimal (no emoji — CLAUDE.md §7's scale is
 * for BM feel-afterward only; one row of buttons; no navigation on answer).
 *
 * Under the buttons, an optional "Add details" row (GitHub #23) shows a
 * summary of today's sleep / stress / alcohol / caffeine / period and opens the
 * day-details screen (`/day-details`) where the one-tap chips live — they
 * don't fit inline on Home, which doesn't scroll.
 */
export function DayCheckInCard({ date }: DayCheckInCardProps) {
  const theme = useTheme();
  const router = useRouter();
  const checkIns = useDayCheckIns();
  const factors = useDayFactors();
  const trackPeriod = usePrefsStore((s) => s.trackPeriod);
  const today = checkIns.find((c) => c.date === date);
  const status = today?.status ?? null;
  const factorRow = factors.find((f) => f.date === date);
  const summary = factorSummary(factorRow, { trackPeriod });

  function handlePress(next: DayStatus) {
    void tapFeedback('impact');
    void recordDayCheckIn(date, next);
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
        accessibilityLabel={summary ? `Edit details for today: ${summary}` : 'Add details for today'}
        testID="day-factors-toggle"
        onPress={() => router.push({ pathname: '/day-details', params: { date } })}>
        <ThemedText type="small" themeColor="link">
          {summary ?? 'Add details'}
        </ThemedText>
      </Pressable>
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
});
