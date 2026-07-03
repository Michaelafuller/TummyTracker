import {
  formatClock,
  formatClock12h,
  formatDateInput,
  formatTime12h,
  formatTimeInput,
  parseClockTime,
  parseDateTime,
} from '../datetime';

describe('datetime helpers', () => {
  it('formats and re-parses a local timestamp round-trip', () => {
    const original = new Date(2026, 5, 27, 8, 30, 0, 0).getTime(); // 2026-06-27 08:30 local
    const dateStr = formatDateInput(original);
    const timeStr = formatTimeInput(original);
    expect(dateStr).toBe('2026-06-27');
    expect(timeStr).toBe('08:30');
    expect(parseDateTime(dateStr, timeStr).ms).toBe(original);
  });

  it('pads single-digit months, days, hours, and minutes', () => {
    const ms = new Date(2026, 0, 3, 4, 5).getTime();
    expect(formatDateInput(ms)).toBe('2026-01-03');
    expect(formatTimeInput(ms)).toBe('04:05');
  });

  it('rejects malformed input', () => {
    expect(parseDateTime('2026-6-27', '08:30').ms).toBeNull();
    expect(parseDateTime('2026-06-27', '8:30').ms).toBeNull();
    expect(parseDateTime('not-a-date', 'nope').ms).toBeNull();
  });

  it('rejects out-of-range and non-existent dates', () => {
    expect(parseDateTime('2026-13-01', '00:00').ms).toBeNull();
    expect(parseDateTime('2026-02-30', '00:00').ms).toBeNull();
    expect(parseDateTime('2026-06-27', '24:00').ms).toBeNull();
  });
});

describe('clock time', () => {
  it('formats hour/minute as HH:MM', () => {
    expect(formatClock(8, 0)).toBe('08:00');
    expect(formatClock(18, 30)).toBe('18:30');
  });

  it('parses valid clock times and rejects invalid ones', () => {
    expect(parseClockTime('08:00')).toEqual({ hour: 8, minute: 0 });
    expect(parseClockTime(' 23:59 ')).toEqual({ hour: 23, minute: 59 });
    expect(parseClockTime('24:00')).toBeNull();
    expect(parseClockTime('08:60')).toBeNull();
    expect(parseClockTime('8:00')).toBeNull();
    expect(parseClockTime('nope')).toBeNull();
  });
});

describe('12-hour clock formatting', () => {
  it('formats hour/minute as 12-hour with no leading zero on hour', () => {
    expect(formatClock12h(0, 5)).toBe('12:05 AM');
    expect(formatClock12h(12, 0)).toBe('12:00 PM');
    expect(formatClock12h(23, 59)).toBe('11:59 PM');
    expect(formatClock12h(15, 7)).toBe('3:07 PM');
    expect(formatClock12h(9, 30)).toBe('9:30 AM');
  });

  it('formats an epoch timestamp as a 12-hour clock string', () => {
    const midnight = new Date(2026, 5, 27, 0, 5).getTime();
    const noon = new Date(2026, 5, 27, 12, 0).getTime();
    const lateNight = new Date(2026, 5, 27, 23, 59).getTime();
    expect(formatTime12h(midnight)).toBe('12:05 AM');
    expect(formatTime12h(noon)).toBe('12:00 PM');
    expect(formatTime12h(lateNight)).toBe('11:59 PM');
  });
});
