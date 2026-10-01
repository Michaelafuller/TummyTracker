import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardShiftView } from '@/components/keyboard-aware-screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { listRecentFoodEntries } from '@/db/repository';
import type { LogEntry } from '@/db/schema';
import { useMealBuilderStore } from '@/features/logging/mealBuilderStore';
import { MyMealsSection } from '@/features/logging/MyMealsSection';
import { RecentFoodPicker } from '@/features/logging/RecentFoodPicker';
import { useBuilderLaunchers } from '@/features/logging/useBuilderLaunchers';
import { useSavedMeals } from '@/features/logging/useSavedMeals';
import { RegularMedsButton } from '@/features/medications/RegularMedsButton';
import { isReminderSlot, type ReminderSlot } from '@/features/notifications/model';
import { useTheme } from '@/hooks/use-theme';
import { orderSavedMealsForSlot } from '@/lib/savedMeals';

/** The slot from `/quick-log?slot=…`, or null for a missing/invalid value. */
function slotFromParam(value: string | string[] | undefined): ReminderSlot | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return isReminderSlot(raw) ? raw : null;
}

function titleFor(slot: ReminderSlot | null): string {
  return slot ? `Log ${slot}` : 'Quick log';
}

/**
 * Quick log (GitHub #26): where a breakfast/lunch/dinner reminder opens.
 * "Took my regular meds", then My meals (those saved for the slot first), then
 * Recent; tapping a meal opens the prefilled review with the slot set and
 * time = now. Nothing is logged until the user saves from the review (or taps
 * "Took my regular meds") — opening this screen is never a record.
 */
export default function QuickLogScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { slot: slotParam } = useLocalSearchParams<{ slot?: string }>();
  const slot = slotFromParam(slotParam);

  const savedMeals = useSavedMeals();
  const orderedSavedMeals = useMemo(() => orderSavedMealsForSlot(savedMeals, slot), [savedMeals, slot]);
  const [recents, setRecents] = useState<LogEntry[]>([]);
  const loadBuilder = useMealBuilderStore((s) => s.load);
  const clearBuilder = useMealBuilderStore((s) => s.clear);
  const { onRecentTap, onMyMealTap } = useBuilderLaunchers({ slot });

  useFocusEffect(
    useCallback(() => {
      listRecentFoodEntries(50).then(setRecents).catch(() => setRecents([]));
    }, []),
  );

  // Same as Home's "Scan barcode" / "Add manually" — start from an empty
  // builder (latent-bug fix, HANDOFF.md §1.6) — except the review's meal slot
  // is carried through: the review reads `reviewPrefill` once at mount.
  const startNewMeal = useCallback(() => {
    if (slot) {
      loadBuilder([], { mealSlot: slot });
    } else {
      clearBuilder();
    }
  }, [slot, loadBuilder, clearBuilder]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: titleFor(slot) }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <KeyboardShiftView testID="quick-log-keyboard-shift" style={styles.content}>
          <RegularMedsButton />

          <MyMealsSection items={orderedSavedMeals} onLog={onMyMealTap} testIDPrefix="quick-my-meal" />

          {recents.length > 0 && (
            <ThemedView style={styles.recentSection} testID="quick-recent-section">
              <ThemedText type="smallBold" style={styles.recentHeading}>
                Recent
              </ThemedText>
              <RecentFoodPicker entries={recents} onSelect={onRecentTap} limit={50} />
            </ThemedView>
          )}

          <ThemedView style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Scan a barcode"
              testID="quick-scan"
              onPress={() => {
                startNewMeal();
                router.push('/scan');
              }}
              style={[styles.cta, { backgroundColor: theme.primary }]}>
              <ThemedText style={[styles.ctaLabel, { color: theme.primaryText }]}>Scan barcode</ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add an entry manually"
              testID="quick-manual"
              onPress={() => {
                startNewMeal();
                router.push('/meal/component');
              }}
              style={[styles.secondaryCta, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <ThemedText style={styles.ctaLabel}>+ Add manually</ThemedText>
            </Pressable>
          </ThemedView>
        </KeyboardShiftView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  recentSection: {
    flex: 1,
    gap: Spacing.two,
  },
  recentHeading: {
    marginLeft: Spacing.one,
  },
  actions: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  cta: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    alignItems: 'center',
  },
  secondaryCta: {
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two + Spacing.one,
    alignItems: 'center',
  },
  ctaLabel: {
    fontSize: 18,
    fontWeight: 600,
  },
});
