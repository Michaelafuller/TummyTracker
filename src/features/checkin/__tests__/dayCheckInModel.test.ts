import {
  DAY_CHECK_IN_ACTIONS,
  DAY_CHECK_IN_SLOT,
  dayCheckInFireDates,
  parseDayCheckInResponse,
  recordedBannerText,
  type ResponseLike,
} from '../dayCheckInModel';

function response(overrides: Partial<ResponseLike> = {}): ResponseLike {
  return {
    actionIdentifier: DAY_CHECK_IN_ACTIONS.fine,
    notification: {
      request: {
        identifier: 'notif-1',
        content: { data: { slot: DAY_CHECK_IN_SLOT, date: '2026-06-15' } },
      },
    },
    ...overrides,
  };
}

describe('dayCheckInFireDates', () => {
  it('includes today when hour:minute is still ahead and today is unanswered', () => {
    const now = new Date(2026, 5, 15, 10, 0, 0, 0).getTime();
    const dates = dayCheckInFireDates(now, 21, 0, false);
    expect(dates).toHaveLength(7);
    expect(dates[0].getDate()).toBe(15);
    expect(dates[0].getHours()).toBe(21);
  });

  it('excludes today when today is already answered, even if the time is still ahead', () => {
    const now = new Date(2026, 5, 15, 10, 0, 0, 0).getTime();
    const dates = dayCheckInFireDates(now, 21, 0, true);
    expect(dates).toHaveLength(6);
    expect(dates[0].getDate()).toBe(16);
  });

  it('excludes today when the check-in time has already passed', () => {
    const now = new Date(2026, 5, 15, 22, 0, 0, 0).getTime();
    const dates = dayCheckInFireDates(now, 21, 0, false);
    expect(dates).toHaveLength(6);
    expect(dates[0].getDate()).toBe(16);
  });

  it('treats exactly-now as passed (today excluded)', () => {
    const now = new Date(2026, 5, 15, 21, 0, 0, 0).getTime();
    const dates = dayCheckInFireDates(now, 21, 0, false);
    expect(dates).toHaveLength(6);
  });

  it('always includes the following 6 calendar days at hour:minute', () => {
    const now = new Date(2026, 5, 15, 10, 0, 0, 0).getTime();
    const dates = dayCheckInFireDates(now, 21, 15, false);
    for (let i = 1; i <= 6; i++) {
      const d = dates[i];
      expect(d.getDate()).toBe(15 + i);
      expect(d.getHours()).toBe(21);
      expect(d.getMinutes()).toBe(15);
    }
  });

  it('honors an arbitrary hour/minute', () => {
    const now = new Date(2026, 5, 15, 5, 0, 0, 0).getTime();
    const dates = dayCheckInFireDates(now, 6, 45, false);
    expect(dates[0].getHours()).toBe(6);
    expect(dates[0].getMinutes()).toBe(45);
  });
});

describe('parseDayCheckInResponse', () => {
  it('parses a Fine day action', () => {
    const result = parseDayCheckInResponse(response({ actionIdentifier: DAY_CHECK_IN_ACTIONS.fine }));
    expect(result).toEqual({ date: '2026-06-15', status: 'fine' });
  });

  it('parses a Rough day action', () => {
    const result = parseDayCheckInResponse(response({ actionIdentifier: DAY_CHECK_IN_ACTIONS.rough }));
    expect(result).toEqual({ date: '2026-06-15', status: 'rough' });
  });

  it('returns null for a plain body tap (default action identifier)', () => {
    const result = parseDayCheckInResponse(
      response({ actionIdentifier: 'expo.modules.notifications.actions.DEFAULT' }),
    );
    expect(result).toBeNull();
  });

  it('returns null for a different slot', () => {
    const result = parseDayCheckInResponse(
      response({
        notification: {
          request: { identifier: 'n', content: { data: { slot: 'goal-check-in', date: '2026-06-15' } } },
        },
      }),
    );
    expect(result).toBeNull();
  });

  it('returns null when data is missing', () => {
    const result = parseDayCheckInResponse(
      response({ notification: { request: { identifier: 'n', content: {} } } }),
    );
    expect(result).toBeNull();
  });

  it('returns null when data.date is missing', () => {
    const result = parseDayCheckInResponse(
      response({
        notification: {
          request: { identifier: 'n', content: { data: { slot: DAY_CHECK_IN_SLOT } } },
        },
      }),
    );
    expect(result).toBeNull();
  });

  it('returns null when data.date is malformed', () => {
    const result = parseDayCheckInResponse(
      response({
        notification: {
          request: {
            identifier: 'n',
            content: { data: { slot: DAY_CHECK_IN_SLOT, date: 'not-a-date' } },
          },
        },
      }),
    );
    expect(result).toBeNull();
  });
});

describe('recordedBannerText', () => {
  it('reads "Rough day recorded" for today', () => {
    expect(recordedBannerText('rough', '2026-09-03', '2026-09-03')).toBe('✓ Rough day recorded');
  });

  it('reads "Fine day recorded" for today', () => {
    expect(recordedBannerText('fine', '2026-09-03', '2026-09-03')).toBe('✓ Fine day recorded');
  });

  it('adds the date when the answered day is not today', () => {
    expect(recordedBannerText('rough', '2026-09-02', '2026-09-03')).toBe('✓ Rough day recorded for Sep 2');
    expect(recordedBannerText('fine', '2025-12-31', '2026-01-01')).toBe('✓ Fine day recorded for Dec 31');
  });
});
