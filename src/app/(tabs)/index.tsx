import { useFocusEffect, Link, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import type { LogEntry } from '@/db/schema';
import { listRecentFoodEntries } from '@/db/repository';
import { logEntryToFormState } from '@/features/logging/formModel';
import { usePrefillStore } from '@/features/logging/prefillStore';
import { useTheme } from '@/hooks/use-theme';
import { formatDateInput, formatTimeInput } from '@/lib/datetime';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const setPrefill = usePrefillStore((s) => s.setPrefill);
  const [recents, setRecents] = useState<LogEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      listRecentFoodEntries(10).then(setRecents).catch(() => setRecents([]));
    }, []),
  );

  const handleRecentTap = useCallback(
    (entry: LogEntry) => {
      const now = Date.now();
      const prefill = {
        ...logEntryToFormState(entry),
        // Reset so the new entry defaults to now, not the original log time.
        dateInput: formatDateInput(now),
        timeInput: formatTimeInput(now),
      };
      setPrefill(prefill);
      router.push('/entry/new');
    },
    [setPrefill, router],
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <ThemedView style={styles.hero}>
            <ThemedText type="title" style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
              TummyTracker
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              Log what you eat, note how it sits with you, and spot the patterns.
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.actions}>
            <Link href="/scan" asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Scan a barcode"
                style={[styles.cta, { backgroundColor: theme.primary }]}>
                <ThemedText style={[styles.ctaLabel, { color: theme.primaryText }]}>
                  Scan barcode
                </ThemedText>
              </Pressable>
            </Link>

            <Link href="/entry/new" asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add an entry manually"
                style={[
                  styles.secondaryCta,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}>
                <ThemedText style={styles.ctaLabel}>+ Add manually</ThemedText>
              </Pressable>
            </Link>

            <Link href="/bm/new" asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Log a bowel movement"
                style={[
                  styles.secondaryCta,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}>
                <ThemedText style={styles.ctaLabel}>💩 Log bowel movement</ThemedText>
              </Pressable>
            </Link>

            <Link href="/symptom/new" asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Log a symptom"
                style={[
                  styles.secondaryCta,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}>
                <ThemedText style={styles.ctaLabel}>🤢 Log symptom</ThemedText>
              </Pressable>
            </Link>

          </ThemedView>

          {recents.length > 0 && (
            <ThemedView style={styles.recentSection}>
              <ThemedText type="smallBold" style={styles.recentHeading}>
                Recent
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recentScroll}>
                {recents.map((entry) => (
                  <Pressable
                    key={entry.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Re-log ${entry.name}`}
                    onPress={() => handleRecentTap(entry)}
                    style={[
                      styles.recentChip,
                      { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                    ]}>
                    <ThemedText type="small" numberOfLines={1}>
                      {entry.name}
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            </ThemedView>
          )}
        </ScrollView>
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
    paddingBottom: BottomTabInset + Spacing.four,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.five,
    flexGrow: 1,
    justifyContent: 'center',
  },
  hero: {
    gap: Spacing.three,
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
  cta: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  secondaryCta: {
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  ctaLabel: {
    fontSize: 18,
    fontWeight: 600,
  },
  recentSection: {
    gap: Spacing.two,
  },
  recentHeading: {
    marginLeft: Spacing.one,
  },
  recentScroll: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  recentChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 200,
  },
});
