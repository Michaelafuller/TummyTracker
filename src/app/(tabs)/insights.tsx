import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarMeter } from '@/components/charts/BarMeter';
import { BristolHistogram } from '@/components/charts/BristolHistogram';
import { CountBars } from '@/components/charts/CountBars';
import { IntakeBars } from '@/components/charts/IntakeBars';
import { FormScrollView } from '@/components/keyboard-aware-screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import {
  computeInsights,
  type NutrientOutcomeFinding,
  type OutcomeFinding,
} from '@/features/analysis/insights';
import { useAllEntries } from '@/features/logging/useEntries';
import { WatchButton } from '@/features/watchlist/WatchButton';
import { WatchlistSection } from '@/features/watchlist/WatchlistSection';
import { useTheme } from '@/hooks/use-theme';
import { bmRegularity, bristolDistribution, weeklyBmCounts } from '@/lib/bmTrends';
import { weeklyIntake, weeklyOutcomes } from '@/lib/chartData';
import { NUTRITION_NOUNS } from '@/lib/nutrition';
import type { ConfidenceTier } from '@/lib/stats';

function confidenceLabel(confidence: ConfidenceTier): string {
  return confidence === 'high' ? 'High' : confidence === 'medium' ? 'Medium' : 'Low';
}

/** Shared sentence for an ingredient/food/pair outcome finding. */
export function outcomeSentence(finding: OutcomeFinding): string {
  const pct = Math.round(finding.hitRate * 100);
  const basePct = Math.round(finding.baseRate * 100);
  return (
    `${finding.hits} of ${finding.occurrences} meals were followed by a rough outcome within 24 h ` +
    `(${pct}% vs ${basePct}% baseline).`
  );
}

export function nutrientSentence(finding: NutrientOutcomeFinding): string {
  const pct = Math.round(finding.highRate * 100);
  const basePct = Math.round(finding.lowRate * 100);
  return (
    `Meals higher in ${NUTRITION_NOUNS[finding.nutrient]} (≥ ${finding.thresholdValue}) are followed by a ` +
    `rough outcome ${pct}% of the time, vs ${basePct}% for lighter meals.`
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
  children,
  onPress,
  pressLabel,
}: {
  title: string;
  body: string;
  sample?: string;
  confidence?: ConfidenceTier;
  n?: number;
  children?: React.ReactNode;
  onPress?: () => void;
  pressLabel?: string;
}) {
  const theme = useTheme();
  const content = (
    <>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small">{body}</ThemedText>
      {sample ? (
        <ThemedText type="small" themeColor="textSecondary">
          {sample}
        </ThemedText>
      ) : null}
      {confidence != null && n != null ? <ConfidenceChip confidence={confidence} n={n} /> : null}
      {children}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={pressLabel}
        onPress={onPress}
        style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {content}
    </View>
  );
}

export default function InsightsScreen() {
  const router = useRouter();
  const entries = useAllEntries();
  const insets = useSafeAreaInsets();
  const { summary, nutrientFindings, foodFindings, ingredientFindings, pairFindings } = computeInsights(entries);
  // Lazy-init so Date.now() is read once per mount, not on every render pass
  // (the render function itself must stay pure/idempotent).
  const [now] = useState(() => Date.now());
  const roughOutcomeBuckets = weeklyOutcomes(entries, now);
  const hasRoughOutcomeData = roughOutcomeBuckets.some((b) => b.count > 0);
  const regularity = bmRegularity(entries, now);
  const caloriesBuckets = weeklyIntake(entries, now, 'calories');
  const fiberBuckets = weeklyIntake(entries, now, 'fiberG');
  const hasCaloriesData = caloriesBuckets.some((b) => b.avg != null);
  const hasFiberData = fiberBuckets.some((b) => b.avg != null);
  const hasFindings =
    nutrientFindings.length > 0 ||
    foodFindings.length > 0 ||
    ingredientFindings.length > 0 ||
    pairFindings.length > 0;

  return (
    <ThemedView style={styles.container}>
      <FormScrollView
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
            {`${summary.totalEntries} entries · ${summary.foodEntries} food · ${summary.bmEntries} BM · ${summary.symptomEntries} symptoms · ${summary.roughOutcomes} rough outcomes`}
          </ThemedText>
        </View>

        {hasRoughOutcomeData ? (
          <View style={styles.section}>
            <ThemedText type="subtitle">Rough outcomes</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Bad BMs, low-rated BMs, and stronger symptoms per week.
            </ThemedText>
            <CountBars buckets={roughOutcomeBuckets} />
          </View>
        ) : null}

        {summary.bmEntries > 0 ? (
          <View style={styles.section}>
            <ThemedText type="subtitle">Digestion</ThemedText>
            {regularity != null ? (
              <ThemedText type="small" themeColor="textSecondary">
                {`≈${regularity.perDay} BMs/day over the last 28 days — ${regularity.typical} typical · ${regularity.hard} hard (1–2) · ${regularity.loose} loose (6–7).`}
              </ThemedText>
            ) : null}
            <CountBars buckets={weeklyBmCounts(entries, now)} />
            <BristolHistogram counts={bristolDistribution(entries, now)} />
          </View>
        ) : null}

        {hasCaloriesData || hasFiberData ? (
          <View style={styles.section}>
            <ThemedText type="subtitle">Intake</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Counts only entries with logged nutrition — sparse logging reads low.
            </ThemedText>
            {hasCaloriesData ? (
              <>
                <ThemedText type="smallBold">Calories</ThemedText>
                <IntakeBars buckets={caloriesBuckets} noun="calories" unit="kcal" />
              </>
            ) : null}
            {hasFiberData ? (
              <>
                <ThemedText type="smallBold">Fiber</ThemedText>
                <IntakeBars buckets={fiberBuckets} noun="fiber" unit="g" />
              </>
            ) : null}
          </View>
        ) : null}

        <WatchlistSection entries={entries} now={now} />

        {ingredientFindings.length > 0 ? (
          <View style={styles.section}>
            <ThemedText type="subtitle">Ingredients linked to rough outcomes</ThemedText>
            {ingredientFindings.map((finding) => (
              <Card
                key={finding.key}
                title={finding.label}
                body={outcomeSentence(finding)}
                confidence={finding.confidence}
                n={finding.occurrences}
                onPress={() =>
                  router.push({ pathname: '/insight/detail', params: { kind: 'tag', value: finding.label } })
                }
                pressLabel={`See all logs: ${finding.label}`}>
                <BarMeter label={finding.label} rate={finding.hitRate} baseRate={finding.baseRate} />
                <WatchButton tag={finding.label} />
              </Card>
            ))}
          </View>
        ) : null}

        {pairFindings.length > 0 ? (
          <View style={styles.section}>
            <ThemedText type="subtitle">Combinations</ThemedText>
            {pairFindings.map((finding) => (
              <Card key={finding.key} title={finding.label} body={outcomeSentence(finding)} confidence={finding.confidence} n={finding.occurrences}>
                <BarMeter label={finding.label} rate={finding.hitRate} baseRate={finding.baseRate} />
              </Card>
            ))}
          </View>
        ) : null}

        {foodFindings.length > 0 ? (
          <View style={styles.section}>
            <ThemedText type="subtitle">Foods linked to rough outcomes</ThemedText>
            {foodFindings.map((finding) => (
              <Card
                key={finding.key}
                title={finding.label}
                body={outcomeSentence(finding)}
                confidence={finding.confidence}
                n={finding.occurrences}
                onPress={() =>
                  router.push({ pathname: '/insight/detail', params: { kind: 'food', value: finding.label } })
                }
                pressLabel={`See all logs: ${finding.label}`}>
                <BarMeter label={finding.label} rate={finding.hitRate} baseRate={finding.baseRate} />
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
              Keep logging meals — and log symptoms and bowel movements when they happen. Patterns
              appear once a few ingredients or foods have been followed by enough outcomes to
              compare.
            </ThemedText>
          </View>
        ) : null}
      </FormScrollView>
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
