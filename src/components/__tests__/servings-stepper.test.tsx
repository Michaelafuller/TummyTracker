import { fireEvent, render } from '@testing-library/react-native';

import { ServingsStepper } from '../servings-stepper';

describe('ServingsStepper', () => {
  it('shows the current value and reports the next step in each direction', async () => {
    const onChange = jest.fn();
    const { getByLabelText, getByTestId } = await render(
      <ServingsStepper itemName="Rice" value={1} onChange={onChange} testID="rice" />,
    );
    expect(getByTestId('rice-value')).toHaveTextContent('1×');
    await fireEvent.press(getByLabelText('Increase servings of Rice'));
    expect(onChange).toHaveBeenLastCalledWith(1.5);
    await fireEvent.press(getByLabelText('Decrease servings of Rice'));
    expect(onChange).toHaveBeenLastCalledWith(0.5);
  });

  it('disables decrease at the minimum without calling onChange', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await render(<ServingsStepper itemName="Rice" value={0.5} onChange={onChange} />);
    const decrease = getByLabelText('Decrease servings of Rice');
    expect(decrease).toBeDisabled();
    await fireEvent.press(decrease);
    expect(onChange).not.toHaveBeenCalled();
  });
});
