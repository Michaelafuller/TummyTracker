import appConfig, { resolveAppIdentity } from '../app.config';

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

describe('app.config default export', () => {
  const ORIGINAL_APP_VARIANT = process.env.APP_VARIANT;
  const baseConfig = { name: 'ignored', slug: 'ignored' };

  beforeEach(() => {
    delete process.env.APP_VARIANT;
  });

  afterEach(() => {
    if (ORIGINAL_APP_VARIANT === undefined) {
      delete process.env.APP_VARIANT;
    } else {
      process.env.APP_VARIANT = ORIGINAL_APP_VARIANT;
    }
  });

  it('produces the production identity by default', () => {
    const result = appConfig({ config: baseConfig });
    expect(result.name).toBe('TummyTracker');
    expect(result.scheme).toBe('tummytracker');
    expect(result.ios?.bundleIdentifier).toBe('com.tummytracker.app');
    expect(result.android?.package).toBe('com.tummytracker.app');
    expect(result.extra?.eas?.projectId).toBe('f7438f6a-f52a-4f45-80c9-a71013f94d3c');
  });

  it('produces the development identity when APP_VARIANT=development', () => {
    process.env.APP_VARIANT = 'development';
    const result = appConfig({ config: baseConfig });
    expect(result.name).toBe('TummyTracker (dev)');
    expect(result.scheme).toBe('tummytracker-dev');
    expect(result.ios?.bundleIdentifier).toBe('com.tummytracker.app.dev');
    expect(result.android?.package).toBe('com.tummytracker.app.dev');
    expect(result.extra?.eas?.projectId).toBe('f7438f6a-f52a-4f45-80c9-a71013f94d3c');
  });
});
