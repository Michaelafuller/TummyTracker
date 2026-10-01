import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import {
  backfillSavedMealTags,
  createMealWithComponents,
  deleteSavedMeal,
  findSavedMealByNameKey,
  saveSavedMeal,
} from '@/db/repository';
import type { Goal, LogEntry, WatchlistItem } from '@/db/schema';
import { refreshCheckInIfEnabled } from '@/features/goals/checkInService';
import { useGoalsStore } from '@/features/goals/goalsStore';
import { useMealBuilderStore } from '@/features/logging/mealBuilderStore';
import { useWatchlistStore } from '@/features/watchlist/watchlistStore';
import type { MealComponentDraft } from '@/lib/mealAggregate';
import MealReviewScreen from '../review';

const mockDismissAll = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ dismissAll: mockDismissAll, push: mockPush, back: mockBack }),
}));

jest.mock('@/db/repository', () => ({
  createMealWithComponents: jest.fn().mockResolvedValue(undefined),
  saveSavedMeal: jest.fn().mockResolvedValue(undefined),
  findSavedMealByNameKey: jest.fn().mockResolvedValue(undefined),
  deleteSavedMeal: jest.fn().mockResolvedValue(undefined),
  backfillSavedMealTags: jest.fn().mockResolvedValue(0),
  listWatchlistItems: jest.fn(),
  addWatchlistItem: jest.fn(),
  removeWatchlistItem: jest.fn(),
}));

// The check-in refresh touches expo-notifications, irrelevant to this screen's
// own save/notice behavior — stub it out and just assert it gets kicked off.
jest.mock('@/features/goals/checkInService', () => ({
  refreshCheckInIfEnabled: jest.fn().mockResolvedValue(undefined),
}));

let mockAllEntries: LogEntry[] = [];
jest.mock('@/features/logging/useEntries', () => ({
  useAllEntries: () => mockAllEntries,
}));

function draft(name: string, overrides: Partial<MealComponentDraft> = {}): MealComponentDraft {
  return {
    name,
    barcode: null,
    servings: 1,
    servingG: null,
    calories: null,
    fatG: null,
    saturatedFatG: null,
    carbsG: null,
    proteinG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    ingredientsText: null,
    tagsJson: null,
    sortOrder: 0,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (findSavedMealByNameKey as jest.Mock).mockResolvedValue(undefined);
  (backfillSavedMealTags as jest.Mock).mockResolvedValue(0);
  useMealBuilderStore.setState({
    components: [draft('Peas', { calories: 100 }), draft('Rice', { calories: 200 })],
    reviewPrefill: null,
    editingSavedMealId: null,
  });
  useWatchlistStore.setState({ items: [], loaded: false });
  useGoalsStore.setState({ goals: [], loaded: false });
  mockAllEntries = [];
});

describe('MealReviewScreen', () => {
  it('lists each component with a testID row', async () => {
    const { getByTestId } = await render(<MealReviewScreen />);
    expect(getByTestId('component-0')).toBeTruthy();
    expect(getByTestId('component-1')).toBeTruthy();
  });

  it('prefills the meal name from defaultMealName', async () => {
    const { getByDisplayValue } = await render(<MealReviewScreen />);
    expect(getByDisplayValue('Peas + 1 more')).toBeTruthy();
  });

  it('removing a component drops its row', async () => {
    const { getByLabelText, queryByTestId } = await render(<MealReviewScreen />);
    await fireEvent.press(getByLabelText('Remove Rice from meal'));
    expect(queryByTestId('component-1')).toBeNull();
  });

  it('saves via createMealWithComponents and clears the builder store', async () => {
    const { getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.press(getByLabelText('Save meal'));
    expect(createMealWithComponents).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Peas + 1 more' }),
      expect.arrayContaining([expect.objectContaining({ name: 'Peas' }), expect.objectContaining({ name: 'Rice' })]),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useMealBuilderStore.getState().components).toEqual([]);
    expect(mockDismissAll).toHaveBeenCalled();
  });

  it('stepping servings up rescales the row and the aggregate', async () => {
    const { getByLabelText, getByTestId, getByText } = await render(<MealReviewScreen />);
    expect(getByTestId('component-1-kcal')).toHaveTextContent('200 kcal');
    await fireEvent.press(getByLabelText('Increase servings of Rice'));
    expect(getByTestId('component-1-servings-value')).toHaveTextContent('1.5×');
    expect(getByTestId('component-1-kcal')).toHaveTextContent('300 kcal');
    expect(getByText('Aggregate: 400 kcal')).toBeTruthy();
  });

  it('stops stepping down at half a serving', async () => {
    const { getByLabelText, getByTestId } = await render(<MealReviewScreen />);
    const decrease = getByLabelText('Decrease servings of Peas');
    await fireEvent.press(decrease);
    expect(getByTestId('component-0-servings-value')).toHaveTextContent('0.5×');
    expect(getByLabelText('Decrease servings of Peas')).toBeDisabled();
  });

  it('saves the adjusted servings on the component rows', async () => {
    const { getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.press(getByLabelText('Increase servings of Rice'));
    await fireEvent.press(getByLabelText('Increase servings of Rice'));
    await fireEvent.press(getByLabelText('Save meal'));
    expect(createMealWithComponents).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ name: 'Peas', servings: 1 }), expect.objectContaining({ name: 'Rice', servings: 2 })],
    );
  });

  it('does not save when the meal name is cleared', async () => {
    const { getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.changeText(getByLabelText('Meal name'), '');
    await fireEvent.press(getByLabelText('Save meal'));
    expect(createMealWithComponents).not.toHaveBeenCalled();
  });

  it('"Add item to this meal" pushes /scan', async () => {
    const { getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.press(getByLabelText('Add item to this meal'));
    expect(mockPush).toHaveBeenCalledWith('/scan');
  });
});

describe('MealReviewScreen per-item edit (GitHub #25)', () => {
  it('tapping an item name opens the item form in edit mode for that index', async () => {
    const { getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.press(getByLabelText('Edit Rice'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/meal/component', params: { edit: '1' } });
  });

  it('every row has an edit testID', async () => {
    const { getByTestId } = await render(<MealReviewScreen />);
    expect(getByTestId('component-0-edit')).toBeTruthy();
    expect(getByTestId('component-1-edit')).toBeTruthy();
  });

  it('an edited item shows its new name and the auto-name follows it', async () => {
    const { getByDisplayValue, getByText } = await render(<MealReviewScreen />);
    expect(getByDisplayValue('Peas + 1 more')).toBeTruthy();
    await act(async () => {
      useMealBuilderStore.getState().updateComponent(0, { name: 'Garden peas' });
    });
    expect(getByText('Garden peas')).toBeTruthy();
    expect(getByDisplayValue('Garden peas + 1 more')).toBeTruthy();
  });
});

describe('MealReviewScreen auto name sync (HANDOFF.md #16 §2)', () => {
  it('removing an item updates an auto-generated name to match', async () => {
    const { getByLabelText, getByDisplayValue } = await render(<MealReviewScreen />);
    expect(getByDisplayValue('Peas + 1 more')).toBeTruthy();

    await fireEvent.press(getByLabelText('Remove Rice from meal'));

    expect(getByDisplayValue('Peas')).toBeTruthy();
  });

  it('a name the user typed survives removing an item', async () => {
    const { getByLabelText, getByDisplayValue } = await render(<MealReviewScreen />);
    await fireEvent.changeText(getByLabelText('Meal name'), 'My salad');

    await fireEvent.press(getByLabelText('Remove Rice from meal'));

    expect(getByDisplayValue('My salad')).toBeTruthy();
  });

  it('a re-logged meal with a custom name never changes when an item is removed', async () => {
    useMealBuilderStore.setState({
      components: [draft('Oatmeal', { calories: 150 }), draft('Banana', { calories: 90 })],
      reviewPrefill: { name: 'Sunday breakfast', type: 'meal', mealSlot: 'breakfast' },
    });
    const { getByLabelText, getByDisplayValue } = await render(<MealReviewScreen />);
    expect(getByDisplayValue('Sunday breakfast')).toBeTruthy();

    await fireEvent.press(getByLabelText('Remove Banana from meal'));

    expect(getByDisplayValue('Sunday breakfast')).toBeTruthy();
  });
});

describe('MealReviewScreen reviewPrefill (re-log from history)', () => {
  it('populates the name field and meal slot from reviewPrefill', async () => {
    useMealBuilderStore.setState({
      components: [draft('Oatmeal', { calories: 150 })],
      reviewPrefill: { name: 'Oatmeal', type: 'meal', mealSlot: 'breakfast' },
    });
    const { getByDisplayValue, getByLabelText } = await render(<MealReviewScreen />);
    expect(getByDisplayValue('Oatmeal')).toBeTruthy();
    expect(getByLabelText('Breakfast').props.accessibilityState.selected).toBe(true);
  });

  it('saving a loaded draft (original + an added item) calls createMealWithComponents once, creating never updating', async () => {
    useMealBuilderStore.setState({
      components: [draft('Oatmeal', { calories: 150 }), draft('Banana', { calories: 90 })],
      reviewPrefill: { name: 'Oatmeal', type: 'meal', mealSlot: 'breakfast' },
    });
    const { getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.press(getByLabelText('Save meal'));
    expect(createMealWithComponents).toHaveBeenCalledTimes(1);
    expect(createMealWithComponents).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Oatmeal' }),
      expect.arrayContaining([
        expect.objectContaining({ name: 'Oatmeal' }),
        expect.objectContaining({ name: 'Banana' }),
      ]),
    );
  });
});

describe('MealReviewScreen watched-ingredient notice', () => {
  const SOY_WATCH: WatchlistItem = { id: 'w1', term: 'soy', createdAt: 0 };

  it('does not render when nothing is watched', async () => {
    const { queryByText } = await render(<MealReviewScreen />);
    expect(queryByText('Contains a watched ingredient')).toBeNull();
  });

  it('does not render when a watched term matches no component tag', async () => {
    useWatchlistStore.setState({ items: [SOY_WATCH], loaded: true });
    const { queryByText } = await render(<MealReviewScreen />);
    expect(queryByText('Contains a watched ingredient')).toBeNull();
  });

  it('renders the notice when a component tag matches a watched term', async () => {
    useWatchlistStore.setState({ items: [SOY_WATCH], loaded: true });
    useMealBuilderStore.setState({
      components: [draft('Tofu', { tagsJson: '["soybeans"]' }), draft('Rice')],
    });
    const { findByText } = await render(<MealReviewScreen />);
    expect(await findByText('Contains a watched ingredient')).toBeTruthy();
    expect(await findByText('soy — matched: soybeans')).toBeTruthy();
  });

  it('does not block saving while the notice is showing', async () => {
    useWatchlistStore.setState({ items: [SOY_WATCH], loaded: true });
    useMealBuilderStore.setState({
      components: [draft('Tofu', { tagsJson: '["soybeans"]' }), draft('Rice')],
    });
    const { getByLabelText, findByText } = await render(<MealReviewScreen />);
    expect(await findByText('Contains a watched ingredient')).toBeTruthy();
    await fireEvent.press(getByLabelText('Save meal'));
    expect(createMealWithComponents).toHaveBeenCalled();
  });
});

function goal(overrides: Partial<Goal> & Pick<Goal, 'nutrient' | 'direction' | 'threshold'>): Goal {
  return { id: `g-${overrides.nutrient}`, createdAt: 0, ...overrides };
}

const TODAY_ENTRY_BASE: Omit<LogEntry, 'id' | 'type' | 'loggedAt'> = {
  mealSlot: null,
  name: 'Food',
  barcode: null,
  sentiment: null,
  bristolScale: null,
  symptomType: null,
  severity: null,
  notes: null,
  ingredientsText: null,
  tagsJson: null,
  servingG: null,
  calories: null,
  fatG: null,
  saturatedFatG: null,
  carbsG: null,
  proteinG: null,
  fiberG: null,
  sugarG: null,
  sodiumMg: null,
  componentCount: null,
  createdAt: 0,
  updatedAt: 0,
};

function todayEntry(overrides: Partial<LogEntry> & { type: LogEntry['type'] }): LogEntry {
  return { ...TODAY_ENTRY_BASE, id: `today-${Math.random()}`, loggedAt: Date.now(), ...overrides };
}

describe('MealReviewScreen save-time cap notice', () => {
  // Default beforeEach components are Peas(calories:100) + Rice(calories:200) = 300 aggregate calories.

  it('does not render when no cap would be exceeded', async () => {
    const { queryByText } = await render(<MealReviewScreen />);
    expect(queryByText('This save goes over a goal')).toBeNull();
  });

  it('renders when the pending meal alone would push a nutrient over its cap', async () => {
    useGoalsStore.setState({
      goals: [goal({ nutrient: 'calories', direction: 'cap', threshold: 250 })],
      loaded: true,
    });
    const { findByText } = await render(<MealReviewScreen />);
    expect(await findByText('This save goes over a goal')).toBeTruthy();
    expect(await findByText('Saving puts calories at 300 — over your 250 cap')).toBeTruthy();
  });

  it('adds entries already logged today to the pending meal before judging the cap', async () => {
    useGoalsStore.setState({
      goals: [goal({ nutrient: 'calories', direction: 'cap', threshold: 250 })],
      loaded: true,
    });
    mockAllEntries = [todayEntry({ type: 'meal', calories: 100 })];
    const { findByText } = await render(<MealReviewScreen />);
    // 100 already logged today + 300 pending = 400, over the 250 cap.
    expect(await findByText('Saving puts calories at 400 — over your 250 cap')).toBeTruthy();
  });

  it('does not render when the total would stay within the cap', async () => {
    useGoalsStore.setState({
      goals: [goal({ nutrient: 'calories', direction: 'cap', threshold: 1000 })],
      loaded: true,
    });
    const { queryByText } = await render(<MealReviewScreen />);
    expect(queryByText('This save goes over a goal')).toBeNull();
  });

  it('does not block saving while the cap notice is showing', async () => {
    useGoalsStore.setState({
      goals: [goal({ nutrient: 'calories', direction: 'cap', threshold: 250 })],
      loaded: true,
    });
    const { getByLabelText, findByText } = await render(<MealReviewScreen />);
    expect(await findByText('This save goes over a goal')).toBeTruthy();
    await fireEvent.press(getByLabelText('Save meal'));
    expect(createMealWithComponents).toHaveBeenCalled();
  });
});

describe('MealReviewScreen check-in refresh', () => {
  it('re-arms the check-in after a successful save', async () => {
    const { getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.press(getByLabelText('Save meal'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refreshCheckInIfEnabled).toHaveBeenCalled();
  });

  it('does not refresh the check-in when the save is rejected by validation', async () => {
    const { getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.changeText(getByLabelText('Meal name'), '');
    await fireEvent.press(getByLabelText('Save meal'));
    expect(refreshCheckInIfEnabled).not.toHaveBeenCalled();
  });
});

// --- My meals (GitHub #25) -------------------------------------------------

// --- My meals (GitHub #25) -------------------------------------------------

type AlertAnswer = string | (() => string);

/**
 * Replaces Alert.alert with a stub that immediately "taps" the button named in
 * `answers` (keyed by the alert's exact title). The screen awaits the user's
 * choice, so the whole save chain then settles inside the awaited press.
 * Alerts not in `answers` are recorded but left open (only fine for the
 * fire-and-forget confirmations).
 */
function spyOnAlert(answers: Record<string, AlertAnswer> = {}) {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation((title, _message, buttons) => {
    const answer = answers[title];
    if (answer === undefined) return;
    const label = typeof answer === 'function' ? answer() : answer;
    const button = buttons?.find((b) => b.text === label);
    if (!button) throw new Error(`No "${label}" button on the "${title}" alert`);
    button.onPress?.();
  });
  return {
    spy,
    titles: () => spy.mock.calls.map((call) => call[0]),
    messageOf: (title: string) => spy.mock.calls.find((call) => call[0] === title)?.[1],
  };
}

function savedMealRow(id: string, name: string) {
  return { id, name, nameKey: name.toLowerCase(), type: 'meal', mealSlot: null, createdAt: 1, updatedAt: 1 };
}

const BACKFILL_TITLE = 'Add ingredients to past meals?';

describe('MealReviewScreen "Save as my meal" (logging mode)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the button above Save meal, with a testID and label', async () => {
    const { getByLabelText, getByTestId } = await render(<MealReviewScreen />);
    expect(getByTestId('review-save-as-my-meal')).toBeTruthy();
    expect(getByLabelText('Save as my meal')).toBeTruthy();
    expect(getByLabelText('Save meal')).toBeTruthy();
  });

  it('is disabled with no items', async () => {
    useMealBuilderStore.setState({ components: [], reviewPrefill: null });
    const { getByLabelText } = await render(<MealReviewScreen />);
    expect(getByLabelText('Save as my meal')).toBeDisabled();
  });

  it('saves name/type/slot and the items with their servings — not a log entry, and stays on screen', async () => {
    spyOnAlert();
    const { getByLabelText, findByText } = await render(<MealReviewScreen />);
    await fireEvent.changeText(getByLabelText('Meal name'), '  Lunch bowl ');
    await fireEvent.press(getByLabelText('Breakfast'));
    await fireEvent.press(getByLabelText('Increase servings of Rice'));
    await fireEvent.changeText(getByLabelText('Notes'), 'not stored');

    await fireEvent.press(getByLabelText('Save as my meal'));

    expect(saveSavedMeal).toHaveBeenCalledTimes(1);
    expect(saveSavedMeal).toHaveBeenCalledWith({
      id: undefined,
      name: 'Lunch bowl',
      type: 'meal',
      mealSlot: 'breakfast',
      components: [
        expect.objectContaining({ name: 'Peas', servings: 1 }),
        expect.objectContaining({ name: 'Rice', servings: 1.5 }),
      ],
      replaceId: undefined,
    });
    // Never a log entry, never leaves the screen, builder untouched.
    expect(createMealWithComponents).not.toHaveBeenCalled();
    expect(mockDismissAll).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    expect(useMealBuilderStore.getState().components).toHaveLength(2);
    // The saved payload carries no date/time/notes at all.
    const saved = (saveSavedMeal as jest.Mock).mock.calls[0][0];
    expect(Object.keys(saved).sort()).toEqual(['components', 'id', 'mealSlot', 'name', 'replaceId', 'type']);

    expect(await findByText('Saved to My meals')).toBeTruthy();
  });

  it('goes back to "Save as my meal" once the items change after saving', async () => {
    spyOnAlert();
    const { getByLabelText, getByText, findByText } = await render(<MealReviewScreen />);
    await fireEvent.press(getByLabelText('Save as my meal'));
    expect(await findByText('Saved to My meals')).toBeTruthy();
    expect(getByLabelText('Save as my meal')).toBeDisabled();

    await fireEvent.press(getByLabelText('Increase servings of Rice'));

    expect(getByText('Save as my meal')).toBeTruthy();
    expect(getByLabelText('Save as my meal')).not.toBeDisabled();
  });

  it('does not save with a blank name', async () => {
    const { getByLabelText, findByText } = await render(<MealReviewScreen />);
    await fireEvent.changeText(getByLabelText('Meal name'), '   ');
    await fireEvent.press(getByLabelText('Save as my meal'));
    expect(await findByText('Name is required.')).toBeTruthy();
    expect(saveSavedMeal).not.toHaveBeenCalled();
  });

  it('a name clash asks to Replace; Cancel saves nothing', async () => {
    (findSavedMealByNameKey as jest.Mock).mockResolvedValue(savedMealRow('existing', 'Peas + 1 more'));
    const alert = spyOnAlert({ "Replace 'Peas + 1 more' in My meals?": 'Cancel' });
    const { getByLabelText } = await render(<MealReviewScreen />);

    await fireEvent.press(getByLabelText('Save as my meal'));

    expect(alert.titles()).toEqual(["Replace 'Peas + 1 more' in My meals?"]);
    expect(findSavedMealByNameKey).toHaveBeenCalledWith('peas + 1 more');
    expect(saveSavedMeal).not.toHaveBeenCalled();
    expect(getByLabelText('Save as my meal')).not.toBeDisabled();
  });

  it('a name clash then Replace saves over the existing template (replaceId)', async () => {
    (findSavedMealByNameKey as jest.Mock).mockResolvedValue(savedMealRow('existing', 'Peas + 1 more'));
    spyOnAlert({ "Replace 'Peas + 1 more' in My meals?": 'Replace' });
    const { getByLabelText } = await render(<MealReviewScreen />);

    await fireEvent.press(getByLabelText('Save as my meal'));

    expect(saveSavedMeal).toHaveBeenCalledTimes(1);
    expect(saveSavedMeal).toHaveBeenCalledWith(expect.objectContaining({ id: undefined, replaceId: 'existing' }));
  });

  it('shows an alert (and no "Saved" state) when saving fails', async () => {
    (saveSavedMeal as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const alert = spyOnAlert();
    const { getByLabelText, queryByText } = await render(<MealReviewScreen />);
    await fireEvent.press(getByLabelText('Save as my meal'));
    expect(alert.titles()).toEqual(["Couldn't save to My meals"]);
    expect(queryByText('Saved to My meals')).toBeNull();
  });
});

describe('MealReviewScreen backfill offer (GitHub #25)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('offers nothing when no past meal of that name lacks ingredients', async () => {
    mockAllEntries = [
      todayEntry({ type: 'meal', name: 'Peas + 1 more', tagsJson: '["peas"]' }),
      todayEntry({ type: 'meal', name: 'Toast' }),
      todayEntry({ type: 'bowel_movement', name: 'Peas + 1 more' }),
    ];
    const alert = spyOnAlert();
    const { getByLabelText, findByText } = await render(<MealReviewScreen />);
    await fireEvent.press(getByLabelText('Save as my meal'));
    expect(await findByText('Saved to My meals')).toBeTruthy();
    expect(alert.spy).not.toHaveBeenCalled();
    expect(backfillSavedMealTags).not.toHaveBeenCalled();
  });

  it('offers with the target count; "Not now" writes nothing', async () => {
    mockAllEntries = [
      todayEntry({ type: 'meal', name: 'Peas + 1 more' }),
      todayEntry({ type: 'snack', name: ' PEAS + 1 MORE ' }),
      todayEntry({ type: 'meal', name: 'Peas + 1 more', tagsJson: '["peas"]' }),
    ];
    const alert = spyOnAlert({ [BACKFILL_TITLE]: 'Not now' });
    const { getByLabelText, findByText } = await render(<MealReviewScreen />);
    await fireEvent.press(getByLabelText('Save as my meal'));

    expect(alert.messageOf(BACKFILL_TITLE)).toBe(
      "Add these ingredients to 2 past 'Peas + 1 more' meals that don't have any? This updates your Insights.",
    );
    expect(await findByText('Saved to My meals')).toBeTruthy();
    expect(backfillSavedMealTags).not.toHaveBeenCalled();
  });

  it('only "Add" writes: backfills with the template tags and ingredient text, then confirms', async () => {
    mockAllEntries = [todayEntry({ type: 'meal', name: 'Peas + 1 more' })];
    (backfillSavedMealTags as jest.Mock).mockResolvedValue(1);
    let writesWhenAnswered = -1;
    const alert = spyOnAlert({
      [BACKFILL_TITLE]: () => {
        writesWhenAnswered = (backfillSavedMealTags as jest.Mock).mock.calls.length;
        return 'Add';
      },
    });
    const { getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.press(getByLabelText('Save as my meal'));

    expect(alert.messageOf(BACKFILL_TITLE)).toContain("1 past 'Peas + 1 more' meal that");
    expect(writesWhenAnswered).toBe(0); // nothing written before the user chose "Add"
    expect(backfillSavedMealTags).toHaveBeenCalledTimes(1);
    expect(backfillSavedMealTags).toHaveBeenCalledWith('peas + 1 more', ['peas', 'rice'], 'Peas, Rice');
    expect(alert.titles()).toContain('Ingredients added');
    expect(alert.messageOf('Ingredients added')).toBe('Updated 1 past meal.');
  });
});

describe('MealReviewScreen template mode (editing a saved meal)', () => {
  beforeEach(() => {
    useMealBuilderStore.setState({
      components: [draft('Oats', { calories: 150, tagsJson: '["oats"]' }), draft('Milk', { calories: 80 })],
      reviewPrefill: { name: 'Oatmeal bowl', type: 'snack', mealSlot: 'dinner' },
      editingSavedMealId: 'sm1',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the edit heading and Save changes / Delete my meal, with the prefilled name', async () => {
    const { getByTestId, getByDisplayValue, getByText } = await render(<MealReviewScreen />);
    expect(getByText('Edit my meal')).toBeTruthy();
    expect(getByTestId('review-save-changes')).toBeTruthy();
    expect(getByTestId('review-delete-my-meal')).toBeTruthy();
    expect(getByDisplayValue('Oatmeal bowl')).toBeTruthy();
  });

  it('hides date/time, notes, the cap notice and the logging buttons', async () => {
    useGoalsStore.setState({ goals: [goal({ nutrient: 'calories', direction: 'cap', threshold: 10 })], loaded: true });
    const { queryByLabelText, queryByText, queryByTestId } = await render(<MealReviewScreen />);
    expect(queryByLabelText('Choose time')).toBeNull();
    expect(queryByLabelText('Choose date')).toBeNull();
    expect(queryByLabelText('Notes')).toBeNull();
    expect(queryByText('This save goes over a goal')).toBeNull();
    expect(queryByLabelText('Save meal')).toBeNull();
    expect(queryByTestId('review-save-as-my-meal')).toBeNull();
  });

  it('keeps the watched-ingredient notice', async () => {
    useWatchlistStore.setState({ items: [{ id: 'w', term: 'oats', createdAt: 0 } as WatchlistItem], loaded: true });
    const { findByText } = await render(<MealReviewScreen />);
    expect(await findByText('Contains a watched ingredient')).toBeTruthy();
  });

  it('still allows per-item edit', async () => {
    const { getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.press(getByLabelText('Edit Milk'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/meal/component', params: { edit: '1' } });
  });

  it('Save changes edits that template (by id), clears the builder and goes back — never logs a meal', async () => {
    const { getByTestId, getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.changeText(getByLabelText('Meal name'), 'Oatmeal bowl 2');
    await fireEvent.press(getByTestId('review-save-changes'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(saveSavedMeal).toHaveBeenCalledWith({
      id: 'sm1',
      name: 'Oatmeal bowl 2',
      type: 'snack',
      mealSlot: 'dinner',
      components: [expect.objectContaining({ name: 'Oats' }), expect.objectContaining({ name: 'Milk' })],
      replaceId: undefined,
    });
    expect(createMealWithComponents).not.toHaveBeenCalled();
    expect(mockDismissAll).not.toHaveBeenCalled();
    expect(useMealBuilderStore.getState().components).toEqual([]);
    expect(useMealBuilderStore.getState().editingSavedMealId).toBeNull();
  });

  it("keeping the template's own name is not a clash", async () => {
    (findSavedMealByNameKey as jest.Mock).mockResolvedValue(savedMealRow('sm1', 'Oatmeal bowl'));
    const alert = spyOnAlert();
    const { getByTestId } = await render(<MealReviewScreen />);
    await fireEvent.press(getByTestId('review-save-changes'));
    expect(mockBack).toHaveBeenCalled();
    expect(alert.spy).not.toHaveBeenCalled();
    expect(saveSavedMeal).toHaveBeenCalledWith(expect.objectContaining({ id: 'sm1', replaceId: undefined }));
  });

  it("renaming into another template's name asks to Replace; Cancel stays on the screen with nothing saved", async () => {
    (findSavedMealByNameKey as jest.Mock).mockResolvedValue(savedMealRow('other', 'Toast'));
    spyOnAlert({ "Replace 'Toast' in My meals?": 'Cancel' });
    const { getByTestId, getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.changeText(getByLabelText('Meal name'), 'Toast');
    await fireEvent.press(getByTestId('review-save-changes'));

    expect(saveSavedMeal).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    expect(useMealBuilderStore.getState().editingSavedMealId).toBe('sm1');
  });

  it("renaming into another template's name then Replace saves with id + replaceId", async () => {
    (findSavedMealByNameKey as jest.Mock).mockResolvedValue(savedMealRow('other', 'Toast'));
    spyOnAlert({ "Replace 'Toast' in My meals?": 'Replace' });
    const { getByTestId, getByLabelText } = await render(<MealReviewScreen />);
    await fireEvent.changeText(getByLabelText('Meal name'), 'Toast');
    await fireEvent.press(getByTestId('review-save-changes'));

    expect(mockBack).toHaveBeenCalled();
    expect(saveSavedMeal).toHaveBeenCalledWith(expect.objectContaining({ id: 'sm1', replaceId: 'other', name: 'Toast' }));
  });

  it('waits for the backfill choice before going back; "Add" writes, then leaves', async () => {
    mockAllEntries = [todayEntry({ type: 'meal', name: 'Oatmeal bowl' })];
    (backfillSavedMealTags as jest.Mock).mockResolvedValue(1);
    let backWhenAnswered = -1;
    spyOnAlert({
      [BACKFILL_TITLE]: () => {
        backWhenAnswered = mockBack.mock.calls.length;
        return 'Add';
      },
    });
    const { getByTestId } = await render(<MealReviewScreen />);
    await fireEvent.press(getByTestId('review-save-changes'));

    expect(backWhenAnswered).toBe(0); // still on the screen while the offer is open
    expect(backfillSavedMealTags).toHaveBeenCalledWith('oatmeal bowl', ['oats', 'milk'], 'Oats, Milk');
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect((backfillSavedMealTags as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      mockBack.mock.invocationCallOrder[0],
    );
  });

  it('"Not now" leaves without writing', async () => {
    mockAllEntries = [todayEntry({ type: 'meal', name: 'Oatmeal bowl' })];
    spyOnAlert({ [BACKFILL_TITLE]: 'Not now' });
    const { getByTestId } = await render(<MealReviewScreen />);
    await fireEvent.press(getByTestId('review-save-changes'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(backfillSavedMealTags).not.toHaveBeenCalled();
  });

  it('Delete my meal confirms, deletes the template, clears the builder and goes back', async () => {
    let deletedWhenAnswered = -1;
    spyOnAlert({
      "Delete 'Oatmeal bowl'?": () => {
        deletedWhenAnswered = (deleteSavedMeal as jest.Mock).mock.calls.length;
        return 'Delete';
      },
    });
    const { getByTestId } = await render(<MealReviewScreen />);
    await fireEvent.press(getByTestId('review-delete-my-meal'));

    expect(deletedWhenAnswered).toBe(0); // confirm first
    expect(deleteSavedMeal).toHaveBeenCalledWith('sm1');
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(useMealBuilderStore.getState().editingSavedMealId).toBeNull();
    expect(useMealBuilderStore.getState().components).toEqual([]);
  });

  it('cancelling Delete does nothing', async () => {
    spyOnAlert({ "Delete 'Oatmeal bowl'?": 'Cancel' });
    const { getByTestId } = await render(<MealReviewScreen />);
    await fireEvent.press(getByTestId('review-delete-my-meal'));

    expect(deleteSavedMeal).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    expect(useMealBuilderStore.getState().editingSavedMealId).toBe('sm1');
  });
});
