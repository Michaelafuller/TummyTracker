import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedTextInput } from '@/components/form-fields';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { LogEntry, WatchlistItem } from '@/db/schema';
import { useTheme } from '@/hooks/use-theme';
import { computeWatchStats, normalizeWatchTerm, type WatchStats } from '@/lib/watchlist';
import { useWatchlistStore } from './watchlistStore';

/** Per-item summary line: times eaten since watching, clean-day streak, outcome rate. */
export function watchStatsSentence(item: WatchlistItem, stats: WatchStats): string {
  const timesLabel = stats.timesSinceWatch === 1 ? '1 time since watching' : `${stats.timesSinceWatch} times since watching`;

  const neverSinceWatch = stats.lastEatenAt == null || stats.lastEatenAt <= item.createdAt;
  const cleanLabel = neverSinceWatch
    ? `clean since watching (${stats.cleanDays} day${stats.cleanDays === 1 ? '' : 's'})`
    : `${stats.cleanDays} clean day${stats.cleanDays === 1 ? '' : 's'}`;

  const outcomeLabel =
    stats.matchCount > 0 ? `${stats.outcomeFollowedCount} of ${stats.matchCount} followed by a rough outcome` : null;

  return [timesLabel, cleanLabel, outcomeLabel].filter((part): part is string => part != null).join(' · ');
}

const INVALID_TERM_MESSAGE = 'Enter at least 2 letters or numbers.';

/**
 * Insights-tab Watchlist section (HANDOFF Phase 3): manage watched terms +
 * per-term stats, plus a manual-add row. Reads/writes through
 * useWatchlistStore so the finding-card Watch buttons (WatchButton.tsx) and
 * the entry/review-screen flags (Phase 4) all share one source of truth.
 *
 * Each item's header has an Edit/Remove link pair; Edit expands an inline
 * rename editor under the header (mirrors GoalsSection.tsx's single-open-row
 * editor). A rename keeps the item's `createdAt`, so watch-history stats
 * (`watchStatsSentence`) survive a typo fix untouched.
 */
export function WatchlistSection({ entries, now }: { entries: readonly LogEntry[]; now: number }) {
  const theme = useTheme();
  const items = useWatchlistStore((state) => state.items);
  const add = useWatchlistStore((state) => state.add);
  const remove = useWatchlistStore((state) => state.remove);
  const rename = useWatchlistStore((state) => state.rename);

  const [term, setTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Edit-in-place state, kept separate from the add row's `error` above so an
  // edit failure never paints the add row (and vice versa) — mirrors
  // GoalsSection's single-open-editor pattern (`expanded` there, `editingId`
  // here), one row open at a time.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTerm, setEditTerm] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  async function handleAdd() {
    const normalized = normalizeWatchTerm(term);
    if (!normalized) {
      setError(INVALID_TERM_MESSAGE);
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

  function toggleEdit(item: WatchlistItem) {
    if (editingId === item.id) {
      setEditingId(null);
      return;
    }
    setEditTerm(item.term);
    setEditError(null);
    setEditingId(item.id);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleRename(item: WatchlistItem) {
    const normalized = normalizeWatchTerm(editTerm);
    if (!normalized) {
      setEditError(INVALID_TERM_MESSAGE);
      return;
    }
    if (normalized === item.term) {
      setEditingId(null);
      return;
    }
    if (items.some((other) => other.id !== item.id && other.term === normalized)) {
      setEditError(`Already watching "${normalized}".`);
      return;
    }
    setEditError(null);
    await rename(item.id, normalized);
    setEditingId(null);
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
            const isEditing = editingId === item.id;
            return (
              <View
                key={item.id}
                style={[styles.itemCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <View style={styles.itemHeader}>
                  <ThemedText type="smallBold">{item.term}</ThemedText>
                  <View style={styles.itemActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${item.term}`}
                      accessibilityState={{ expanded: isEditing }}
                      onPress={() => toggleEdit(item)}>
                      <ThemedText type="link">Edit</ThemedText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Stop watching ${item.term}`}
                      onPress={() => remove(item.id)}>
                      <ThemedText type="link" themeColor="danger">
                        Remove
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {watchStatsSentence(item, stats)}
                </ThemedText>

                {isEditing ? (
                  <View style={styles.editor}>
                    <ThemedTextInput
                      value={editTerm}
                      onChangeText={setEditTerm}
                      accessibilityLabel="Edit watchlist term"
                      returnKeyType="done"
                      onSubmitEditing={() => handleRename(item)}
                    />
                    {editError ? (
                      <ThemedText type="small" themeColor="danger">
                        {editError}
                      </ThemedText>
                    ) : null}
                    <View style={styles.editorActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Save watchlist term"
                        onPress={() => handleRename(item)}
                        style={[styles.saveButton, { backgroundColor: theme.primary }]}>
                        <ThemedText style={[styles.saveLabel, { color: theme.primaryText }]}>Save</ThemedText>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Cancel editing ${item.term}`}
                        onPress={cancelEdit}>
                        <ThemedText type="link">Cancel</ThemedText>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
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
  itemActions: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
  },
  editor: {
    gap: Spacing.two,
  },
  editorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  saveButton: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    minHeight: 44,
    justifyContent: 'center',
  },
  saveLabel: {
    fontWeight: '700',
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
