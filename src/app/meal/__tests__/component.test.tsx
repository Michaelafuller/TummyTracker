import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';

import { useComponentPrefillStore } from '@/features/logging/componentPrefillStore';
import { useMealBuilderStore } from '@/features/logging/mealBuilderStore';
import type { MealComponentDraft } from '@/lib/mealAggregate';
import MealComponentScreen from '../component';

const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockBack = jest.fn();
let mockParams: { edit?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, dismissTo: mockDismissTo, back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));

// Capture FormScrollView props: the screen must pad bottomOffset by the search
// box height (see COMPONENT_FORM_BOTTOM_OFFSET in ComponentForm.tsx) so the
// box inserting after the keyboard anchor can't hide the focused field.
const formScrollViewProps: Record<string, unknown>[] = [];
jest.mock('@/components/keyboard-aware-screen', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    FormScrollView: (props: { children: React.ReactNode }) => {
      formScrollViewProps.push(props);
      return ReactActual.createElement(View, null, props.children);
    },
    KeyboardShiftView: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement(View, null, children),
  };
});

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  useMealBuilderStore.setState({ components: [] });
  useComponentPrefillStore.setState({ prefill: null });
});

describe('MealComponentScreen', () => {
  it('shows the confirm hint with no components added yet', async () => {
    const { getByText } = await render(<MealComponentScreen />, { wrapper });
    expect(getByText('Confirm this item, then add more or finish the meal.')).toBeTruthy();
  });

  it('pads FormScrollView bottomOffset for the post-anchor search-box insert', async () => {
    const { COMPONENT_FORM_BOTTOM_OFFSET } = jest.requireActual<
      typeof import('@/features/logging/ComponentForm')
    >('@/features/logging/ComponentForm');
    await render(<MealComponentScreen />, { wrapper });
    expect(formScrollViewProps.at(-1)?.bottomOffset).toBe(COMPONENT_FORM_BOTTOM_OFFSET);
  });

  it('"Add & scan next" pushes the draft into the builder store and returns to /scan', async () => {
    const { getByLabelText } = await render(<MealComponentScreen />, { wrapper });
    await fireEvent.changeText(getByLabelText('Component name'), 'Peas');
    await fireEvent.press(getByLabelText('Add & scan next'));
    expect(useMealBuilderStore.getState().components).toHaveLength(1);
    expect(useMealBuilderStore.getState().components[0].name).toBe('Peas');
    expect(mockReplace).toHaveBeenCalledWith('/scan');
  });

  it('"Finish meal" pushes the draft and dismisses to /meal/review', async () => {
    const { getByLabelText } = await render(<MealComponentScreen />, { wrapper });
    await fireEvent.changeText(getByLabelText('Component name'), 'Rice');
    await fireEvent.press(getByLabelText('Finish meal'));
    expect(useMealBuilderStore.getState().components).toHaveLength(1);
    expect(mockDismissTo).toHaveBeenCalledWith('/meal/review');
  });

  it('prefills from the component prefill store (e.g. an OFF scan result)', async () => {
    useComponentPrefillStore.setState({ prefill: { name: 'Nutella', barcode: '123' } });
    const { getByDisplayValue } = await render(<MealComponentScreen />, { wrapper });
    expect(getByDisplayValue('Nutella')).toBeTruthy();
  });

  it('stamps sortOrder from the current builder-store length', async () => {
    useMealBuilderStore.setState({
      components: [
        {
          name: 'Peas',
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
        },
      ],
    });
    const { getByLabelText } = await render(<MealComponentScreen />, { wrapper });
    await fireEvent.changeText(getByLabelText('Component name'), 'Rice');
    await fireEvent.press(getByLabelText('Add & scan next'));
    expect(useMealBuilderStore.getState().components[1].sortOrder).toBe(1);
  });
});

describe('MealComponentScreen edit mode (GitHub #25, per-item edit)', () => {
  function builderDraft(name: string, overrides: Partial<MealComponentDraft> = {}): MealComponentDraft {
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
    useMealBuilderStore.setState({
      components: [
        builderDraft('Peas', { calories: 50, servings: 2, ingredientsText: 'peas', tagsJson: '["peas"]', sortOrder: 0 }),
        builderDraft('Rice', { calories: 200, sortOrder: 1 }),
      ],
    });
    mockParams = { edit: '1' };
  });

  it('prefills the form from the draft at that index and offers only "Save item"', async () => {
    const { getByDisplayValue, getByLabelText, queryByLabelText } = await render(<MealComponentScreen />, { wrapper });
    expect(getByDisplayValue('Rice')).toBeTruthy();
    expect(getByDisplayValue('200')).toBeTruthy();
    expect(getByLabelText('Save item')).toBeTruthy();
    expect(queryByLabelText('Add & scan next')).toBeNull();
    expect(queryByLabelText('Finish meal')).toBeNull();
  });

  it('"Save item" replaces that item in place (same index, same sortOrder) and goes back', async () => {
    const { getByLabelText } = await render(<MealComponentScreen />, { wrapper });
    await fireEvent.changeText(getByLabelText('Component name'), 'Brown rice');
    await fireEvent.press(getByLabelText('Save item'));

    const { components } = useMealBuilderStore.getState();
    expect(components).toHaveLength(2);
    expect(components[0].name).toBe('Peas'); // untouched
    expect(components[1]).toMatchObject({ name: 'Brown rice', calories: 200, sortOrder: 1 });
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockDismissTo).not.toHaveBeenCalled();
  });

  it("keeps the item's servings and tags through an edit", async () => {
    mockParams = { edit: '0' };
    const { getByLabelText } = await render(<MealComponentScreen />, { wrapper });
    await fireEvent.press(getByLabelText('Save item'));
    expect(useMealBuilderStore.getState().components[0]).toMatchObject({
      name: 'Peas',
      servings: 2,
      tagsJson: '["peas"]',
    });
  });

  it('validates like the add flow: a blank name is not saved', async () => {
    const { getByLabelText } = await render(<MealComponentScreen />, { wrapper });
    await fireEvent.changeText(getByLabelText('Component name'), '');
    await fireEvent.press(getByLabelText('Save item'));
    expect(useMealBuilderStore.getState().components[1].name).toBe('Rice');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it.each(['abc', '7', '-1', '1.5'])('an invalid edit param "%s" falls back to the normal add flow', async (edit) => {
    mockParams = { edit };
    const { getByLabelText, queryByLabelText } = await render(<MealComponentScreen />, { wrapper });
    expect(getByLabelText('Add & scan next')).toBeTruthy();
    expect(queryByLabelText('Save item')).toBeNull();
  });
});
