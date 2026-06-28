import { scaleNutrition } from '../nutrition';

describe('scaleNutrition', () => {
  const base = {
    calories: 100,
    fatG: 10,
    saturatedFatG: 4,
    carbsG: 12,
    proteinG: 5,
    fiberG: 2,
    sugarG: 8,
    sodiumMg: 200,
  };

  it('scales 100g base × 1.0 (noop)', () => {
    const result = scaleNutrition(base, 100);
    expect(result.calories).toBe(100);
    expect(result.fatG).toBe(10.0);
    expect(result.sodiumMg).toBe(200);
  });

  it('doubles all values at 200g', () => {
    const result = scaleNutrition(base, 200);
    expect(result.calories).toBe(200);
    expect(result.fatG).toBe(20.0);
    expect(result.carbsG).toBe(24.0);
    expect(result.sodiumMg).toBe(400);
  });

  it('halves all values at 50g', () => {
    const result = scaleNutrition(base, 50);
    expect(result.calories).toBe(50);
    expect(result.fatG).toBe(5.0);
    expect(result.sodiumMg).toBe(100);
  });

  it('rounds calories and sodiumMg to 0 decimal places', () => {
    const result = scaleNutrition({ calories: 100, sodiumMg: 200 }, 33);
    expect(Number.isInteger(result.calories as number)).toBe(true);
    expect(Number.isInteger(result.sodiumMg as number)).toBe(true);
  });

  it('rounds grams to 1 decimal place', () => {
    const result = scaleNutrition({ fatG: 10 }, 33);
    const str = String(result.fatG);
    const decimals = str.includes('.') ? str.split('.')[1].length : 0;
    expect(decimals).toBeLessThanOrEqual(1);
  });

  it('passes null fields through as null', () => {
    const result = scaleNutrition({ calories: null, fatG: 10 }, 200);
    expect(result.calories).toBeNull();
    expect(result.fatG).toBe(20.0);
  });

  it('handles partial base (missing fields default to null)', () => {
    const result = scaleNutrition({ calories: 50 }, 200);
    expect(result.calories).toBe(100);
    expect(result.fatG).toBeNull();
    expect(result.sodiumMg).toBeNull();
  });
});
