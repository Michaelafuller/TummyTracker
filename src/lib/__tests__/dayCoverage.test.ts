import { COVERAGE_WINDOW_DAYS, dayCoverage } from '../dayCoverage';

const DAY = 24 * 60 * 60 * 1000;
// Fixed "now" — local midday, so local-day math never straddles a DST edge
// in the assertions themselves. 2026-06-15, 12:00 local.
const NOW = new Date(2026, 5, 15, 12, 0, 0, 0).getTime();

describe('dayCoverage', () => {
  it('returns null when there is no activity at all', () => {
    expect(dayCoverage([], [], NOW)).toBeNull();
  });

  it('clips the window to the earliest activity day (entries only)', () => {
    const entries = [{ loggedAt: NOW - 3 * DAY }, { loggedAt: NOW }];
    const coverage = dayCoverage(entries, [], NOW);
    expect(coverage).not.toBeNull();
    expect(coverage!.total).toBe(4); // today + the 3 days back to the earliest entry
  });

  it('clips the window to the earliest activity day (check-ins only)', () => {
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const twoDaysAgo = new Date(NOW - 2 * DAY);
    const coverage = dayCoverage([], [{ date: key(twoDaysAgo) }], NOW);
    expect(coverage).not.toBeNull();
    expect(coverage!.total).toBe(3);
  });

  it('counts an entry-only day, a check-in-only day, and a day with both exactly once each', () => {
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const entryOnlyDay = new Date(NOW - 1 * DAY);
    const checkInOnlyDay = new Date(NOW - 2 * DAY);
    const bothDay = new Date(NOW - 3 * DAY);

    const entries = [{ loggedAt: entryOnlyDay.getTime() }, { loggedAt: bothDay.getTime() }];
    const checkIns = [{ date: key(checkInOnlyDay) }, { date: key(bothDay) }];

    const coverage = dayCoverage(entries, checkIns, NOW);
    expect(coverage).not.toBeNull();
    // today (no activity) + entryOnlyDay + checkInOnlyDay + bothDay = 4-day window, 3 covered.
    expect(coverage!.total).toBe(4);
    expect(coverage!.covered).toBe(3);
    expect(coverage!.checkedIn).toBe(2);
  });

  it('counts checkedIn only for days that have a check-in', () => {
    const entries = [{ loggedAt: NOW }];
    const coverage = dayCoverage(entries, [], NOW);
    expect(coverage).not.toBeNull();
    expect(coverage!.checkedIn).toBe(0);
    expect(coverage!.covered).toBe(1);
  });

  it('ignores entries/check-ins dated after today', () => {
    const future = NOW + 10 * DAY;
    const entries = [{ loggedAt: NOW }, { loggedAt: future }];
    const coverage = dayCoverage(entries, [], NOW);
    expect(coverage).not.toBeNull();
    // If the future entry weren't ignored, the window would clip to just
    // today (future is the "earliest" only if it were treated as valid, but
    // it's excluded, so total should reflect only the real, past activity).
    expect(coverage!.total).toBe(1);
    expect(coverage!.covered).toBe(1);
  });

  it('never counts a future check-in date', () => {
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const future = new Date(NOW + 5 * DAY);
    const coverage = dayCoverage([{ loggedAt: NOW }], [{ date: key(future) }], NOW);
    expect(coverage).not.toBeNull();
    expect(coverage!.checkedIn).toBe(0);
    expect(coverage!.total).toBe(1);
  });

  it('a full-history window has exactly windowDays keys, DST-crossing included', () => {
    // Fixed "now" just after a US-style spring-forward DST transition, with
    // activity far enough in the past that the window is never clipped.
    const dstNow = new Date(2026, 2, 20, 12, 0, 0, 0).getTime(); // 2026-03-20
    const entries = [{ loggedAt: dstNow - 60 * DAY }];
    const coverage = dayCoverage(entries, [], dstNow, COVERAGE_WINDOW_DAYS);
    expect(coverage).not.toBeNull();
    expect(coverage!.total).toBe(COVERAGE_WINDOW_DAYS);
  });

  it('respects a custom windowDays override', () => {
    const entries = [{ loggedAt: NOW - 100 * DAY }];
    const coverage = dayCoverage(entries, [], NOW, 7);
    expect(coverage).not.toBeNull();
    expect(coverage!.total).toBe(7);
  });
});
