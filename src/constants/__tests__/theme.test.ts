import { BottomTabInset, Spacing } from '@/constants/theme';

// jest-expo's default test platform is native (ios), where the bottom tab
// bar is in-flow, not overlaid — BottomTabInset must stay 0 so screens don't
// reserve dead padding under it (see theme.ts for the on-device finding).
describe('BottomTabInset', () => {
  it('is 0 on native — the tab bar is in-flow, not overlaid', () => {
    expect(BottomTabInset).toBe(0);
  });
});

describe('Spacing', () => {
  it('is an ascending scale', () => {
    const values = Object.values(Spacing);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });
});
