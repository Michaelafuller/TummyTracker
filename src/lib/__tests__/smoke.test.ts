// Trivial smoke test so `npm test` is green from Phase 0.
// Real pure-logic tests (validators, OFF mapper, correlations) land in later phases.
describe('verification loop', () => {
  it('runs the test runner', () => {
    expect(1 + 1).toBe(2);
  });
});
