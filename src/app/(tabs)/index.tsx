import { Link } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function HomeScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.hero}>
          <ThemedText type="title" style={styles.title}>
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
              style={[styles.cta, { backgroundColor: theme.text }]}>
              <ThemedText style={[styles.ctaLabel, { color: theme.background }]}>
                Scan barcode
              </ThemedText>
            </Pressable>
          </Link>

          <Link href="/entry/new" asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add an entry manually"
              style={[styles.secondaryCta, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={styles.ctaLabel}>+ Add manually</ThemedText>
            </Pressable>
          </Link>

          <Link href="/bm/new" asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log a bowel movement"
              style={[styles.secondaryCta, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={styles.ctaLabel}>💩 Log bowel movement</ThemedText>
            </Pressable>
          </Link>

          <Link href="/settings" asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reminder settings"
              style={styles.linkRow}>
              <ThemedText type="link" themeColor="textSecondary">
                Reminders
              </ThemedText>
            </Pressable>
          </Link>
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
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    justifyContent: 'center',
    gap: Spacing.five,
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
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  ctaLabel: {
    fontSize: 18,
    fontWeight: 600,
  },
  linkRow: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
