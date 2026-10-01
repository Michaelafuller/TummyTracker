import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarMeter } from '@/components/charts/BarMeter';
import { BristolHistogram } from '@/components/charts/BristolHistogram';
import { CountBars } from '@/components/charts/CountBars';
import { IntakeBars } from '@/components/charts/IntakeBars';
import { FormScrollView } from '@/components/keyboard-aware-screen';
import { SETTINGS_BUTTON_CLEARANCE } from '@/components/settings-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import {
  analyzeSlowerPatterns,
  computeInsights,
  type NutrientOutcomeFinding,
  type OutcomeFinding,
} from '@/features/analysis/insights';
import { findingInstances, type DrilldownInstance } from '@/features/analysis/drilldown';
import {
  doseLine,
  doseSplit,
  groupComponentsByEntry,
  mealAmount,
  type DoseKind,
} from '@/features/analysis/doseResponse';
import { latencyLine, latencySummary } from '@/features/analysis/latency';
import {
  analyzeMedicationDays,
  confounderCaveat,
  medicationExposureDays,
  pairInstances,
  type ConfounderCaveat,
  type MedicationFinding,
  type MedicationNote,
} from '@/features/analysis/medications';
import {
  FACTOR_FOOTER,
  analyzeFactorDays,
  factorCaveat,
  factorCaveatSentence,
  factorDays,
  factorNoteSentence,
  factorSentence,
  visibleFactorRows,
} from '@/features/analysis/factors';
import { SLOW_WINDOW_MS } from '@/features/analysis/temporal';
import { useDayCheckIns } from '@/features/checkin/useDayCheckIns';
import { useDayFactors } from '@/features/checkin/useDayFactors';
import { useAllEntries, useAllMealComponents } from '@/features/logging/useEntries';
import { useMedicationDoses, useMedicationEvents, useMedications } from '@/features/medications/useMedicationData';
import { usePrefsStore } from '@/features/prefs/prefsStore';
import { WatchButton } from '@/features/watchlist/WatchButton';
import { WatchlistSection } from '@/features/watchlist/WatchlistSection';
import { useTheme } from '@/hooks/use-theme';
import { bmRegularity, bristolDistribution, weeklyBmCounts } from '@/lib/bmTrends';
import { weeklyIntake, weeklyOutcomes } from '@/lib/chartData';
import { COVERAGE_WINDOW_DAYS, dayCoverage } from '@/lib/dayCoverage';
import { medicationClass } from '@/lib/medicationClasses';
import { NUTRITION_NOUNS } from '@/lib/nutrition';
import type { ConfidenceTier } from '@/lib/stats';

/** "Days covered: 19 of 28 (last 28 days) · 6 checked in" — singular "day" when total is 1. */
function coverageSentence(covered: number, total: number, checkedIn: number): string {
  const dayNoun = total === 1 ? 'day' : 'days';
  return `Days covered: ${covered} of ${total} (last ${total} ${dayNoun}) · ${checkedIn} checked in`;
}

function confidenceLabel(confidence: ConfidenceTier): string {
  return confidence === 'high' ? 'High' : confidence === 'medium' ? 'Medium' : 'Low';
}

/** Shared sentence for an ingredient/food/pair outcome finding (24 h unless `windowHours` says otherwise). */
export function outcomeSentence(finding: OutcomeFinding, windowHours = 24): string {
  const pct = Math.round(finding.hitRate * 100);
  const basePct = Math.round(finding.baseRate * 100);
  return (
    `${finding.hits} of ${finding.occurrences} meals were followed by a rough outcome within ${windowHours} h ` +
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

const MEDICATION_FOOTER = "Days count only when you logged something. Linked doesn't mean caused.";

/** Sentence for a medication finding — never claims causation. */
export function medicationSentence(finding: MedicationFinding): string {
  const pct = Math.round(finding.exposedRate * 100);
  const otherPct = Math.round(finding.otherRate * 100);
  const window =
    medicationClass(finding.name) === 'antibiotic' ? 'during or within a week after' : 'on or after';
  return (
    `${finding.exposedRough} of ${finding.exposedDays} days ${window} ${finding.name.trim()} were rough ` +
    `(${pct}% vs ${otherPct}% on other logged days).`
  );
}

/** Line for a medication that can't be compared yet. */
export function medicationNoteSentence(note: MedicationNote): string {
  const name = note.name.trim();
  if (note.reason === 'nearly-every-day') {
    return `${name} — taken nearly every day, so there's nothing to compare against.`;
  }
  if (note.exposedDays === 0) return `${name} — no logged days so far.`;
  return `${name} — only ${note.exposedDays} logged ${note.exposedDays === 1 ? 'day' : 'days'} so far.`;
}

/** Caveat line inside a food/ingredient/combination card. */
export function caveatSentence(caveat: ConfounderCaveat): string {
  // Counts MEALS followed by a rough outcome (the card's own unit), not outcomes.
  return `${caveat.overlapping} of the ${caveat.hits} meals followed by a rough outcome were eaten while you were taking ${caveat.name.trim()}.`;
}

/** "Usually about 5 h later (3–8 h)" from a finding's instances, or null with fewer than 3 hits. */
function latencyFor(instances: readonly DrilldownInstance[]): string | null {
  const summary = latencySummary(
    instances.flatMap((instance) => (instance.outcomeDelayMs == null ? [] : [instance.outcomeDelayMs])),
  );
  return summary ? latencyLine(summary) : null;
}

const SLOWER_INTRO =
  'These only show up when counting outcomes up to 48 hours after eating — slower reactions.';

function ConfidenceChip({
  confidence,
  n,
  unit,
}: {
  confidence: ConfidenceTier;
  n: number;
  unit: 'meals' | 'days';
}) {
  const theme = useTheme();
  const backgroundColor =
    confidence === 'high' ? theme.primary : confidence === 'medium' ? theme.backgroundSelected : theme.border;
  const textColor = confidence === 'high' ? theme.primaryText : theme.text;
  return (
    <View style={[styles.chip, { backgroundColor }]}>
      <ThemedText
        type="small"
        style={[styles.chipText, { color: textColor }]}>{`${confidenceLabel(confidence)} confidence · ${n} ${unit}`}</ThemedText>
    </View>
  );
}

function CaveatLine({ text }: { text: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {text}
    </ThemedText>
  );
}

function Card({
  title,
  body,
  latency,
  dose,
  sample,
  confidence,
  n,
  unit = 'meals',
  children,
  onPress,
  pressLabel,
}: {
  title: string;
  body: string;
  /** Typical reaction time, e.g. "Usually about 5 h later (3–8 h)" (#21). */
  latency?: string | null;
  /** Dose-response line, shown only for a clear increase with amount (#22). */
  dose?: string | null;
  sample?: string;
  confidence?: ConfidenceTier;
  n?: number;
  /** What `n` counts — meals for food findings, days for medication findings. */
  unit?: 'meals' | 'days';
  children?: React.ReactNode;
  onPress?: () => void;
  pressLabel?: string;
}) {
  const theme = useTheme();
  const content = (
    <>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small">{body}</ThemedText>
      {latency ? (
        <ThemedText type="small" themeColor="textSecondary">
          {latency}
        </ThemedText>
      ) : null}
      {dose ? (
        <ThemedText type="small" themeColor="textSecondary">
          {dose}
        </ThemedText>
      ) : null}
      {sample ? (
        <ThemedText type="small" themeColor="textSecondary">
          {sample}
        </ThemedText>
      ) : null}
      {confidence != null && n != null ? <ConfidenceChip confidence={confidence} n={n} unit={unit} /> : null}
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
  const mealComponents = useAllMealComponents();
  const checkIns = useDayCheckIns();
  const factorRows = useDayFactors();
  const trackPeriod = usePrefsStore((s) => s.trackPeriod);
  const meds = useMedications();
  const medEvents = useMedicationEvents();
  const medDoses = useMedicationDoses();
  const insets = useSafeAreaInsets();
  const insights = computeInsights(entries);
  const { summary, nutrientFindings, foodFindings, ingredientFindings, pairFindings } = insights;
  // A second, guarded window (#21): only medium/high findings that the 24 h
  // sections do not already show. See analyzeSlowerPatterns.
  const slower = analyzeSlowerPatterns(entries, insights);
  const hasSlowerPatterns =
    slower.ingredientFindings.length > 0 || slower.pairFindings.length > 0 || slower.foodFindings.length > 0;
  // Lazy-init so Date.now() is read once per mount, not on every render pass
  // (the render function itself must stay pure/idempotent).
  const [now] = useState(() => Date.now());
  // Medication exposure and findings are computed once per data change and
  // shared by the Medications section and the confounder caveats (#20).
  const exposure = useMemo(() => medicationExposureDays(meds, medEvents, medDoses), [meds, medEvents, medDoses]);
  // Daily factors (#23): only rows with something visible logged — period is
  // blanked while tracking is off — so a factor-logged day counts as covered.
  const visibleFactors = useMemo(() => visibleFactorRows(factorRows, { trackPeriod }), [factorRows, trackPeriod]);
  const medicationAnalysis = useMemo(
    () => analyzeMedicationDays(entries, checkIns, meds, medEvents, medDoses, visibleFactors),
    [entries, checkIns, meds, medEvents, medDoses, visibleFactors],
  );
  const factorAnalysis = useMemo(
    () => analyzeFactorDays(entries, checkIns, visibleFactors, { trackPeriod }),
    [entries, checkIns, visibleFactors, trackPeriod],
  );
  const factorDayMap = useMemo(() => factorDays(visibleFactors, { trackPeriod }), [visibleFactors, trackPeriod]);
  // Dose-response (#22): servings come from the component rows, grouped once.
  const componentsByEntry = useMemo(() => groupComponentsByEntry(mealComponents), [mealComponents]);
  /** A card's dose line — only for a clear increase; null otherwise. */
  const doseFor = (instances: readonly DrilldownInstance[], kind: DoseKind, value: string): string | null => {
    const split = doseSplit(instances, (entry) =>
      mealAmount(entry, componentsByEntry.get(entry.id) ?? [], kind, value),
    );
    return split?.clearIncrease ? doseLine(split, kind) : null;
  };
  /** A card's confounder lines: the medication caveat (#20), then the daily-factor caveat (#23). */
  const caveatsFor = (instances: Parameters<typeof confounderCaveat>[0]): string[] => {
    const lines: string[] = [];
    if (exposure.size > 0) {
      const caveat = confounderCaveat(instances, exposure, meds);
      if (caveat) lines.push(caveatSentence(caveat));
    }
    if (factorDayMap.size > 0) {
      const caveat = factorCaveat(instances, factorDayMap);
      if (caveat) lines.push(factorCaveatSentence(caveat));
    }
    return lines;
  };
  const hasMedicationSection = medicationAnalysis.findings.length > 0 || medicationAnalysis.notes.length > 0;
  const hasFactorSection = factorAnalysis.findings.length > 0 || factorAnalysis.notes.length > 0;
  const coverage = dayCoverage(entries, checkIns, now, COVERAGE_WINDOW_DAYS, visibleFactors);
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
    pairFindings.length > 0 ||
    hasSlowerPatterns ||
    medicationAnalysis.findings.length > 0 ||
    factorAnalysis.findings.length > 0;

  return (
    <ThemedView style={styles.container}>
      <FormScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + BottomTabInset + Spacing.four },
        ]}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.disclaimer}>
          These are observations from your own logs — patterns, not medical advice. Talk to a
          professional about anything that concerns you.
        </ThemedText>

        <View style={styles.summary}>
          <ThemedText type="smallBold">Your journal so far</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {`${summary.totalEntries} entries · ${summary.foodEntries} food · ${summary.bmEntries} BM · ${summary.symptomEntries} symptoms · ${summary.roughOutcomes} rough outcomes`}
          </ThemedText>
          {coverage != null ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                {coverageSentence(coverage.covered, coverage.total, coverage.checkedIn)}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {visibleFactors.length > 0
                  ? 'A day counts when you logged something, answered the day check-in, or added day details.'
                  : 'A day counts when you logged something or answered the day check-in.'}
              </ThemedText>
            </>
          ) : null}
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
            {ingredientFindings.map((finding) => {
              const instances = findingInstances(entries, 'tag', finding.key);
              const caveats = caveatsFor(instances);
              return (
                <Card
                  key={finding.key}
                  title={finding.label}
                  body={outcomeSentence(finding)}
                  latency={latencyFor(instances)}
                  dose={doseFor(instances, 'tag', finding.key)}
                  confidence={finding.confidence}
                  n={finding.occurrences}
                  onPress={() =>
                    router.push({ pathname: '/insight/detail', params: { kind: 'tag', value: finding.label } })
                  }
                  pressLabel={`See all logs: ${finding.label}`}>
                  <BarMeter label={finding.label} rate={finding.hitRate} baseRate={finding.baseRate} />
                  {caveats.map((line) => (
                    <CaveatLine key={line} text={line} />
                  ))}
                  <WatchButton tag={finding.label} />
                </Card>
              );
            })}
          </View>
        ) : null}

        {pairFindings.length > 0 ? (
          <View style={styles.section}>
            <ThemedText type="subtitle">Combinations</ThemedText>
            {pairFindings.map((finding) => {
              const instances = pairInstances(entries, finding.key);
              const caveats = caveatsFor(instances);
              return (
                <Card
                  key={finding.key}
                  title={finding.label}
                  body={outcomeSentence(finding)}
                  latency={latencyFor(instances)}
                  confidence={finding.confidence}
                  n={finding.occurrences}>
                  <BarMeter label={finding.label} rate={finding.hitRate} baseRate={finding.baseRate} />
                  {caveats.map((line) => (
                    <CaveatLine key={line} text={line} />
                  ))}
                </Card>
              );
            })}
          </View>
        ) : null}

        {foodFindings.length > 0 ? (
          <View style={styles.section}>
            <ThemedText type="subtitle">Foods linked to rough outcomes</ThemedText>
            {foodFindings.map((finding) => {
              const instances = findingInstances(entries, 'food', finding.label);
              const caveats = caveatsFor(instances);
              return (
                <Card
                  key={finding.key}
                  title={finding.label}
                  body={outcomeSentence(finding)}
                  latency={latencyFor(instances)}
                  dose={doseFor(instances, 'food', finding.label)}
                  confidence={finding.confidence}
                  n={finding.occurrences}
                  onPress={() =>
                    router.push({ pathname: '/insight/detail', params: { kind: 'food', value: finding.label } })
                  }
                  pressLabel={`See all logs: ${finding.label}`}>
                  <BarMeter label={finding.label} rate={finding.hitRate} baseRate={finding.baseRate} />
                  {caveats.map((line) => (
                    <CaveatLine key={line} text={line} />
                  ))}
                </Card>
              );
            })}
          </View>
        ) : null}

        {hasSlowerPatterns ? (
          <View style={styles.section}>
            <ThemedText type="subtitle">Slower patterns (within 48 h)</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {SLOWER_INTRO}
            </ThemedText>
            {slower.ingredientFindings.map((finding) => {
              const instances = findingInstances(entries, 'tag', finding.key, SLOW_WINDOW_MS);
              return (
                <Card
                  key={`ingredient-${finding.key}`}
                  title={finding.label}
                  body={outcomeSentence(finding, 48)}
                  latency={latencyFor(instances)}
                  dose={doseFor(instances, 'tag', finding.key)}
                  confidence={finding.confidence}
                  n={finding.occurrences}
                  onPress={() =>
                    router.push({
                      pathname: '/insight/detail',
                      params: { kind: 'tag', value: finding.label, window: '48' },
                    })
                  }
                  pressLabel={`See all logs: ${finding.label}`}>
                  <BarMeter label={finding.label} rate={finding.hitRate} baseRate={finding.baseRate} />
                </Card>
              );
            })}
            {slower.pairFindings.map((finding) => (
              <Card
                key={`pair-${finding.key}`}
                title={finding.label}
                body={outcomeSentence(finding, 48)}
                latency={latencyFor(pairInstances(entries, finding.key, SLOW_WINDOW_MS))}
                confidence={finding.confidence}
                n={finding.occurrences}>
                <BarMeter label={finding.label} rate={finding.hitRate} baseRate={finding.baseRate} />
              </Card>
            ))}
            {slower.foodFindings.map((finding) => {
              const instances = findingInstances(entries, 'food', finding.label, SLOW_WINDOW_MS);
              return (
                <Card
                  key={`food-${finding.key}`}
                  title={finding.label}
                  body={outcomeSentence(finding, 48)}
                  latency={latencyFor(instances)}
                  dose={doseFor(instances, 'food', finding.label)}
                  confidence={finding.confidence}
                  n={finding.occurrences}
                  onPress={() =>
                    router.push({
                      pathname: '/insight/detail',
                      params: { kind: 'food', value: finding.label, window: '48' },
                    })
                  }
                  pressLabel={`See all logs: ${finding.label}`}>
                  <BarMeter label={finding.label} rate={finding.hitRate} baseRate={finding.baseRate} />
                </Card>
              );
            })}
          </View>
        ) : null}

        {hasMedicationSection ? (
          <View style={styles.section}>
            <ThemedText type="subtitle">Medications linked to rough days</ThemedText>
            {medicationAnalysis.findings.map((finding) => (
              <Card
                key={finding.medicationId}
                title={finding.name}
                body={medicationSentence(finding)}
                confidence={finding.confidence}
                n={finding.exposedDays}
                unit="days"
              />
            ))}
            {medicationAnalysis.notes.map((note) => (
              <ThemedText key={note.medicationId} type="small" themeColor="textSecondary">
                {medicationNoteSentence(note)}
              </ThemedText>
            ))}
            <ThemedText type="small" themeColor="textSecondary">
              {MEDICATION_FOOTER}
            </ThemedText>
          </View>
        ) : null}

        {hasFactorSection ? (
          <View style={styles.section}>
            <ThemedText type="subtitle">Daily factors linked to rough days</ThemedText>
            {factorAnalysis.findings.map((finding) => (
              <Card
                key={finding.key}
                title={finding.label}
                body={factorSentence(finding)}
                confidence={finding.confidence}
                n={finding.flaggedDays}
                unit="days"
              />
            ))}
            {factorAnalysis.notes.map((note) => (
              <ThemedText key={note.key} type="small" themeColor="textSecondary">
                {factorNoteSentence(note)}
              </ThemedText>
            ))}
            <ThemedText type="small" themeColor="textSecondary">
              {FACTOR_FOOTER}
            </ThemedText>
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
  // First thing on the screen, with no title row above it — keep its text out
  // from under the floating Settings gear (top-right overlay).
  disclaimer: {
    paddingRight: SETTINGS_BUTTON_CLEARANCE - Spacing.four,
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
