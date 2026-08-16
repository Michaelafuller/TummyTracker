import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing, type ThemeColor } from '@/constants/theme';
import { CheckInSection } from '@/features/goals/CheckInSection';
import { GoalsSection } from '@/features/goals/GoalsSection';
import { useAllEntries } from '@/features/logging/useEntries';
import { useGoalsStore } from '@/features/goals/goalsStore';
import { tallyDailyNutrition } from '@/lib/dailyTally';
import { dayBounds, formatDateInput } from '@/lib/datetime';
import { evaluateGoals, type GoalEvaluation } from '@/lib/goals';
import { NUTRITION_LABELS, nutritionUnit } from '@/lib/nutrition';
import { NUTRITION_FIELDS, type NutritionField } from '@/lib/validation';
import { useTheme } from '@/hooks/use-theme';

/** "Today" plus the local calendar date, e.g. "Today · 2026-08-15". */
function todayHeading(nowMs: number): string {
  return `Today · ${formatDateInput(nowMs)}`;
}

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

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + BottomTabInset + Spacing.four },
        ]}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Goals</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {todayHeading(now)}
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
                return (
                  <View
                    key={field}
                    style={[styles.row, { borderColor: theme.border }]}
                    accessible
                    accessibilityLabel={accessibilityLabel}>
                    <View style={styles.rowLabel}>
                      <ThemedText type="small">{label}</ThemedText>
                      {caveat != null ? (
                        <ThemedText type="small" themeColor="textSecondary">
                          {caveat}
                        </ThemedText>
                      ) : null}
                    </View>
                    <ThemedText type="smallBold" themeColor={evaluation ? progressColor(evaluation) : undefined}>
                      {progressText}
                    </ThemedText>
                  </View>
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
});
