import type { Goal } from '@/db/schema';
import type { GoalEvaluation } from '@/lib/goals';
import {
  CHECK_IN_SLOT,
  checkInBodyForFreshDay,
  checkInBodyForToday,
  checkInFromScheduled,
  DEFAULT_CHECK_IN,
  nextCheckInFireDate,
  type ScheduledLike,
} from '../checkInModel';

function makeGoal(nutrient: Goal['nutrient'], threshold: number, id = nutrient): Goal {
  return { id, nutrient, direction: 'floor', threshold, createdAt: 0 };
}

function makeEvaluation(nutrient: Goal['nutrient'], threshold: number, shortfall: number): GoalEvaluation {
  return { goal: makeGoal(nutrient, threshold), total: threshold - shortfall, met: shortfall === 0, shortfall };
}

describe('checkInFromScheduled', () => {
  it('returns disabled defaults when nothing is scheduled', () => {
    expect(checkInFromScheduled([])).toEqual(DEFAULT_CHECK_IN);
  });

  it('reconstructs enabled state from a matching scheduled notification', () => {
    const scheduled: ScheduledLike[] = [{ content: { data: { slot: CHECK_IN_SLOT, hour: 20, minute: 30 } } }];
    expect(checkInFromScheduled(scheduled)).toEqual({ enabled: true, hour: 20, minute: 30 });
  });

  it('ignores notifications with a different slot or malformed data', () => {
    const scheduled: ScheduledLike[] = [
      { content: { data: { slot: 'breakfast', hour: 8, minute: 0 } } },
      { content: { data: { slot: CHECK_IN_SLOT, hour: 'twenty' as unknown as number, minute: 0 } } },
      { content: { data: null } },
    ];
    expect(checkInFromScheduled(scheduled)).toEqual(DEFAULT_CHECK_IN);
  });
});

describe('nextCheckInFireDate', () => {
  it('fires today when hour:minute is still ahead and skipToday is false', () => {
    const now = new Date(2026, 5, 1, 10, 0, 0, 0).getTime();
    const fire = nextCheckInFireDate(now, 20, 0, false);
    expect(fire.getDate()).toBe(1);
    expect(fire.getHours()).toBe(20);
    expect(fire.getMinutes()).toBe(0);
  });

  it('fires tomorrow when today\'s time has already passed', () => {
    const now = new Date(2026, 5, 1, 21, 0, 0, 0).getTime();
    const fire = nextCheckInFireDate(now, 20, 0, false);
    expect(fire.getDate()).toBe(2);
    expect(fire.getHours()).toBe(20);
  });

  it('fires tomorrow when skipToday is true even if the time is still ahead', () => {
    const now = new Date(2026, 5, 1, 10, 0, 0, 0).getTime();
    const fire = nextCheckInFireDate(now, 20, 0, true);
    expect(fire.getDate()).toBe(2);
  });

  it('treats exactly-now as passed (fires tomorrow, not an instant no-op today)', () => {
    const now = new Date(2026, 5, 1, 20, 0, 0, 0).getTime();
    const fire = nextCheckInFireDate(now, 20, 0, false);
    expect(fire.getDate()).toBe(2);
  });

  it('rolls over the month at a midnight edge', () => {
    const now = new Date(2026, 5, 30, 21, 0, 0, 0).getTime();
    const fire = nextCheckInFireDate(now, 20, 0, false);
    expect(fire.getMonth()).toBe(6);
    expect(fire.getDate()).toBe(1);
  });
});

describe('checkInBodyForToday', () => {
  it('describes a single unmet floor with its shortfall and unit', () => {
    const body = checkInBodyForToday([makeEvaluation('proteinG', 50, 22)]);
    expect(body).toBe('Protein: 22g to go');
  });

  it('joins several unmet floors and omits the unit for calories', () => {
    const body = checkInBodyForToday([
      makeEvaluation('proteinG', 50, 22),
      makeEvaluation('fiberG', 30, 5),
      makeEvaluation('calories', 1800, 300),
    ]);
    expect(body).toBe('Protein: 22g to go · Fiber: 5g to go · Calories: 300 to go');
  });
});

describe('checkInBodyForFreshDay', () => {
  it('describes a single open floor', () => {
    const body = checkInBodyForFreshDay([makeGoal('proteinG', 50)]);
    expect(body).toBe('Nothing logged yet — protein 50g is still open.');
  });

  it('describes several open floors with an Oxford "and"', () => {
    const body = checkInBodyForFreshDay([makeGoal('proteinG', 50), makeGoal('fiberG', 30)]);
    expect(body).toBe('Nothing logged yet — protein 50g and fiber 30g are still open.');
  });

  it('joins three or more floors with commas before the final "and"', () => {
    const body = checkInBodyForFreshDay([
      makeGoal('proteinG', 50),
      makeGoal('fiberG', 30),
      makeGoal('calories', 1800),
    ]);
    expect(body).toBe('Nothing logged yet — protein 50g, fiber 30g, and calories 1800 are still open.');
  });
});
