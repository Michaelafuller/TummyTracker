import { formatDateInput, formatTimeInput, parseDateTime } from '../datetime';

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
