import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedTextInput } from '@/components/form-fields';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Goal, GoalDirection } from '@/db/schema';
import { useTheme } from '@/hooks/use-theme';
import { parseGoalThreshold } from '@/lib/goals';
import { NUTRITION_NOUNS, nutritionUnit } from '@/lib/nutrition';
import { NUTRITION_FIELDS, type NutritionField } from '@/lib/validation';
import { useGoalsStore } from './goalsStore';

function capitalize(word: string): string {
  return word.length === 0 ? word : word[0].toUpperCase() + word.slice(1);
}

/** "≥ 50g" / "≤ 20g", or "No goal" when none is set. */
function goalSummaryText(existing: Goal | undefined, unit: string): string {
  if (!existing) return 'No goal';
  const symbol = existing.direction === 'floor' ? '≥' : '≤';
  return unit.length > 0 ? `${symbol} ${existing.threshold}${unit}` : `${symbol} ${existing.threshold}`;
}

/**
 * Goals tab section (HANDOFF.md "nutrient threshold goals" Phase 3): every
 * NUTRITION_FIELD gets a row showing its current goal (or "No goal"). Tapping
 * a row expands an inline editor — direction + numeric threshold, Save/Remove
 * — writing through useGoalsStore, which persists via the repository and
 * refreshes state (mirrors WatchlistSection.tsx's shape).
 */
export function GoalsSection() {
  const theme = useTheme();
  const goals = useGoalsStore((state) => state.goals);
  const upsert = useGoalsStore((state) => state.upsert);
  const remove = useGoalsStore((state) => state.remove);

  const [expanded, setExpanded] = useState<NutritionField | null>(null);
  const [direction, setDirection] = useState<GoalDirection>('floor');
  const [thresholdInput, setThresholdInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const goalByNutrient = new Map(goals.map((g) => [g.nutrient, g] as const));

  function toggleExpand(field: NutritionField) {
    if (expanded === field) {
      setExpanded(null);
      return;
    }
    const existing = goalByNutrient.get(field);
    setDirection(existing?.direction ?? 'floor');
    setThresholdInput(existing ? String(existing.threshold) : '');
    setError(null);
    setExpanded(field);
  }

  async function handleSave(field: NutritionField) {
    const threshold = parseGoalThreshold(thresholdInput);
    if (threshold == null) {
      setError('Enter a positive number.');
      return;
    }
    setError(null);
    await upsert(field, direction, threshold);
    setExpanded(null);
  }

  async function handleRemove(field: NutritionField) {
    await remove(field);
    setExpanded(null);
  }

  return (
    <View style={styles.section}>
      <ThemedText type="subtitle">Goals</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Set a daily floor (at least) or cap (at most) per nutrient. Floors alert via the daily
        check-in; caps alert in-app the moment a save would cross them.
      </ThemedText>

      <View style={[styles.list, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {NUTRITION_FIELDS.map((field) => {
          const existing = goalByNutrient.get(field);
          const unit = nutritionUnit(field);
          const noun = NUTRITION_NOUNS[field];
          const isExpanded = expanded === field;
          const summary = goalSummaryText(existing, unit);

          return (
            <View key={field} style={[styles.row, { borderColor: theme.border }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${capitalize(noun)} goal: ${existing ? summary : 'no goal set'}`}
                accessibilityState={{ expanded: isExpanded }}
                onPress={() => toggleExpand(field)}
                style={styles.rowHeader}>
                <ThemedText type="small">{capitalize(noun)}</ThemedText>
                <ThemedText type="smallBold" themeColor={existing ? undefined : 'textSecondary'}>
                  {summary}
                </ThemedText>
              </Pressable>

              {isExpanded ? (
                <View style={styles.editor}>
                  <View style={styles.directionRow}>
                    {(['floor', 'cap'] as const).map((option) => {
                      const selected = direction === option;
                      return (
                        <Pressable
                          key={option}
                          accessibilityRole="button"
                          accessibilityLabel={`Goal direction: ${option === 'floor' ? 'at least' : 'at most'}`}
                          accessibilityState={{ selected }}
                          onPress={() => setDirection(option)}
                          style={[
                            styles.directionChip,
                            {
                              backgroundColor: selected ? theme.accent : theme.backgroundElement,
                              borderColor: selected ? theme.accent : theme.border,
                            },
                          ]}>
                          <ThemedText
                            type={selected ? 'smallBold' : 'small'}
                            themeColor={selected ? undefined : 'textSecondary'}
                            style={selected ? { color: theme.accentText } : undefined}>
                            {option === 'floor' ? '≥ At least' : '≤ At most'}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>

                  <ThemedTextInput
                    value={thresholdInput}
                    onChangeText={setThresholdInput}
                    placeholder="e.g. 50"
                    accessibilityLabel={`Set ${noun} goal`}
                    keyboardType="numeric"
                    inputMode="decimal"
                  />
                  {error ? (
                    <ThemedText type="small" themeColor="danger">
                      {error}
                    </ThemedText>
                  ) : null}

                  <View style={styles.editorActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Save ${noun} goal`}
                      onPress={() => handleSave(field)}
                      style={[styles.saveButton, { backgroundColor: theme.primary }]}>
                      <ThemedText style={[styles.saveLabel, { color: theme.primaryText }]}>Save</ThemedText>
                    </Pressable>
                    {existing ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${noun} goal`}
                        onPress={() => handleRemove(field)}>
                        <ThemedText type="link" themeColor="danger">
                          Remove
                        </ThemedText>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  list: {
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 44,
  },
  editor: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  directionRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  directionChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
  },
  editorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  saveButton: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    minHeight: 44,
    justifyContent: 'center',
  },
  saveLabel: {
    fontWeight: '700',
  },
});
