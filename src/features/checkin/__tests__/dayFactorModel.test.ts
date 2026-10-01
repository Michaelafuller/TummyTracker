import {
  ALCOHOL_OPTIONS,
  CAFFEINE_OPTIONS,
  PERIOD_OPTIONS,
  SLEEP_OPTIONS,
  STRESS_OPTIONS,
  factorSummary,
} from '../dayFactorModel';

const EMPTY = { date: '2026-06-15', sleep: null, stress: null, alcohol: null, caffeine: null, period: null };
const ON = { trackPeriod: true };
const OFF = { trackPeriod: false };

describe('chip options', () => {
  it('matches the HANDOFF option sets', () => {
    expect(SLEEP_OPTIONS.map((o) => o.label)).toEqual(['Poor', 'OK', 'Good']);
    expect(STRESS_OPTIONS.map((o) => o.value)).toEqual([1, 2, 3, 4, 5]);
    expect(ALCOHOL_OPTIONS.map((o) => o.label)).toEqual(['None', 'Some', 'A lot']);
    expect(ALCOHOL_OPTIONS.map((o) => o.value)).toEqual(['none', 'some', 'a_lot']);
    expect(CAFFEINE_OPTIONS.map((o) => o.label)).toEqual(['None', 'Usual', 'More']);
    expect(PERIOD_OPTIONS.map((o) => o.label)).toEqual(['Yes', 'No']);
  });
});

describe('factorSummary', () => {
  it('is null with no row or nothing set', () => {
    expect(factorSummary(undefined, ON)).toBeNull();
    expect(factorSummary(EMPTY, ON)).toBeNull();
  });

  it('joins the set details in a fixed order', () => {
    expect(factorSummary({ ...EMPTY, sleep: 'poor', stress: 4 }, ON)).toBe('Stress 4 · Poor sleep');
    expect(
      factorSummary({ ...EMPTY, caffeine: 'more', alcohol: 'a_lot', sleep: 'good', stress: 1, period: true }, ON),
    ).toBe('Stress 1 · Good sleep · A lot of alcohol · More caffeine · Period');
  });

  it('words each level', () => {
    expect(factorSummary({ ...EMPTY, sleep: 'ok' }, ON)).toBe('OK sleep');
    expect(factorSummary({ ...EMPTY, alcohol: 'none' }, ON)).toBe('No alcohol');
    expect(factorSummary({ ...EMPTY, alcohol: 'some' }, ON)).toBe('Some alcohol');
    expect(factorSummary({ ...EMPTY, caffeine: 'none' }, ON)).toBe('No caffeine');
    expect(factorSummary({ ...EMPTY, caffeine: 'usual' }, ON)).toBe('Usual caffeine');
    expect(factorSummary({ ...EMPTY, period: false }, ON)).toBe('No period');
  });

  it('never mentions period while tracking is off', () => {
    expect(factorSummary({ ...EMPTY, period: true }, OFF)).toBeNull();
    expect(factorSummary({ ...EMPTY, stress: 3, period: true }, OFF)).toBe('Stress 3');
  });
});
