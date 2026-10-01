import { delayPhrase, latencyLine, latencySummary } from '../latency';

const HOUR = 60 * 60 * 1000;
const hours = (...h: number[]) => h.map((x) => x * HOUR);

describe('latencySummary', () => {
  it('is null with fewer than 3 delays', () => {
    expect(latencySummary([])).toBeNull();
    expect(latencySummary(hours(2, 5))).toBeNull();
  });

  it('odd n: nearest-rank median and quartiles', () => {
    // n = 5 -> p25 rank 2, p50 rank 3, p75 rank 4.
    expect(latencySummary(hours(9, 3, 5, 4, 20))).toEqual({ medianH: 5, lowH: 4, highH: 9, n: 5 });
  });

  it('even n: nearest-rank median is the lower middle value', () => {
    // n = 4 -> p25 rank 1, p50 rank 2, p75 rank 3.
    expect(latencySummary(hours(2, 4, 6, 8))).toEqual({ medianH: 4, lowH: 2, highH: 6, n: 4 });
  });

  it('n = 3 uses ranks 1, 2, 3', () => {
    expect(latencySummary(hours(10, 1, 4))).toEqual({ medianH: 4, lowH: 1, highH: 10, n: 3 });
  });

  it('rounds to whole hours, and reports anything under an hour as 0', () => {
    expect(latencySummary([2.4 * HOUR, 2.6 * HOUR, 5.5 * HOUR])).toEqual({
      medianH: 3,
      lowH: 2,
      highH: 6,
      n: 3,
    });
    expect(latencySummary([0.2 * HOUR, 0.7 * HOUR, 0.95 * HOUR])).toEqual({
      medianH: 0,
      lowH: 0,
      highH: 0,
      n: 3,
    });
  });
});

describe('latencyLine', () => {
  it('shows the median with the range', () => {
    expect(latencyLine({ medianH: 5, lowH: 3, highH: 8, n: 6 })).toBe('Usually about 5 h later (3–8 h)');
  });

  it('drops the range when it collapses', () => {
    expect(latencyLine({ medianH: 5, lowH: 5, highH: 5, n: 4 })).toBe('Usually about 5 h later');
  });

  it('says within an hour when the median is under an hour', () => {
    expect(latencyLine({ medianH: 0, lowH: 0, highH: 2, n: 4 })).toBe('Usually within an hour');
  });
});

describe('delayPhrase', () => {
  it('reads as hours later or within the hour', () => {
    expect(delayPhrase(5 * HOUR)).toBe('5 h later');
    expect(delayPhrase(5.4 * HOUR)).toBe('5 h later');
    expect(delayPhrase(0.5 * HOUR)).toBe('within the hour');
  });
});
