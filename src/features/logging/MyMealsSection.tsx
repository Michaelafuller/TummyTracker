import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { savedMealSlug, type SavedMealWithComponents } from '@/lib/savedMeals';

/**
 * Rows shown before the list scrolls inside its own box. Kept small so a long
 * "My meals" list never pushes the Recent section off the Home screen.
 */
export const MY_MEALS_VISIBLE_ROWS = 3;
const ROW_HEIGHT = 48;

export interface MyMealsSectionProps {
  items: SavedMealWithComponents[];
  /** Tap on the row: log this meal (prefilled review, time = now). */
  onLog: (item: SavedMealWithComponents) => void;
  /** Tap on "Edit": open the template for editing. */
  onEdit: (item: SavedMealWithComponents) => void;
}

/**
 * Home's "My meals" section (GitHub #25): the user's saved meal templates,
 * A-Z, above Recent. Renders nothing when there are none. Each row is a
 * template, never a log entry — tapping it copies its items into the meal
 * builder exactly like a Recent row does.
 */
export function MyMealsSection({ items, onLog, onEdit }: MyMealsSectionProps) {
  const theme = useTheme();
  if (items.length === 0) return null;

  return (
    <View style={styles.section} testID="my-meals-section">
      <ThemedText type="smallBold" style={styles.heading}>
        My meals
      </ThemedText>
      <ScrollView
        style={{ maxHeight: MY_MEALS_VISIBLE_ROWS * ROW_HEIGHT + (MY_MEALS_VISIBLE_ROWS - 1) * Spacing.two }}
        contentContainerStyle={styles.list}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled">
        {items.map((item) => {
          const slug = savedMealSlug(item.meal.name);
          const count = item.components.length;
          return (
            <View
              key={item.meal.id}
              style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <Pressable
                testID={`my-meal-${slug}`}
                accessibilityRole="button"
                accessibilityLabel={`Log ${item.meal.name}`}
                onPress={() => onLog(item)}
                style={styles.rowMain}>
                <ThemedText type="small" numberOfLines={1} style={styles.rowName}>
                  {item.meal.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {`${count} ${count === 1 ? 'item' : 'items'}`}
                </ThemedText>
              </Pressable>
              <Pressable
                testID={`my-meal-${slug}-edit`}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${item.meal.name}`}
                onPress={() => onEdit(item)}
                hitSlop={Spacing.two}
                style={styles.editLink}>
                <ThemedText type="link">Edit</ThemedText>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  heading: {
    marginLeft: Spacing.one,
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ROW_HEIGHT,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: ROW_HEIGHT,
  },
  rowName: {
    flexShrink: 1,
  },
  editLink: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
