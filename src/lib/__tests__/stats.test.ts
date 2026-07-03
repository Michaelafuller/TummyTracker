import {
  confidenceTier,
  mean,
  sd,
  seMeanDiff,
  wilsonLowerBound,
} from '../stats';

describe('mean', () => {
  it('averages a list of numbers', () => {
    expect(mean([2, 4, 6])).toBe(4);
  });
});

describe('sd', () => {
  it('computes sample standard deviation (n - 1 denominator)', () => {
    // variance = ((2-4)^2 + (4-4)^2 + (6-4)^2) / (3-1) = (4+0+4)/2 = 4 -> sd = 2
    expect(sd([2, 4, 6])).toBe(2);
  });

  it('returns 0 for fewer than two values', () => {
    expect(sd([5])).toBe(0);
    expect(sd([])).toBe(0);
  });
});

describe('seMeanDiff', () => {
  it('computes the Welch-style standard error of a difference in means', () => {
    // sqrt(2^2/4 + 3^2/9) = sqrt(1 + 1) = sqrt(2)
    expect(seMeanDiff(2, 4, 3, 9)).toBeCloseTo(Math.sqrt(2), 10);
  });
});

describe('wilsonLowerBound', () => {
  it('matches the hand-computed Wilson score lower bound for 8/10 (z=1.96)', () => {
    // Hand computation (Wikipedia closed form, no continuity correction):
    // phat = 0.8, z^2 = 3.8416, denom = 1 + 3.8416/10 = 1.38416
    // centre = 0.8 + 3.8416/20 = 0.99208
    // margin = 1.96 * sqrt(0.8*0.2/10 + 3.8416/400) = 1.96 * sqrt(0.025604) = 0.31362449...
    // lower = (0.99208 - 0.31362449...) / 1.38416 = 0.49015684...
    expect(wilsonLowerBound(8, 10)).toBeCloseTo(0.49015684672072346, 10);
  });

  it('returns 0 when n is 0', () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });

  it('is close to the raw proportion for a large n with a moderate rate', () => {
    // 50/100: phat=0.5, wide n narrows the interval close to 0.5 but below it
    const lower = wilsonLowerBound(50, 100);
    expect(lower).toBeLessThan(0.5);
    expect(lower).toBeGreaterThan(0.4);
  });
});

describe('confidenceTier', () => {
  it('is high when n >= 10 and |effect| >= 2*se', () => {
    // delta=-3, se=0.2357... -> 2*se = 0.4714..., |effect| clears it comfortably
    expect(confidenceTier({ n: 10, effect: -3, se: 0.23570226039551584 })).toBe('high');
  });

  it('is medium when n >= 5 and |effect| >= 1.5*se but below the high bar', () => {
    // delta=-1.3142857142857145, se=0.3066163815620047 -> 1.5se=0.4599..., 2se=0.6132...
    expect(confidenceTier({ n: 5, effect: -1.3142857142857145, se: 0.3066163815620047 })).toBe(
      'medium',
    );
  });

  it('is low when n is below the medium threshold regardless of effect size', () => {
    expect(confidenceTier({ n: 4, effect: -2, se: 0.1 })).toBe('low');
  });

  it('is low when the effect does not clear 1.5*se even with enough n', () => {
    // 1.5*0.5 = 0.75, |0.5| < 0.75
    expect(confidenceTier({ n: 5, effect: 0.5, se: 0.5 })).toBe('low');
  });

  it('is medium (not high) when n is between 5 and 9 even with a huge effect', () => {
    expect(confidenceTier({ n: 9, effect: -10, se: 0.1 })).toBe('medium');
  });
});
