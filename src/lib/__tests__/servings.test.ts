import {
  canStepServings,
  formatServings,
  MAX_STEPPED_SERVINGS,
  MIN_STEPPED_SERVINGS,
  stepServings,
} from '../servings';

describe('stepServings', () => {
  it('moves whole and half servings by 0.5', () => {
    expect(stepServings(1, 'up')).toBe(1.5);
    expect(stepServings(1.5, 'up')).toBe(2);
    expect(stepServings(1, 'down')).toBe(0.5);
    expect(stepServings(2, 'down')).toBe(1.5);
  });

  it('snaps an off-step value onto the half-serving grid', () => {
    expect(stepServings(1.2, 'up')).toBe(1.5);
    expect(stepServings(1.2, 'down')).toBe(1);
    expect(stepServings(0.33, 'up')).toBe(0.5);
  });

  it('never steps below the minimum', () => {
    expect(stepServings(MIN_STEPPED_SERVINGS, 'down')).toBe(MIN_STEPPED_SERVINGS);
    expect(stepServings(0.7, 'down')).toBe(MIN_STEPPED_SERVINGS);
    // A typed value already under the minimum is left alone, not bumped up.
    expect(stepServings(0.25, 'down')).toBe(0.25);
  });

  it('never steps above the maximum', () => {
    expect(stepServings(MAX_STEPPED_SERVINGS, 'up')).toBe(MAX_STEPPED_SERVINGS);
    expect(stepServings(19.8, 'up')).toBe(MAX_STEPPED_SERVINGS);
    expect(stepServings(25, 'up')).toBe(25);
  });

  it('is stable against float noise on an exact step', () => {
    expect(stepServings(1.5000000000001, 'up')).toBe(2);
    expect(stepServings(1.4999999999999, 'down')).toBe(1);
  });
});

describe('canStepServings', () => {
  it('disables down at or below the minimum and up at or above the maximum', () => {
    expect(canStepServings(0.5, 'down')).toBe(false);
    expect(canStepServings(0.25, 'down')).toBe(false);
    expect(canStepServings(1, 'down')).toBe(true);
    expect(canStepServings(20, 'up')).toBe(false);
    expect(canStepServings(1, 'up')).toBe(true);
  });
});

describe('formatServings', () => {
  it('drops trailing zeros and caps at two decimals', () => {
    expect(formatServings(1)).toBe('1');
    expect(formatServings(1.5)).toBe('1.5');
    expect(formatServings(1 / 3)).toBe('0.33');
  });
});
