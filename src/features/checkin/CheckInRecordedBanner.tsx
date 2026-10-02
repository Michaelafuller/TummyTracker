import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateInput } from '@/lib/datetime';
import { tapFeedback } from '@/lib/haptics';
import { useCheckInFeedbackStore } from './checkInFeedbackStore';
import { recordedBannerText } from './dayCheckInModel';

export const CHECK_IN_BANNER_MS = 4000;

/**
 * Brief confirmation at the top of Home after a check-in is answered from the
 * notification's Fine/Rough button (the Home card's own taps already highlight
 * the chosen button). Hides itself after 4 s or when tapped.
 */
export function CheckInRecordedBanner() {
  const theme = useTheme();
  const recorded = useCheckInFeedbackStore((s) => s.recorded);
  const clear = useCheckInFeedbackStore((s) => s.clear);
  const at = recorded?.at ?? null;

  // Once per `at`: haptic + auto-hide timer. A newer answer changes `at`, which
  // clears the old timer (cleanup) and starts a fresh one.
  useEffect(() => {
    if (at === null) return;
    void tapFeedback('success');
    const timer = setTimeout(clear, CHECK_IN_BANNER_MS);
    return () => clearTimeout(timer);
  }, [at, clear]);

  if (!recorded) return null;

  const text = recordedBannerText(recorded.status, recorded.date, formatDateInput(recorded.at));

  return (
    <Pressable
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={text}
      testID="check-in-recorded-banner"
      onPress={clear}
      style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="smallBold">{text}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
