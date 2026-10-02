import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { FormScrollView } from '@/components/keyboard-aware-screen';
import { PrimaryButton } from '@/components/primary-button';
import { DayFactorChips } from '@/features/checkin/DayFactorChips';
import { formatDateInput, formatLongDate, parseDateTime } from '@/lib/datetime';

/**
 * The valid local day from `/day-details?date=YYYY-MM-DD`, or today when the
 * param is missing or not a real calendar day. Returns the key plus an epoch
 * inside that day (for formatting the title).
 */
function resolveDay(value: string | string[] | undefined, nowMs: number): { date: string; ms: number } {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw) {
    const parsed = parseDateTime(raw, '12:00');
    if (parsed.ms !== null) return { date: raw.trim(), ms: parsed.ms };
  }
  return { date: formatDateInput(nowMs), ms: nowMs };
}

/**
 * Day details (GitHub #23 follow-up): sleep / stress / alcohol / caffeine /
 * period chips for one day, on their own always-scrolling screen so every row
 * is reachable (Home doesn't scroll). Opened from the Home check-in card.
 */
export default function DayDetailsScreen() {
  const router = useRouter();
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const [now] = useState(() => Date.now());
  const { date, ms } = resolveDay(dateParam, now);
  const isToday = date === formatDateInput(now);
  const title = isToday ? "Today's details" : `Details for ${formatLongDate(ms)}`;

  return (
    <FormScrollView>
      <Stack.Screen options={{ title }} />
      <DayFactorChips date={date} />
      <PrimaryButton label="Done" accessibilityLabel="Done" testID="day-details-done" onPress={() => router.back()} />
    </FormScrollView>
  );
}
