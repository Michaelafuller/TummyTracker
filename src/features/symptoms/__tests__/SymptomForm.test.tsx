import { fireEvent, render } from '@testing-library/react-native';

import type { BuiltSymptomEntry } from '../formModel';
import { SymptomForm } from '../SymptomForm';

describe('SymptomForm multi-select (new-symptom screen)', () => {
  it('tapping two chips and saving submits two entries sharing loggedAt/severity/notes', async () => {
    const onSubmit = jest.fn();
    const { findByLabelText } = await render(<SymptomForm onSubmit={onSubmit} />);

    await fireEvent.press(await findByLabelText('Nausea'));
    await fireEvent.press(await findByLabelText('Bloating'));
    await fireEvent.press(await findByLabelText('Save'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const entries = onSubmit.mock.calls[0][0] as BuiltSymptomEntry[];
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.symptomType)).toEqual(['nausea', 'bloating']);
    expect(entries.map((entry) => entry.name)).toEqual(['Nausea', 'Bloating']);
    expect(entries[0].loggedAt).toBe(entries[1].loggedAt);
  });

  it('tapping a selected chip again before save deselects it', async () => {
    const onSubmit = jest.fn();
    const { findByLabelText } = await render(<SymptomForm onSubmit={onSubmit} />);

    await fireEvent.press(await findByLabelText('Nausea'));
    await fireEvent.press(await findByLabelText('Bloating'));
    await fireEvent.press(await findByLabelText('Nausea'));
    await fireEvent.press(await findByLabelText('Save'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const entries = onSubmit.mock.calls[0][0] as BuiltSymptomEntry[];
    expect(entries).toHaveLength(1);
    expect(entries[0].symptomType).toBe('bloating');
  });

  it('an empty selection still saves one generic "Symptom" entry', async () => {
    const onSubmit = jest.fn();
    const { findByLabelText } = await render(<SymptomForm onSubmit={onSubmit} />);

    await fireEvent.press(await findByLabelText('Save'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const entries = onSubmit.mock.calls[0][0] as BuiltSymptomEntry[];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ symptomType: null, name: 'Symptom' });
  });
});

describe('SymptomForm single mode (edit screen)', () => {
  it('tapping a second chip replaces the selection instead of adding to it', async () => {
    const onSubmit = jest.fn();
    const { findByLabelText } = await render(<SymptomForm single onSubmit={onSubmit} />);

    await fireEvent.press(await findByLabelText('Nausea'));
    await fireEvent.press(await findByLabelText('Bloating'));
    await fireEvent.press(await findByLabelText('Save'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const entries = onSubmit.mock.calls[0][0] as BuiltSymptomEntry[];
    expect(entries).toHaveLength(1);
    expect(entries[0].symptomType).toBe('bloating');
  });
});
