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
  useMealBuilderStore.setState({ components: [], reviewPrefill: null, editingSavedMealId: null });
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

  it('clear resets reviewPrefill too', () => {
    useMealBuilderStore.getState().load([draft('Peas')], { name: 'Peas' });
    useMealBuilderStore.getState().clear();
    expect(useMealBuilderStore.getState().reviewPrefill).toBeNull();
  });

  describe('load', () => {
    it('replaces (not appends) pre-existing components', () => {
      useMealBuilderStore.getState().addComponent(draft('Stale'));
      useMealBuilderStore.getState().load([draft('Peas'), draft('Rice')], { name: 'Peas + 1 more' });
      const { components } = useMealBuilderStore.getState();
      expect(components.map((c) => c.name)).toEqual(['Peas', 'Rice']);
    });

    it('sets reviewPrefill', () => {
      useMealBuilderStore.getState().load([draft('Peas')], { name: 'Peas', mealSlot: 'breakfast' });
      expect(useMealBuilderStore.getState().reviewPrefill).toEqual({ name: 'Peas', mealSlot: 'breakfast' });
    });
  });

  describe('editingSavedMealId (GitHub #25)', () => {
    it('defaults to null', () => {
      expect(useMealBuilderStore.getState().editingSavedMealId).toBeNull();
    });

    it('loadSavedMealForEdit replaces the builder and sets the template id', () => {
      useMealBuilderStore.getState().addComponent(draft('Stale'));
      useMealBuilderStore
        .getState()
        .loadSavedMealForEdit('sm1', [draft('Oats'), draft('Milk')], { name: 'Oatmeal', type: 'meal', mealSlot: 'breakfast' });
      const state = useMealBuilderStore.getState();
      expect(state.components.map((c) => c.name)).toEqual(['Oats', 'Milk']);
      expect(state.reviewPrefill).toEqual({ name: 'Oatmeal', type: 'meal', mealSlot: 'breakfast' });
      expect(state.editingSavedMealId).toBe('sm1');
    });

    it('load resets template mode (re-logging a Recent never inherits it)', () => {
      useMealBuilderStore.getState().loadSavedMealForEdit('sm1', [draft('Oats')], { name: 'Oatmeal' });
      useMealBuilderStore.getState().load([draft('Peas')], { name: 'Peas' });
      expect(useMealBuilderStore.getState().editingSavedMealId).toBeNull();
    });

    it('clear resets template mode', () => {
      useMealBuilderStore.getState().loadSavedMealForEdit('sm1', [draft('Oats')], { name: 'Oatmeal' });
      useMealBuilderStore.getState().clear();
      expect(useMealBuilderStore.getState().editingSavedMealId).toBeNull();
    });

    it('add/update/remove leave template mode alone', () => {
      useMealBuilderStore.getState().loadSavedMealForEdit('sm1', [draft('Oats')], { name: 'Oatmeal' });
      useMealBuilderStore.getState().addComponent(draft('Milk'));
      useMealBuilderStore.getState().updateComponent(0, { servings: 2 });
      useMealBuilderStore.getState().removeComponent(1);
      expect(useMealBuilderStore.getState().editingSavedMealId).toBe('sm1');
    });
  });
});
