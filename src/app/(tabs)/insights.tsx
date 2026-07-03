import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarMeter } from '@/components/charts/BarMeter';
import { MiniHistogram } from '@/components/charts/MiniHistogram';
import { TrendBars } from '@/components/charts/TrendBars';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import {
  computeInsights,
  type FoodFinding,
  type NutrientFinding,
  type PairFinding,
  type TagFinding,
  type TemporalFinding,
} from '@/features/analysis/insights';
import { useAllEntries } from '@/features/logging/useEntries';
import { useTheme } from '@/hooks/use-theme';
import { weeklySentiment } from '@/lib/chartData';
import { NUTRITION_NOUNS } from '@/lib/nutrition';
import type { ConfidenceTier } from '@/lib/stats';

function confidenceLabel(confidence: ConfidenceTier): string {
  return confidence === 'high' ? 'High' : confidence === 'medium' ? 'Medium' : 'Low';
}

export function nutrientSentence(finding: NutrientFinding): string {
  return (
    `Meals higher in ${NUTRITION_NOUNS[finding.nutrient]} (≥ ${finding.thresholdValue}) average a ` +
    `sentiment of ${finding.highAvgSentiment}, versus ${finding.lowAvgSentiment} otherwise.`
  );
}

export function foodSentence(finding: FoodFinding): string {
  return `${finding.name} averages ${finding.avgSentiment} vs your usual ${finding.baselineAvg}, across ${finding.occurrences} logs.`;
}

export function ingredientSentence(finding: TagFinding): string {
  return `Averages ${finding.avgSentiment} vs your usual ${finding.baselineAvg}, across ${finding.occurrences} meals containing this ingredient.`;
}

export function pairSentence(finding: PairFinding): string {
  return `${finding.tags[0]} + ${finding.tags[1]} together average ${finding.avgSentiment} vs your usual ${finding.baselineAvg}, across ${finding.occurrences} meals.`;
}

export function temporalSentence(finding: TemporalFinding): string {
  const pct = Math.round(finding.hitRate * 100);
  const basePct = Math.round(finding.baseRate * 100);
  return (
    `${finding.hits} of ${finding.meals} meals with this ingredient were followed by a ` +
    `rough outcome within 24 h (${pct}% vs ${basePct}% baseline).`
  );
}

function ConfidenceChip({ confidence, n }: { confidence: ConfidenceTier; n: number }) {
  const theme = useTheme();
  const backgroundColor =
    confidence === 'high' ? theme.primary : confidence === 'medium' ? theme.backgroundSelected : theme.border;
  const textColor = confidence === 'high' ? theme.primaryText : theme.text;
  return (
    <View style={[styles.chip, { backgroundColor }]}>
      <ThemedText
        type="small"
        style={[styles.chipText, { color: textColor }]}>{`${confidenceLabel(confidence)} confidence · ${n} meals`}</ThemedText>
    </View>
  );
}

function Card({
  title,
  body,
  sample,
  confidence,
  n,
  histogram,
  children,
}: {
  title: string;
  body: string;
  sample?: string;
  confidence?: ConfidenceTier;
  n?: number;
  histogram?: readonly [number, number, number, number, number];
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small">{body}</ThemedText>
      {sample ? (
        <ThemedText type="small" themeColor="textSecondary">
          {sample}
        </ThemedText>
      ) : null}
      {confidence != null && n != null ? <ConfidenceChip confidence={confidence} n={n} /> : null}
      {histogram ? <MiniHistogram counts={histogram} /> : null}
      {children}
    </View>
  );
}

export default function InsightsScreen() {
  const entries = useAllEntries();
  const insets = useSafeAreaInsets();
  const {
    summary,
    nutrientFindings,
    foodFindings,
    ingredientFindings,
    pairFindings,
    temporalFindings,
  } = computeInsights(entries);
  // Lazy-init so Date.now() is read once per mount, not on every render pass
  // (the render function itself must stay pure/idempotent).
  const [now] = useState(() => Date.now());
  const trendBuckets = weeklySentiment(entries, now);
  const hasTrendData = trendBuckets.some((b) => b.avg != null);
  const hasFindings =
    nutrientFindings.length > 0 ||
    foodFindings.length > 0 ||
    ingredientFindings.length > 0 ||
    pairFindings.length > 0 ||
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
            {`${summary.totalEntries} entries · ${summary.foodEntries} food · ${summary.bmEntries} BM · ${summary.ratedEntries} rated${summary.averageSentiment != null ? ` · avg sentiment ${summary.averageSentiment}` : ''}`}
          </ThemedText>
        </View>

        {hasTrendData ? (
          <View style={styles.section}>
            <ThemedText type="subtitle">Trend</ThemedText>
            <TrendBars buckets={trendBuckets} />
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
                confidence={finding.confidence}
                n={finding.occurrences}
                histogram={finding.sentimentCounts}
              />
            ))}
          </View>
        ) : null}

        {pairFindings.length > 0 ? (
          <View style={styles.section}>
            <ThemedText type="subtitle">Combinations</ThemedText>
            {pairFindings.map((finding) => (
              <Card
                key={`${finding.tags[0]}+${finding.tags[1]}`}
                title={`${finding.tags[0]} + ${finding.tags[1]}`}
                body={pairSentence(finding)}
                confidence={finding.confidence}
                n={finding.occurrences}
                histogram={finding.sentimentCounts}
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
                confidence={finding.confidence}
                n={finding.occurrences}
                histogram={finding.sentimentCounts}
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
                confidence={finding.confidence}
                n={finding.meals}>
                <BarMeter label={finding.tag} rate={finding.hitRate} baseRate={finding.baseRate} />
              </Card>
            ))}
          </View>
        ) : null}

        {nutrientFindings.length > 0 ? (
          <View style={styles.section}>
            <ThemedText type="subtitle">Nutrients</ThemedText>
            {nutrientFindings.map((finding) => (
              <Card
                key={finding.nutrient}
                title={`Higher ${NUTRITION_NOUNS[finding.nutrient]}`}
                body={nutrientSentence(finding)}
                sample={`Based on ${finding.sampleSize} higher-${NUTRITION_NOUNS[finding.nutrient]} meals.`}
                confidence={finding.confidence}
                n={finding.sampleSize}
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
    borderWidth: StyleSheet.hairlineWidth,
  },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: Spacing.four,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
  },
  chipText: {
    fontWeight: '700',
  },
});
