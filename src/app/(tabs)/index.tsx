import { useFocusEffect, Link, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import type { LogEntry } from '@/db/schema';
import { listRecentFoodEntries } from '@/db/repository';
import { logEntryToFormState } from '@/features/logging/formModel';
import { usePrefillStore } from '@/features/logging/prefillStore';
import { RecentFoodPicker } from '@/features/logging/RecentFoodPicker';
import { useTheme } from '@/hooks/use-theme';
import { formatDateInput, formatTimeInput } from '@/lib/datetime';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const setPrefill = usePrefillStore((s) => s.setPrefill);
  const [recents, setRecents] = useState<LogEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      listRecentFoodEntries(50).then(setRecents).catch(() => setRecents([]));
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
        <ThemedView style={styles.content}>
          <ThemedView style={styles.hero}>
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
                  <ThemedText style={styles.ctaLabel}>💩 Bowel movement</ThemedText>
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

          {recents.length > 0 && (
            <ThemedView style={styles.recentSection}>
              <ThemedText type="smallBold" style={styles.recentHeading}>
                Recent
              </ThemedText>
              <RecentFoodPicker entries={recents} onSelect={handleRecentTap} limit={50} />
            </ThemedView>
          )}
        </ThemedView>
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
