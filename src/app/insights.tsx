import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  computeInsights,
  type FoodFinding,
  type NutrientFinding,
} from '@/features/analysis/insights';
import { useAllEntries } from '@/features/logging/useEntries';
import { useTheme } from '@/hooks/use-theme';
import { NUTRITION_NOUNS } from '@/lib/nutrition';

function nutrientSentence(finding: NutrientFinding): string {
  return (
    `Meals higher in ${NUTRITION_NOUNS[finding.nutrient]} (≥ ${finding.thresholdValue}) average a ` +
    `sentiment of ${finding.highAvgSentiment}, versus ${finding.lowAvgSentiment} otherwise.`
  );
}

function foodSentence(finding: FoodFinding): string {
  return `${finding.name}: average sentiment ${finding.avgSentiment} across ${finding.occurrences} logs.`;
}

function Card({ title, body, sample }: { title: string; body: string; sample: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small">{body}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {sample}
      </ThemedText>
    </View>
  );
}

export default function InsightsScreen() {
  const entries = useAllEntries();
  const { summary, nutrientFindings, foodFindings } = computeInsights(entries);
  const hasFindings = nutrientFindings.length > 0 || foodFindings.length > 0;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          These are observations from your own logs — patterns, not medical advice. Talk to a
          professional about anything that concerns you.
        </ThemedText>

        <View style={styles.summary}>
          <ThemedText type="smallBold">Your journal so far</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {summary.totalEntries} entries · {summary.foodEntries} food · {summary.bmEntries} BM ·{' '}
            {summary.ratedEntries} rated
            {summary.averageSentiment != null
              ? ` · avg sentiment ${summary.averageSentiment}`
              : ''}
          </ThemedText>
        </View>

        {nutrientFindings.length > 0 ? (
          <View style={styles.section}>
            <ThemedText type="subtitle">Nutrients</ThemedText>
            {nutrientFindings.map((finding) => (
              <Card
                key={finding.nutrient}
                title={`Higher ${NUTRITION_NOUNS[finding.nutrient]}`}
                body={nutrientSentence(finding)}
                sample={`Based on ${finding.sampleSize} higher-${NUTRITION_NOUNS[finding.nutrient]} meals.`}
              />
            ))}
          </View>
        ) : null}

        {foodFindings.length > 0 ? (
          <View style={styles.section}>
            <ThemedText type="subtitle">Foods you rate poorly</ThemedText>
            {foodFindings.map((finding) => (
              <Card
                key={finding.name}
                title={finding.name}
                body={foodSentence(finding)}
                sample={`Based on ${finding.occurrences} logs.`}
              />
            ))}
          </View>
        ) : null}

        {!hasFindings ? (
          <View style={styles.section}>
            <ThemedText type="smallBold">Not enough data yet</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Keep logging meals and rating how they sit with you. Patterns appear once a few foods
              or nutrients have enough rated entries.
            </ThemedText>
          </View>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  summary: {
    gap: Spacing.one,
  },
  section: {
    gap: Spacing.two,
  },
  card: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
});
