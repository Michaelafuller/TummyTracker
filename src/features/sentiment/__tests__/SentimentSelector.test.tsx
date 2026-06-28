import { fireEvent, render } from '@testing-library/react-native';

import { SentimentSelector } from '../SentimentSelector';

// RNTL v14 renders asynchronously: `render` and `fireEvent.*` both return promises.
describe('SentimentSelector', () => {
  it('renders all five options and reports the picked value', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await render(<SentimentSelector value={null} onChange={onChange} />);

    expect(getByLabelText('neutral')).toBeTruthy();
    await fireEvent.press(getByLabelText('very satisfied'));
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('marks the selected option and exposes a clear affordance', async () => {
    const onClear = jest.fn();
    const { getByRole, getByLabelText } = await render(
      <SentimentSelector value={4} onChange={jest.fn()} onClear={onClear} />,
    );

    // The picked option is exposed as selected to assistive tech.
    expect(getByRole('button', { name: 'satisfied', selected: true })).toBeTruthy();
    await fireEvent.press(getByLabelText('Clear sentiment'));
    expect(onClear).toHaveBeenCalled();
  });

  it('hides the clear affordance when no value is set', async () => {
    const { queryByLabelText } = await render(
      <SentimentSelector value={null} onChange={jest.fn()} onClear={jest.fn()} />,
    );
    expect(queryByLabelText('Clear sentiment')).toBeNull();
  });
});
