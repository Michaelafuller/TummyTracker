import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { LogEntry } from '@/db/schema';
import { isSentimentValue, sentimentEmoji, sentimentLabel } from '@/features/sentiment/scale';
import { useTheme } from '@/hooks/use-theme';
import { formatTimeInput } from '@/lib/datetime';

function subtitle(entry: LogEntry): string {
  const parts: string[] = [entry.type[0].toUpperCase() + entry.type.slice(1)];
  if (entry.mealSlot) parts.push(entry.mealSlot);
  if (entry.calories != null) parts.push(`${entry.calories} kcal`);
  return parts.join(' · ');
}

export function EntryRow({ entry }: { entry: LogEntry }) {
  const theme = useTheme();
  const sentiment = isSentimentValue(entry.sentiment) ? entry.sentiment : null;

  return (
    <Link href={`/entry/${entry.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${entry.name}, ${subtitle(entry)}, ${
          sentiment ? `rated ${sentimentLabel(sentiment)}` : 'not rated'
        }`}
        style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.time}>
          {formatTimeInput(entry.loggedAt)}
        </ThemedText>
        <View style={styles.body}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {entry.name || 'Untitled'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle(entry)}
          </ThemedText>
        </View>
        <ThemedText style={styles.emoji}>{sentiment ? sentimentEmoji(sentiment) : '·'}</ThemedText>
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
  },
  time: {
    width: 44,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  emoji: {
    fontSize: 24,
    lineHeight: 30,
  },
});
