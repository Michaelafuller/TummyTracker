import { fireEvent, render } from '@testing-library/react-native';

import type { LogEntry } from '@/db/schema';
import { RecentFoodPicker } from '../RecentFoodPicker';

const BASE_ENTRY: LogEntry = {
  id: 'base',
  type: 'meal',
  mealSlot: 'breakfast',
  name: 'Oatmeal',
  barcode: null,
  loggedAt: 1000,
  sentiment: null,
  bristolScale: null,
  symptomType: null,
  severity: null,
  notes: null,
  ingredientsText: null,
  tagsJson: null,
  calories: 150,
  fatG: null,
  saturatedFatG: null,
  carbsG: null,
  proteinG: null,
  fiberG: null,
  sugarG: null,
  sodiumMg: null,
  servingG: null,
  createdAt: 1,
  updatedAt: 1,
};

function entry(id: string, name: string): LogEntry {
  return { ...BASE_ENTRY, id, name };
}

// RNTL v14 renders asynchronously: `render` and `fireEvent.*` both return promises.
describe('RecentFoodPicker', () => {
  const entries = [entry('1', 'Chicken salad'), entry('2', 'Greek yogurt'), entry('3', 'Chicken soup')];

  it('shows the first entries with an empty query', async () => {
    const { getByTestId } = await render(<RecentFoodPicker entries={entries} onSelect={jest.fn()} />);
    expect(getByTestId('recent-chicken-salad')).toBeTruthy();
    expect(getByTestId('recent-greek-yogurt')).toBeTruthy();
    expect(getByTestId('recent-chicken-soup')).toBeTruthy();
  });

  it('typing filters the rows', async () => {
    const { getByLabelText, getByTestId, queryByTestId } = await render(
      <RecentFoodPicker entries={entries} onSelect={jest.fn()} />,
    );
    await fireEvent.changeText(getByLabelText('Search past foods'), 'chicken');
    expect(getByTestId('recent-chicken-salad')).toBeTruthy();
    expect(getByTestId('recent-chicken-soup')).toBeTruthy();
    expect(queryByTestId('recent-greek-yogurt')).toBeNull();
  });

  it('tapping a row fires the prefill callback', async () => {
    const onSelect = jest.fn();
    const { getByTestId } = await render(<RecentFoodPicker entries={entries} onSelect={onSelect} />);
    await fireEvent.press(getByTestId('recent-greek-yogurt'));
    expect(onSelect).toHaveBeenCalledWith(entries[1]);
  });

  it('exposes a re-log accessibility label per row', async () => {
    const { getByLabelText } = await render(<RecentFoodPicker entries={entries} onSelect={jest.fn()} />);
    expect(getByLabelText('Re-log Chicken salad')).toBeTruthy();
  });
});
