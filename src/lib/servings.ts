// Pure servings-stepper math for the meal review screen. Servings stay
// free-form on the component form ("0.33" is valid there); the stepper only
// moves between half-serving steps and snaps an off-step value onto the grid.

export const SERVINGS_STEP = 0.5;
export const MIN_STEPPED_SERVINGS = 0.5;
export const MAX_STEPPED_SERVINGS = 20;

// Guards against float noise (e.g. 1.5000000001 / 0.5) landing on the wrong step.
const EPSILON = 1e-9;

export type StepDirection = 'up' | 'down';

/**
 * Next half-serving step strictly above/below `current`, clamped to
 * [MIN_STEPPED_SERVINGS, MAX_STEPPED_SERVINGS]. A value already at (or past)
 * the limit in that direction is returned unchanged.
 */
export function stepServings(current: number, direction: StepDirection): number {
  const units = current / SERVINGS_STEP;
  if (direction === 'up') {
    if (current >= MAX_STEPPED_SERVINGS) return current;
    const next = (Math.floor(units + EPSILON) + 1) * SERVINGS_STEP;
    return Math.min(next, MAX_STEPPED_SERVINGS);
  }
  if (current <= MIN_STEPPED_SERVINGS) return current;
  const next = (Math.ceil(units - EPSILON) - 1) * SERVINGS_STEP;
  return Math.max(next, MIN_STEPPED_SERVINGS);
}

export function canStepServings(current: number, direction: StepDirection): boolean {
  return direction === 'up' ? current < MAX_STEPPED_SERVINGS : current > MIN_STEPPED_SERVINGS;
}

/** "1", "1.5", "0.33" — at most two decimals, no trailing zeros. */
export function formatServings(servings: number): string {
  return String(Math.round(servings * 100) / 100);
}
