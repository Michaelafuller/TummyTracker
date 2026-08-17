import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedTextInput } from '@/components/form-fields';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { LogEntry, WatchlistItem } from '@/db/schema';
import { sentimentEmoji, type SentimentValue } from '@/features/sentiment/scale';
import { useTheme } from '@/hooks/use-theme';
import { computeWatchStats, normalizeWatchTerm, type WatchStats } from '@/lib/watchlist';
import { useWatchlistStore } from './watchlistStore';

/** Rounds an average sentiment to the nearest displayable 1-5 scale value. */
function nearestSentimentValue(avg: number): SentimentValue {
  return Math.min(5, Math.max(1, Math.round(avg))) as SentimentValue;
}

/** Per-item summary line: times eaten since watching, clean-day streak, avg sentiment. */
export function watchStatsSentence(item: WatchlistItem, stats: WatchStats): string {
  const timesLabel = stats.timesSinceWatch === 1 ? '1 time since watching' : `${stats.timesSinceWatch} times since watching`;

  const neverSinceWatch = stats.lastEatenAt == null || stats.lastEatenAt <= item.createdAt;
  const cleanLabel = neverSinceWatch
    ? `clean since watching (${stats.cleanDays} day${stats.cleanDays === 1 ? '' : 's'})`
    : `${stats.cleanDays} clean day${stats.cleanDays === 1 ? '' : 's'}`;

  const sentimentLabel = stats.avgSentiment != null ? `avg sentiment ${stats.avgSentiment.toFixed(1)}` : null;

  return [timesLabel, cleanLabel, sentimentLabel].filter((part): part is string => part != null).join(' · ');
}

/**
 * Insights-tab Watchlist section (HANDOFF Phase 3): manage watched terms +
 * per-term stats, plus a manual-add row. Reads/writes through
 * useWatchlistStore so the finding-card Watch buttons (WatchButton.tsx) and
 * the entry/review-screen flags (Phase 4) all share one source of truth.
 */
export function WatchlistSection({ entries, now }: { entries: readonly LogEntry[]; now: number }) {
  const theme = useTheme();
  const items = useWatchlistStore((state) => state.items);
  const add = useWatchlistStore((state) => state.add);
  const remove = useWatchlistStore((state) => state.remove);

  const [term, setTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    const normalized = normalizeWatchTerm(term);
    if (!normalized) {
      setError('Enter at least 2 letters or numbers.');
      return;
    }
    if (items.some((item) => item.term === normalized)) {
      setError(`Already watching "${normalized}".`);
      return;
    }
    setError(null);
    setTerm('');
    await add(normalized);
  }

  return (
    <View style={styles.section}>
      <ThemedText type="subtitle">Watchlist</ThemedText>

      {items.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Add a suspect ingredient below, or tap Watch on a finding, to start tracking it.
        </ThemedText>
      ) : (
        <View style={styles.list}>
          {items.map((item) => {
            const stats = computeWatchStats(item, entries, now);
            return (
              <View
                key={item.id}
                style={[styles.itemCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <View style={styles.itemHeader}>
                  <ThemedText type="smallBold">
                    {item.term}
                    {stats.avgSentiment != null ? ` ${sentimentEmoji(nearestSentimentValue(stats.avgSentiment))}` : ''}
                  </ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Stop watching ${item.term}`}
                    onPress={() => remove(item.id)}>
                    <ThemedText type="link" themeColor="danger">
                      Remove
                    </ThemedText>
                  </Pressable>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {watchStatsSentence(item, stats)}
                </ThemedText>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.addRow}>
        <ThemedTextInput
          value={term}
          onChangeText={setTerm}
          placeholder="e.g. soy, dairy, e322"
          accessibilityLabel="New watchlist term"
          style={styles.addInput}
          returnKeyType="done"
          onSubmitEditing={handleAdd}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add to watchlist"
          onPress={handleAdd}
          style={[styles.addButton, { backgroundColor: theme.primary }]}>
          <ThemedText style={[styles.addButtonLabel, { color: theme.primaryText }]}>Add</ThemedText>
        </Pressable>
      </View>
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.two,
  },
  itemCard: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  addInput: {
    flex: 1,
  },
  addButton: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 44,
    justifyContent: 'center',
  },
  addButtonLabel: {
    fontWeight: '700',
  },
});
