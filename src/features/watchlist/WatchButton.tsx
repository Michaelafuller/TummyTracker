import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { matchesWatchTerm, normalizeWatchTerm } from '@/lib/watchlist';
import { useWatchlistStore } from './watchlistStore';

/**
 * One-tap "Watch"/"Watching" affordance for an ingredient finding card
 * (HANDOFF Phase 3 — the therapeutic loop: insight → watch → confirm).
 * "Already watched" is keyed on matchesWatchTerm against the current
 * watchlist, not on an exact-term lookup, so a broader watched term (e.g.
 * "soy") correctly shows "Watching" on a narrower finding tag ("soybeans").
 */
export function WatchButton({ tag }: { tag: string }) {
  const theme = useTheme();
  const items = useWatchlistStore((state) => state.items);
  const add = useWatchlistStore((state) => state.add);

  const isWatching = items.some((item) => matchesWatchTerm(tag, item.term));

  async function handlePress() {
    if (isWatching) return;
    const normalized = normalizeWatchTerm(tag);
    if (!normalized) return;
    await add(normalized);
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isWatching ? `Watching ${tag}` : `Watch ${tag}`}
      accessibilityState={{ disabled: isWatching }}
      disabled={isWatching}
      onPress={handlePress}
      style={[styles.chip, { backgroundColor: isWatching ? theme.backgroundSelected : theme.border }]}>
      <ThemedText type="small" style={styles.label}>
        {isWatching ? 'Watching' : 'Watch'}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: Spacing.four,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
  },
  label: {
    fontWeight: '700',
  },
});
