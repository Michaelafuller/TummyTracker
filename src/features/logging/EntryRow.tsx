import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { LogEntry } from '@/db/schema';
import { isBristolValue } from '@/features/bm/bristol';
import { isSentimentValue, sentimentEmoji, sentimentLabel } from '@/features/sentiment/scale';
import { isSeverityValue } from '@/features/symptoms/severity';
import { isSymptomTypeValue, symptomTypeLabel } from '@/features/symptoms/symptomTypes';
import { useTheme } from '@/hooks/use-theme';
import { formatTimeInput } from '@/lib/datetime';

const TYPE_EMOJI: Partial<Record<string, string>> = {
  bowel_movement: '💩',
  symptom: '🤢',
};

function subtitle(entry: LogEntry): string {
  if (entry.type === 'bowel_movement') {
    const parts: string[] = ['Bowel movement'];
    if (isBristolValue(entry.bristolScale)) parts.push(`Type ${entry.bristolScale}`);
    return parts.join(' · ');
  }
  if (entry.type === 'symptom') {
    const parts: string[] = ['Symptom'];
    if (isSymptomTypeValue(entry.symptomType)) parts.push(symptomTypeLabel(entry.symptomType));
    if (isSeverityValue(entry.severity)) parts.push(`Severity ${entry.severity}`);
    return parts.join(' · ');
  }
  const parts: string[] = [entry.type[0].toUpperCase() + entry.type.slice(1)];
  if (entry.mealSlot) parts.push(entry.mealSlot);
  if (entry.calories != null) parts.push(`${entry.calories} kcal`);
  return parts.join(' · ');
}

export function EntryRow({ entry }: { entry: LogEntry }) {
  const theme = useTheme();
  const sentiment = isSentimentValue(entry.sentiment) ? entry.sentiment : null;
  const emoji = TYPE_EMOJI[entry.type];

  return (
    <Link href={`/entry/${entry.id}`} asChild>
      <Pressable
        testID={`entry-row-${(entry.name || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
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
            {emoji ? `${emoji} ${entry.name}` : entry.name || 'Untitled'}
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
