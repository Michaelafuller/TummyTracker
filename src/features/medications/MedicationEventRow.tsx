import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatTime12h } from '@/lib/datetime';
import type { MedicationJournalItem } from '@/lib/journal';

// Re-exported for callers that import the type from this component file
// (pure logic like lookback.ts imports it from '@/lib/journal' directly, since
// pure modules must not import from component files).
export type { MedicationJournalItem };

/**
 * One medication event row in a merged list (the Journal's "Meds" chip,
 * Recent doses, and the history screen, HANDOFF.md §5). Mirrors
 * src/features/logging/EntryRow.tsx's layout/testID conventions so the two
 * row types read as one family in a day-grouped list.
 */
export function MedicationEventRow({ item }: { item: MedicationJournalItem }) {
  const theme = useTheme();
  const timeLabel = item.timeKnown ? formatTime12h(item.loggedAt) : 'time not set';

  return (
    <Link href={{ pathname: '/medication/entry/[id]', params: { id: item.id } }} asChild>
      <Pressable
        testID={`journal-med-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={`Medication, ${item.summary}${item.notes ? ', has notes' : ''}`}
        // expo-router's <Link asChild> rejects array styles on its direct child
        // in dev mode — keep this flattened (mirrors EntryRow).
        style={StyleSheet.flatten([
          styles.row,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ])}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.time}>
          {timeLabel}
        </ThemedText>
        <View style={styles.body}>
          <ThemedText type="smallBold" numberOfLines={1}>
            💊 Medication
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {item.summary}
          </ThemedText>
        </View>
        {item.notes ? (
          // No separate accessibility node — the Pressable's own
          // accessibilityLabel above already includes "has notes".
          <ThemedText importantForAccessibility="no" style={styles.notesGlyph}>
            📝
          </ThemedText>
        ) : null}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  time: {
    width: 84,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  notesGlyph: {
    fontSize: 18,
  },
});
