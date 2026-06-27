import { parseOptionalNumber } from '../number';

describe('parseOptionalNumber', () => {
  it('treats blank, whitespace, null, and undefined as null (optional)', () => {
    expect(parseOptionalNumber('')).toEqual({ value: null });
    expect(parseOptionalNumber('   ')).toEqual({ value: null });
    expect(parseOptionalNumber(null)).toEqual({ value: null });
    expect(parseOptionalNumber(undefined)).toEqual({ value: null });
  });

  it('parses valid numbers, ignoring surrounding whitespace', () => {
    expect(parseOptionalNumber('42').value).toBe(42);
    expect(parseOptionalNumber(' 3.5 ').value).toBe(3.5);
    expect(parseOptionalNumber('0').value).toBe(0);
  });

  it('errors on non-numeric input', () => {
    expect(parseOptionalNumber('abc').error).toBeDefined();
    expect(parseOptionalNumber('1.2.3').error).toBeDefined();
  });
});
