import {
  DEFAULT_TAP_ACTION,
  EXPERIMENT_SLOT,
  REMINDER_HOUR,
  parseExperimentResponse,
  plannedExperimentNotifications,
  type ExperimentResponseLike,
} from '../experimentNotificationsModel';

const EXP = {
  term: 'lactose',
  startDate: '2026-09-28',
  baselineDays: 14,
  eliminationDays: 14,
  challengeDays: 3,
  observationDays: 3,
};

const local = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();

describe('plannedExperimentNotifications', () => {
  it('plans a reminder for each challenge day, the first observation day and the day the verdict is ready — at 09:00 local', () => {
    const planned = plannedExperimentNotifications(EXP, local(2026, 9, 28, 10));

    // Sample plan for a 14/3/3 experiment on lactose started 2026-09-28.
    expect(planned.map((n) => [n.kind, n.dayKey, n.fireAt.getTime(), n.title, n.body])).toEqual([
      ['challenge', '2026-10-12', local(2026, 10, 12, 9), 'Lactose experiment', 'Challenge day 1 of 3: eat lactose once today and log it'],
      ['challenge', '2026-10-13', local(2026, 10, 13, 9), 'Lactose experiment', 'Challenge day 2 of 3: eat lactose once today and log it'],
      ['challenge', '2026-10-14', local(2026, 10, 14, 9), 'Lactose experiment', 'Challenge day 3 of 3: eat lactose once today and log it'],
      ['observation', '2026-10-15', local(2026, 10, 15, 9), 'Lactose experiment', 'Back to avoiding lactose — keep logging for 3 more days'],
      ['ready', '2026-10-18', local(2026, 10, 18, 9), 'Lactose experiment', 'Your lactose experiment is ready — see the verdict'],
    ]);
    expect(REMINDER_HOUR).toBe(9);
  });

  it('returns only fire times strictly after now', () => {
    // Exactly at 09:00 on challenge day 2 — that one is not "after now".
    const planned = plannedExperimentNotifications(EXP, local(2026, 10, 13, 9));
    expect(planned.map((n) => n.dayKey)).toEqual(['2026-10-14', '2026-10-15', '2026-10-18']);
  });

  it('skips a reminder whose 09:00 already passed today', () => {
    const planned = plannedExperimentNotifications(EXP, local(2026, 10, 12, 9) + 1);
    expect(planned[0].dayKey).toBe('2026-10-13');
  });

  it('is empty once the schedule is finished', () => {
    expect(plannedExperimentNotifications(EXP, local(2026, 10, 18, 9))).toEqual([]);
    expect(plannedExperimentNotifications(EXP, local(2027, 1, 1, 0))).toEqual([]);
  });

  it('keeps every reminder at 09:00 local even when the schedule crosses a DST change', () => {
    // Late Oct / early Nov spans the fall-back change in both the US (Nov 1) and Europe (Oct 25).
    const crossing = { ...EXP, startDate: '2026-10-20', eliminationDays: 14 };
    const planned = plannedExperimentNotifications(crossing, local(2026, 10, 20, 8));
    expect(planned).toHaveLength(5);
    for (const n of planned) {
      expect(n.fireAt.getHours()).toBe(9);
      expect(n.fireAt.getMinutes()).toBe(0);
    }
    // The day keys stay consecutive calendar days across the change.
    expect(planned.map((n) => n.dayKey)).toEqual(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09']);
  });

  it('follows the protocol lengths (7-day elimination, 1 observation day pluralises)', () => {
    const short = { ...EXP, eliminationDays: 7, observationDays: 1 };
    const planned = plannedExperimentNotifications(short, local(2026, 9, 28, 8));
    expect(planned.map((n) => n.dayKey)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
    expect(planned[3].body).toBe('Back to avoiding lactose — keep logging for 1 more day');
  });
});

function response(overrides: Partial<ExperimentResponseLike> & { data?: Record<string, unknown> | null } = {}): ExperimentResponseLike {
  const { data, ...rest } = overrides;
  return {
    actionIdentifier: DEFAULT_TAP_ACTION,
    notification: {
      request: {
        identifier: 'n1',
        content: { data: data === undefined ? { slot: EXPERIMENT_SLOT, experimentId: 'exp1' } : data },
      },
    },
    ...rest,
  };
}

describe('parseExperimentResponse', () => {
  it('returns the experiment id for a plain tap on our notification', () => {
    expect(parseExperimentResponse(response())).toEqual({ experimentId: 'exp1' });
  });

  it('ignores other slots', () => {
    expect(parseExperimentResponse(response({ data: { slot: 'day-check-in', date: '2026-10-12' } }))).toBeNull();
    expect(parseExperimentResponse(response({ data: null }))).toBeNull();
  });

  it('ignores non-default actions', () => {
    expect(parseExperimentResponse(response({ actionIdentifier: 'day-check-in-fine' }))).toBeNull();
  });

  it('ignores a missing or malformed experiment id', () => {
    expect(parseExperimentResponse(response({ data: { slot: EXPERIMENT_SLOT } }))).toBeNull();
    expect(parseExperimentResponse(response({ data: { slot: EXPERIMENT_SLOT, experimentId: 5 } }))).toBeNull();
    expect(parseExperimentResponse(response({ data: { slot: EXPERIMENT_SLOT, experimentId: '' } }))).toBeNull();
  });
});
