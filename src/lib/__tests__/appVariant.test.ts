import { resolveAppIdentity } from '../appVariant';

describe('resolveAppIdentity', () => {
  it('resolves the development identity when APP_VARIANT is "development"', () => {
    expect(resolveAppIdentity('development')).toEqual({
      variant: 'development',
      name: 'TummyTracker (dev)',
      androidPackage: 'com.tummytracker.app.dev',
      iosBundleIdentifier: 'com.tummytracker.app.dev',
      scheme: 'tummytracker-dev',
    });
  });

  it('resolves the production identity when APP_VARIANT is "production"', () => {
    expect(resolveAppIdentity('production')).toEqual({
      variant: 'production',
      name: 'TummyTracker',
      androidPackage: 'com.tummytracker.app',
      iosBundleIdentifier: 'com.tummytracker.app',
      scheme: 'tummytracker',
    });
  });

  it('falls back to production when APP_VARIANT is undefined', () => {
    expect(resolveAppIdentity(undefined).variant).toBe('production');
  });

  it('falls back to production when APP_VARIANT is an empty string', () => {
    expect(resolveAppIdentity('').variant).toBe('production');
  });

  it('falls back to production for an unknown/junk value, never to development', () => {
    expect(resolveAppIdentity('bogus').variant).toBe('production');
    expect(resolveAppIdentity('Development').variant).toBe('production');
    expect(resolveAppIdentity('dev').variant).toBe('production');
  });
});
