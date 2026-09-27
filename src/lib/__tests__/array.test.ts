import { chunk } from '../array';

describe('chunk', () => {
  it('returns [] for an empty input (not [[]])', () => {
    expect(chunk([], 500)).toEqual([]);
  });

  it('splits into full-size chunks with a shorter final chunk', () => {
    const rows = Array.from({ length: 1201 }, (_, i) => i);
    const chunks = chunk(rows, 500);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(500);
    expect(chunks[1]).toHaveLength(500);
    expect(chunks[2]).toHaveLength(201);
  });

  it('preserves order across chunk boundaries', () => {
    const rows = Array.from({ length: 10 }, (_, i) => i);
    expect(chunk(rows, 3).flat()).toEqual(rows);
  });

  it('returns a single chunk when rows fit within size', () => {
    expect(chunk([1, 2, 3], 500)).toEqual([[1, 2, 3]]);
  });

  it('handles a size of exactly the row count (one full chunk, no empty trailing one)', () => {
    expect(chunk([1, 2], 2)).toEqual([[1, 2]]);
  });

  it('throws for a non-positive size', () => {
    expect(() => chunk([1], 0)).toThrow();
    expect(() => chunk([1], -1)).toThrow();
  });
});
