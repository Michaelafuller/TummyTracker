import { Fragment, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing, type ThemeColor } from '@/constants/theme';
import { CheckInSection } from '@/features/goals/CheckInSection';
import { GoalsSection } from '@/features/goals/GoalsSection';
import { useAllEntries } from '@/features/logging/useEntries';
import { useGoalsStore } from '@/features/goals/goalsStore';
import { nutrientContributions, tallyDailyNutrition } from '@/lib/dailyTally';
import { dayBounds, formatLongDate, formatTime12h } from '@/lib/datetime';
import { evaluateGoals, type GoalEvaluation } from '@/lib/goals';
import { NUTRITION_LABELS, nutritionUnit } from '@/lib/nutrition';
import { NUTRITION_FIELDS, type NutritionField } from '@/lib/validation';
import { useTheme } from '@/hooks/use-theme';

function entriesSummary(entryCount: number): string {
  return `From ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'} today`;
}

/** floor met / cap within -> positive; floor unmet -> neutral; cap exceeded -> danger. */
function progressColor(evaluation: GoalEvaluation): ThemeColor {
  if (evaluation.met) return 'primary';
  return evaluation.goal.direction === 'cap' ? 'danger' : 'textSecondary';
}

export default function GoalsScreen() {
  const entries = useAllEntries();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Lazy-init so Date.now() is read once per mount, not on every render pass
  // (the render function itself must stay pure/idempotent).
  const [now] = useState(() => Date.now());
  const { start, end } = dayBounds(now);
  const tally = tallyDailyNutrition(entries, start, end);
  const theme = useTheme();

  const goals = useGoalsStore((state) => state.goals);
  const evaluationByField = new Map<NutritionField, GoalEvaluation>(
    evaluateGoals(goals, tally).map((evaluation) => [evaluation.goal.nutrient, evaluation] as const),
  );

  // One tally row open at a time (mirrors GoalsSection.toggleExpand's idiom).
  // Not memoized: this is a tiny per-day list, cheap to recompute on every render.
  const [expandedField, setExpandedField] = useState<NutritionField | null>(null);
  const expandedContributions = expandedField ? nutrientContributions(entries, expandedField, start, end) : null;

  function toggleExpandedField(field: NutritionField) {
    setExpandedField((current) => (current === field ? null : field));
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + BottomTabInset + Spacing.four },
        ]}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Today</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatLongDate(now)}
          </ThemedText>
        </View>

        {tally.entryCount === 0 ? (
          <View style={styles.section}>
            <ThemedText type="smallBold">Nothing logged yet today</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Log a meal or snack to see today&apos;s nutrition tally here.
            </ThemedText>
          </View>
        ) : (
          <View style={styles.section}>
            <ThemedText type="small" themeColor="textSecondary" accessibilityLabel={entriesSummary(tally.entryCount)}>
              {entriesSummary(tally.entryCount)}
            </ThemedText>
            <View style={[styles.table, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              {NUTRITION_FIELDS.map((field) => {
                const nutrient = tally.nutrients[field];
                const label = NUTRITION_LABELS[field];
                const evaluation = evaluationByField.get(field);
                const unit = nutritionUnit(field);
                const valueText = nutrient.total == null ? '—' : String(nutrient.total);
                // Goal-aware progress replaces the plain total once a goal exists for this nutrient.
                const progressText = evaluation
                  ? `${evaluation.total}${unit} / ${evaluation.goal.threshold}${unit}`
                  : valueText;
                const caveat =
                  nutrient.missingCount > 0
                    ? `${nutrient.missingCount} ${nutrient.missingCount === 1 ? 'entry' : 'entries'} missing`
                    : null;
                const goalCaveat = evaluation
                  ? `, ${evaluation.goal.direction === 'floor' ? 'at least' : 'at most'} ${evaluation.goal.threshold}${unit} — ${evaluation.met ? 'met' : evaluation.goal.direction === 'cap' ? 'exceeded' : 'not yet met'}`
                  : '';
                const accessibilityLabel =
                  (nutrient.total == null
                    ? `${label}: no data logged today`
                    : caveat != null
                      ? `${label}: ${nutrient.total}, ${caveat}`
                      : `${label}: ${nutrient.total}`) + goalCaveat;
                const isExpanded = expandedField === field;

                return (
                  <Fragment key={field}>
                    <Pressable
                      style={[styles.row, { borderColor: theme.border }]}
                      accessible
                      accessibilityLabel={accessibilityLabel}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isExpanded }}
                      accessibilityHint="Shows the entries that make up this total"
                      testID={`tally-row-${field}`}
                      onPress={() => toggleExpandedField(field)}>
                      <View style={styles.rowLabel}>
                        <ThemedText type="small">{label}</ThemedText>
                        {caveat != null ? (
                          <ThemedText type="small" themeColor="textSecondary">
                            {caveat}
                          </ThemedText>
                        ) : null}
                      </View>
                      <View style={styles.rowValue}>
                        <ThemedText type="smallBold" themeColor={evaluation ? progressColor(evaluation) : undefined}>
                          {progressText}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {isExpanded ? '⌄' : '›'}
                        </ThemedText>
                      </View>
                    </Pressable>

                    {isExpanded && expandedContributions ? (
                      <View
                        style={[
                          styles.panel,
                          { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
                        ]}>
                        {expandedContributions.contributors.map((item) => (
                          <Pressable
                            key={item.id}
                            style={styles.panelRow}
                            accessibilityRole="button"
                            accessibilityLabel={`Open ${item.name}`}
                            testID={`tally-item-${item.id}`}
                            onPress={() => router.push(`/entry/${item.id}`)}>
                            <View style={styles.panelRowLabel}>
                              <ThemedText type="small" numberOfLines={1}>
                                {item.name}
                              </ThemedText>
                              <ThemedText type="small" themeColor="textSecondary">
                                {item.mealSlot ? `${formatTime12h(item.loggedAt)} · ${item.mealSlot}` : formatTime12h(item.loggedAt)}
                              </ThemedText>
                            </View>
                            <ThemedText type="smallBold">{unit ? `${item.value}${unit}` : String(item.value)}</ThemedText>
                          </Pressable>
                        ))}
                        {expandedContributions.missing.map((item) => (
                          <Pressable
                            key={item.id}
                            style={styles.panelRow}
                            accessibilityRole="button"
                            accessibilityLabel={`Open ${item.name}`}
                            testID={`tally-item-${item.id}`}
                            onPress={() => router.push(`/entry/${item.id}`)}>
                            <View style={styles.panelRowLabel}>
                              <ThemedText type="small" numberOfLines={1}>
                                {item.name}
                              </ThemedText>
                              <ThemedText type="small" themeColor="textSecondary">
                                {item.mealSlot ? `${formatTime12h(item.loggedAt)} · ${item.mealSlot}` : formatTime12h(item.loggedAt)}
                              </ThemedText>
                            </View>
                            <ThemedText type="small" themeColor="textSecondary">
                              no data
                            </ThemedText>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </Fragment>
                );
              })}
            </View>
          </View>
        )}

        <GoalsSection />

        <CheckInSection />
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
  header: {
    gap: Spacing.one,
  },
  section: {
    gap: Spacing.two,
  },
  table: {
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    gap: Spacing.half,
  },
  rowValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  panel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  panelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    minHeight: 44,
  },
  panelRowLabel: {
    flex: 1,
    marginRight: Spacing.three,
    gap: Spacing.half,
  },
});
