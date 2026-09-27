import { useFocusEffect, Link, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardShiftView } from '@/components/keyboard-aware-screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import type { LogEntry } from '@/db/schema';
import { getMealComponents, listRecentFoodEntries } from '@/db/repository';
import { DayCheckInCard } from '@/features/checkin/DayCheckInCard';
import { useDayCheckInResponses } from '@/features/checkin/useDayCheckInResponses';
import { useMealBuilderStore } from '@/features/logging/mealBuilderStore';
import { RecentFoodPicker } from '@/features/logging/RecentFoodPicker';
import { useTheme } from '@/hooks/use-theme';
import { formatDateInput } from '@/lib/datetime';
import { entryToComponentDrafts } from '@/lib/mealAggregate';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const loadBuilder = useMealBuilderStore((s) => s.load);
  const clearBuilder = useMealBuilderStore((s) => s.clear);
  const [recents, setRecents] = useState<LogEntry[]>([]);
  const [today, setToday] = useState(() => formatDateInput(Date.now()));
  const recentTapInFlight = useRef(false);

  // Mounted here (not the root): Home is the initial tab, so it's mounted
  // whenever the app is, and only after the migration gate — the write
  // can't race the migrations (GitHub #13).
  useDayCheckInResponses();

  useFocusEffect(
    useCallback(() => {
      listRecentFoodEntries(50).then(setRecents).catch(() => setRecents([]));
      // Recomputed on every focus (not just mount) so a day rollover while
      // the app sits in the background refreshes the card's date on return.
      setToday(formatDateInput(Date.now()));
    }, []),
  );

  const handleRecentTap = useCallback(
    async (entry: LogEntry) => {
      // Guard against a fast second tap (same row or another) while the first
      // is still loading — without this, both taps race to loadBuilder/push.
      if (recentTapInFlight.current) {
        return;
      }
      recentTapInFlight.current = true;
      try {
        // Copy, never edit (owner decision): re-loading a past entry starts a
        // new draft meal seeded with its items, never touches the saved row.
        const rows = await getMealComponents(entry.id);
        loadBuilder(entryToComponentDrafts(entry, rows), {
          name: entry.name,
          type: entry.type,
          mealSlot: entry.mealSlot,
        });
        router.push('/meal/review');
      } catch {
        Alert.alert("Couldn't open that meal", 'Something went wrong loading it — try again.');
      } finally {
        recentTapInFlight.current = false;
      }
    },
    [loadBuilder, router],
  );

  const handleStartNewMeal = useCallback(() => {
    // Latent-bug fix (HANDOFF.md §1.6): abandoning the builder mid-flow left
    // stale components that leaked into the next meal. Starting fresh from
    // Home must always begin from an empty builder.
    clearBuilder();
  }, [clearBuilder]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardShiftView testID="home-keyboard-shift" style={styles.content}>
          <ThemedView style={styles.hero}>
            {/* Reserves room under the gear overlay (SettingsButton, rendered
             * above every tab in (tabs)/_layout.tsx — HANDOFF.md §5): the
             * centered title/subtitle would otherwise run under its top-right
             * corner on narrow screens. */}
            <ThemedText type="title" style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
              TummyTracker
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              Log what you eat and spot the patterns.
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.actions}>
            <Link href="/scan" asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Scan a barcode"
                onPress={handleStartNewMeal}
                // expo-router's <Link asChild> rejects array styles on its direct
                // child in dev mode — keep these flattened.
                style={StyleSheet.flatten([styles.cta, { backgroundColor: theme.primary }])}>
                <ThemedText style={[styles.ctaLabel, { color: theme.primaryText }]}>
                  Scan barcode
                </ThemedText>
              </Pressable>
            </Link>

            <Link href="/meal/component" asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add an entry manually"
                onPress={handleStartNewMeal}
                style={StyleSheet.flatten([
                  styles.secondaryCta,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ])}>
                <ThemedText style={styles.ctaLabel}>+ Add manually</ThemedText>
              </Pressable>
            </Link>

            <ThemedView style={styles.pairedRow}>
              <Link href="/bm/new" asChild>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Log a bowel movement"
                  style={StyleSheet.flatten([
                    styles.secondaryCta,
                    styles.pairedCta,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  ])}>
                  <ThemedText style={styles.ctaLabel}>💩 BM</ThemedText>
                </Pressable>
              </Link>

              <Link href="/symptom/new" asChild>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Log a symptom"
                  style={StyleSheet.flatten([
                    styles.secondaryCta,
                    styles.pairedCta,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  ])}>
                  <ThemedText style={styles.ctaLabel}>🤢 Symptom</ThemedText>
                </Pressable>
              </Link>
            </ThemedView>
          </ThemedView>

          <DayCheckInCard date={today} />

          {recents.length > 0 && (
            <ThemedView style={styles.recentSection}>
              <ThemedText type="smallBold" style={styles.recentHeading}>
                Recent
              </ThemedText>
              <RecentFoodPicker entries={recents} onSelect={handleRecentTap} limit={50} />
            </ThemedView>
          )}
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
    paddingBottom: BottomTabInset + Spacing.two,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  hero: {
    gap: Spacing.three,
    // On top of `content`'s own Spacing.four side padding, this keeps the
    // centered title/subtitle clear of the top-right gear overlay's ~60px
    // footprint (44 wide + Spacing.three right margin) while staying centered.
    paddingHorizontal: Spacing.five + Spacing.two,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.three,
  },
  pairedRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  pairedCta: {
    flex: 1,
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
  recentSection: {
    flex: 1,
    gap: Spacing.two,
  },
  recentHeading: {
    marginLeft: Spacing.one,
  },
});
