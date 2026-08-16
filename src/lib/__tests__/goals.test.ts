import type { Goal, GoalDirection } from '@/db/schema';
import type { DailyTally } from '../dailyTally';
import { evaluateGoals, exceededCaps, parseGoalThreshold, unmetFloors } from '../goals';
import { NUTRITION_FIELDS, type NutritionField } from '../validation';

function makeGoal(nutrient: NutritionField, direction: GoalDirection, threshold: number, id: string = nutrient): Goal {
  return { id, nutrient, direction, threshold, createdAt: 0 };
}

/** Builds a DailyTally where only the given fields have a total; the rest are null/missing. */
function makeTally(overrides: Partial<Record<NutritionField, number>>): DailyTally {
  const nutrients = {} as DailyTally['nutrients'];
  for (const field of NUTRITION_FIELDS) {
    const total = overrides[field];
    nutrients[field] =
      total !== undefined
        ? { total, loggedCount: 1, missingCount: 0 }
        : { total: null, loggedCount: 0, missingCount: 1 };
  }
  return { entryCount: Object.keys(overrides).length, nutrients };
}

describe('evaluateGoals', () => {
  it('floor: met when total is above threshold', () => {
    const goals = [makeGoal('proteinG', 'floor', 50)];
    const [result] = evaluateGoals(goals, makeTally({ proteinG: 60 }));
    expect(result.met).toBe(true);
    expect(result.total).toBe(60);
    expect(result.shortfall).toBe(0);
  });

  it('floor: exactly at threshold counts as met', () => {
    const goals = [makeGoal('proteinG', 'floor', 50)];
    const [result] = evaluateGoals(goals, makeTally({ proteinG: 50 }));
    expect(result.met).toBe(true);
    expect(result.shortfall).toBe(0);
  });

  it('floor: unmet below threshold, shortfall is the amount still to go', () => {
    const goals = [makeGoal('proteinG', 'floor', 50)];
    const [result] = evaluateGoals(goals, makeTally({ proteinG: 30 }));
    expect(result.met).toBe(false);
    expect(result.shortfall).toBe(20);
  });

  it('cap: within budget when total is below threshold', () => {
    const goals = [makeGoal('fatG', 'cap', 20)];
    const [result] = evaluateGoals(goals, makeTally({ fatG: 10 }));
    expect(result.met).toBe(true);
    expect(result.shortfall).toBe(0);
  });

  it('cap: exactly at threshold counts as met (within budget)', () => {
    const goals = [makeGoal('fatG', 'cap', 20)];
    const [result] = evaluateGoals(goals, makeTally({ fatG: 20 }));
    expect(result.met).toBe(true);
    expect(result.shortfall).toBe(0);
  });

  it('cap: exceeded above threshold, shortfall is the amount over', () => {
    const goals = [makeGoal('fatG', 'cap', 20)];
    const [result] = evaluateGoals(goals, makeTally({ fatG: 25 }));
    expect(result.met).toBe(false);
    expect(result.shortfall).toBe(5);
  });

  it('coerces a null tally total to 0 for judging', () => {
    const goals = [makeGoal('fiberG', 'floor', 10), makeGoal('sugarG', 'cap', 10)];
    const [floorResult, capResult] = evaluateGoals(goals, makeTally({}));
    expect(floorResult.total).toBe(0);
    expect(floorResult.met).toBe(false);
    expect(floorResult.shortfall).toBe(10);
    // A cap with nothing logged is fully within budget.
    expect(capResult.total).toBe(0);
    expect(capResult.met).toBe(true);
    expect(capResult.shortfall).toBe(0);
  });
});

describe('unmetFloors / exceededCaps', () => {
  const goals = [
    makeGoal('proteinG', 'floor', 50, 'protein-goal'),
    makeGoal('fiberG', 'floor', 30, 'fiber-goal'),
    makeGoal('fatG', 'cap', 20, 'fat-goal'),
    makeGoal('sugarG', 'cap', 15, 'sugar-goal'),
  ];
  const tally = makeTally({ proteinG: 20, fiberG: 40, fatG: 25, sugarG: 5 });
  const evaluations = evaluateGoals(goals, tally);

  it('unmetFloors returns only unmet floor goals', () => {
    const result = unmetFloors(evaluations);
    expect(result.map((e) => e.goal.id)).toEqual(['protein-goal']);
  });

  it('exceededCaps returns only exceeded cap goals', () => {
    const result = exceededCaps(evaluations);
    expect(result.map((e) => e.goal.id)).toEqual(['fat-goal']);
  });
});

describe('parseGoalThreshold', () => {
  it('accepts a positive finite number', () => {
    expect(parseGoalThreshold('50')).toBe(50);
    expect(parseGoalThreshold(' 12.5 ')).toBe(12.5);
  });

  it('rejects zero', () => {
    expect(parseGoalThreshold('0')).toBeNull();
  });

  it('rejects negative numbers', () => {
    expect(parseGoalThreshold('-5')).toBeNull();
  });

  it('rejects NaN / non-numeric input', () => {
    expect(parseGoalThreshold('abc')).toBeNull();
  });

  it('rejects empty / whitespace-only input', () => {
    expect(parseGoalThreshold('')).toBeNull();
    expect(parseGoalThreshold('   ')).toBeNull();
  });

  it('rejects Infinity', () => {
    expect(parseGoalThreshold('Infinity')).toBeNull();
  });
});
