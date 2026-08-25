import { fireEvent, render } from '@testing-library/react-native';

import { createLogEntries } from '@/db/repository';
import NewSymptomScreen from '../new';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('@/db/repository', () => ({
  createLogEntries: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('NewSymptomScreen', () => {
  it('selecting two chips and saving calls createLogEntries once with both entries, then navigates back', async () => {
    (createLogEntries as jest.Mock).mockResolvedValue([]);
    const { findByLabelText } = await render(<NewSymptomScreen />);

    await fireEvent.press(await findByLabelText('Nausea'));
    await fireEvent.press(await findByLabelText('Bloating'));
    await fireEvent.press(await findByLabelText('Save'));

    expect(createLogEntries).toHaveBeenCalledTimes(1);
    const inputs = (createLogEntries as jest.Mock).mock.calls[0][0];
    expect(inputs).toHaveLength(2);
    expect(inputs.map((entry: { symptomType: string | null }) => entry.symptomType)).toEqual([
      'nausea',
      'bloating',
    ]);
    expect(mockBack).toHaveBeenCalled();
  });
});
