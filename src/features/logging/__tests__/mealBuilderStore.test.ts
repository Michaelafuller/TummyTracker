import type { MealComponentDraft } from '@/lib/mealAggregate';
import { useMealBuilderStore } from '../mealBuilderStore';

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
  useMealBuilderStore.setState({ components: [] });
});

describe('mealBuilderStore', () => {
  it('starts empty', () => {
    expect(useMealBuilderStore.getState().components).toEqual([]);
  });

  it('addComponent appends to the list', () => {
    useMealBuilderStore.getState().addComponent(draft('Peas'));
    useMealBuilderStore.getState().addComponent(draft('Rice'));
    const { components } = useMealBuilderStore.getState();
    expect(components).toHaveLength(2);
    expect(components[0].name).toBe('Peas');
    expect(components[1].name).toBe('Rice');
  });

  it('updateComponent patches only the targeted index', () => {
    useMealBuilderStore.getState().addComponent(draft('Peas', { servings: 1 }));
    useMealBuilderStore.getState().addComponent(draft('Rice', { servings: 1 }));
    useMealBuilderStore.getState().updateComponent(1, { servings: 2 });
    const { components } = useMealBuilderStore.getState();
    expect(components[0].servings).toBe(1);
    expect(components[1].servings).toBe(2);
  });

  it('removeComponent drops only the targeted index', () => {
    useMealBuilderStore.getState().addComponent(draft('Peas'));
    useMealBuilderStore.getState().addComponent(draft('Rice'));
    useMealBuilderStore.getState().addComponent(draft('Chicken'));
    useMealBuilderStore.getState().removeComponent(1);
    const { components } = useMealBuilderStore.getState();
    expect(components.map((c) => c.name)).toEqual(['Peas', 'Chicken']);
  });

  it('clear empties the list', () => {
    useMealBuilderStore.getState().addComponent(draft('Peas'));
    useMealBuilderStore.getState().clear();
    expect(useMealBuilderStore.getState().components).toEqual([]);
  });
});
