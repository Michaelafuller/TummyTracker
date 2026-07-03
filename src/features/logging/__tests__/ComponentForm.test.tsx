import { fireEvent, render } from '@testing-library/react-native';

import { ComponentForm } from '../ComponentForm';

// RNTL v14 renders asynchronously: `render` and `fireEvent.*` both return promises.
describe('ComponentForm', () => {
  it('submits a built draft with the given sortOrder', async () => {
    const onSubmit = jest.fn();
    const { getByLabelText } = await render(
      <ComponentForm sortOrder={2} onSubmit={onSubmit} submitLabel="Add & scan next" />,
    );
    await fireEvent.changeText(getByLabelText('Component name'), 'Canned peas');
    await fireEvent.press(getByLabelText('Add & scan next'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Canned peas', servings: 1, sortOrder: 2 }),
    );
  });

  it('does not submit when the name is blank', async () => {
    const onSubmit = jest.fn();
    const { getByLabelText, findByText } = await render(
      <ComponentForm sortOrder={0} onSubmit={onSubmit} submitLabel="Finish meal" />,
    );
    await fireEvent.press(getByLabelText('Finish meal'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await findByText('Name is required.')).toBeTruthy();
  });

  it('prefills from initial state (e.g. an OFF scan result)', async () => {
    const { getByDisplayValue } = await render(
      <ComponentForm
        sortOrder={0}
        onSubmit={jest.fn()}
        submitLabel="Add & scan next"
        initial={{ name: 'Nutella', servings: '1' }}
      />,
    );
    expect(getByDisplayValue('Nutella')).toBeTruthy();
  });

  it('rejects zero servings', async () => {
    const onSubmit = jest.fn();
    const { getByLabelText, findByText } = await render(
      <ComponentForm sortOrder={0} onSubmit={onSubmit} submitLabel="Finish meal" />,
    );
    await fireEvent.changeText(getByLabelText('Component name'), 'Rice');
    await fireEvent.changeText(getByLabelText('Servings'), '0');
    await fireEvent.press(getByLabelText('Finish meal'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await findByText('Servings must be greater than 0.')).toBeTruthy();
  });

  it('invokes the secondary action (Finish meal) with the same validated draft', async () => {
    const onSubmit = jest.fn();
    const onSecondarySubmit = jest.fn();
    const { getByLabelText } = await render(
      <ComponentForm
        sortOrder={1}
        onSubmit={onSubmit}
        submitLabel="Add & scan next"
        secondaryLabel="Finish meal"
        onSecondarySubmit={onSecondarySubmit}
      />,
    );
    await fireEvent.changeText(getByLabelText('Component name'), 'Rice');
    await fireEvent.press(getByLabelText('Finish meal'));
    expect(onSecondarySubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Rice', sortOrder: 1 }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not render a secondary button when none is provided', async () => {
    const { queryByLabelText } = await render(
      <ComponentForm sortOrder={0} onSubmit={jest.fn()} submitLabel="Add & scan next" />,
    );
    expect(queryByLabelText('Finish meal')).toBeNull();
  });
});
