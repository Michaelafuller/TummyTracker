import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import {
  computeInsights,
  type FoodFinding,
  type NutrientFinding,
  type TagFinding,
  type TemporalFinding,
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

function ingredientSentence(finding: TagFinding): string {
  return `Average sentiment ${finding.avgSentiment} across ${finding.occurrences} meals containing this ingredient.`;
}

function temporalSentence(finding: TemporalFinding): string {
  const pct = Math.round(finding.hitRate * 100);
  const basePct = Math.round(finding.baseRate * 100);
  return (
    `${finding.hits} of ${finding.meals} meals with this ingredient were followed by a ` +
    `rough outcome within 24 h (${pct}% vs ${basePct}% baseline).`
  );
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
  const insets = useSafeAreaInsets();
  const { summary, nutrientFindings, foodFindings, ingredientFindings, temporalFindings } = computeInsights(entries);
  const hasFindings =
    nutrientFindings.length > 0 ||
    foodFindings.length > 0 ||
    ingredientFindings.length > 0 ||
    temporalFindings.length > 0;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + BottomTabInset + Spacing.four },
        ]}>
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

        {ingredientFindings.length > 0 ? (
          <View style={styles.section}>
            <ThemedText type="subtitle">Ingredients you react to</ThemedText>
            {ingredientFindings.map((finding) => (
              <Card
                key={finding.tag}
                title={finding.tag}
                body={ingredientSentence(finding)}
                sample={`Based on ${finding.occurrences} meals.`}
              />
            ))}
          </View>
        ) : null}

        {temporalFindings.length > 0 ? (
          <View style={styles.section}>
            <ThemedText type="subtitle">Timing patterns</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Ingredients more often followed by a rough outcome (bad BM, symptom, or poor rating)
              within 24 hours. Observation only — not a diagnosis.
            </ThemedText>
            {temporalFindings.map((finding) => (
              <Card
                key={finding.tag}
                title={finding.tag}
                body={temporalSentence(finding)}
                sample={`Based on ${finding.meals} meals.`}
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
    paddingHorizontal: Spacing.four,
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
