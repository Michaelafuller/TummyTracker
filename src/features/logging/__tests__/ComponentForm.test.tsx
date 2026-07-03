import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { fetchOffSearchResults } from '@/features/barcode/api';
import { ComponentForm } from '../ComponentForm';

jest.mock('@/features/barcode/api', () => ({
  fetchOffSearchResults: jest.fn().mockResolvedValue([]),
}));

const mockedFetchOffSearchResults = fetchOffSearchResults as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

function renderForm(props: Partial<React.ComponentProps<typeof ComponentForm>> = {}) {
  return render(
    <ComponentForm sortOrder={0} onSubmit={jest.fn()} submitLabel="Add & scan next" {...props} />,
    { wrapper },
  );
}

beforeEach(() => {
  mockedFetchOffSearchResults.mockReset().mockResolvedValue([]);
});

// RNTL v14 renders asynchronously: `render` and `fireEvent.*` both return promises.
describe('ComponentForm', () => {
  it('submits a built draft with the given sortOrder', async () => {
    const onSubmit = jest.fn();
    const { getByLabelText } = await renderForm({ sortOrder: 2, onSubmit });
    await fireEvent.changeText(getByLabelText('Component name'), 'Canned peas');
    await fireEvent.press(getByLabelText('Add & scan next'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Canned peas', servings: 1, sortOrder: 2 }),
    );
  });

  it('does not submit when the name is blank', async () => {
    const onSubmit = jest.fn();
    const { getByLabelText, findByText } = await renderForm({ sortOrder: 0, onSubmit, submitLabel: 'Finish meal' });
    await fireEvent.press(getByLabelText('Finish meal'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await findByText('Name is required.')).toBeTruthy();
  });

  it('prefills from initial state (e.g. an OFF scan result)', async () => {
    const { getByDisplayValue } = await renderForm({ initial: { name: 'Nutella', servings: '1' } });
    expect(getByDisplayValue('Nutella')).toBeTruthy();
  });

  it('rejects zero servings', async () => {
    const onSubmit = jest.fn();
    const { getByLabelText, findByText } = await renderForm({ onSubmit, submitLabel: 'Finish meal' });
    await fireEvent.changeText(getByLabelText('Component name'), 'Rice');
    await fireEvent.changeText(getByLabelText('Servings'), '0');
    await fireEvent.press(getByLabelText('Finish meal'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await findByText('Servings must be greater than 0.')).toBeTruthy();
  });

  it('invokes the secondary action (Finish meal) with the same validated draft', async () => {
    const onSubmit = jest.fn();
    const onSecondarySubmit = jest.fn();
    const { getByLabelText } = await renderForm({
      sortOrder: 1,
      onSubmit,
      secondaryLabel: 'Finish meal',
      onSecondarySubmit,
    });
    await fireEvent.changeText(getByLabelText('Component name'), 'Rice');
    await fireEvent.press(getByLabelText('Finish meal'));
    expect(onSecondarySubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Rice', sortOrder: 1 }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not render a secondary button when none is provided', async () => {
    const { queryByLabelText } = await renderForm();
    expect(queryByLabelText('Finish meal')).toBeNull();
  });

  describe('search-by-name', () => {
    it('searches on name blur when 2+ chars and no barcode is set', async () => {
      const { getByLabelText } = await renderForm();
      await fireEvent.changeText(getByLabelText('Component name'), 'banana');
      await fireEvent(getByLabelText('Component name'), 'blur');
      await waitFor(() => expect(mockedFetchOffSearchResults).toHaveBeenCalledWith('banana', expect.anything()));
    });

    it('does not search when the component already has a barcode', async () => {
      const { getByLabelText } = await renderForm({ initial: { name: 'Nutella', barcode: '123456' } });
      await fireEvent(getByLabelText('Component name'), 'blur');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockedFetchOffSearchResults).not.toHaveBeenCalled();
    });

    it('only searches once for repeated blurs with the same text', async () => {
      const { getByLabelText } = await renderForm();
      await fireEvent.changeText(getByLabelText('Component name'), 'banana');
      await fireEvent(getByLabelText('Component name'), 'blur');
      await waitFor(() => expect(mockedFetchOffSearchResults).toHaveBeenCalledTimes(1));
      await fireEvent(getByLabelText('Component name'), 'blur');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockedFetchOffSearchResults).toHaveBeenCalledTimes(1);
    });

    it('fills the form and hides the list when a suggestion is tapped', async () => {
      mockedFetchOffSearchResults.mockResolvedValue([
        {
          barcode: '999',
          brand: 'Chiquita',
          found: true,
          name: 'Banana, raw',
          nutrition: {
            calories: 89,
            fatG: 0.3,
            saturatedFatG: 0.1,
            carbsG: 23,
            proteinG: 1.1,
            fiberG: 2.6,
            sugarG: 12,
            sodiumMg: 1,
          },
          servingG: 118,
          ingredientsText: null,
          tags: [],
        },
      ]);
      const { getByLabelText, findByLabelText, queryByLabelText, getByDisplayValue } = await renderForm();
      await fireEvent.changeText(getByLabelText('Component name'), 'banana');
      await fireEvent(getByLabelText('Component name'), 'blur');
      const row = await findByLabelText('Use Banana, raw by Chiquita');
      await fireEvent.press(row);
      expect(getByDisplayValue('Banana, raw')).toBeTruthy();
      expect(queryByLabelText('Use Banana, raw by Chiquita')).toBeNull();
    });

    it('shows a short-lived notice on zero results and hides it when the name changes', async () => {
      mockedFetchOffSearchResults.mockResolvedValue([]);
      const { getByLabelText, findByText, queryByText } = await renderForm();
      await fireEvent.changeText(getByLabelText('Component name'), 'zzzznotfood');
      await fireEvent(getByLabelText('Component name'), 'blur');
      expect(await findByText("Couldn't find nutrition for that — you can still fill it in manually.")).toBeTruthy();
      await fireEvent.changeText(getByLabelText('Component name'), 'zzzznotfood2');
      expect(queryByText("Couldn't find nutrition for that — you can still fill it in manually.")).toBeNull();
    });
  });
});
