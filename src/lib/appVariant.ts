/**
 * Resolves the app's identity (display name, package/bundle id, deep-link
 * scheme) from the `APP_VARIANT` environment variable. Pure — no React, no
 * Expo imports — because it is evaluated by both `app.config.ts` (Node, at
 * Expo-config-load time) and Jest.
 *
 * Unknown/undefined/empty values deliberately fall back to the production
 * identity, never to development: a typo must not ship a dev-looking release
 * identity, and must never let a "real" build land on the dev package.
 */
export type AppVariant = 'development' | 'production';

export interface AppIdentity {
  variant: AppVariant;
  name: string;
  androidPackage: string;
  iosBundleIdentifier: string;
  scheme: string;
}

const DEVELOPMENT_IDENTITY: AppIdentity = {
  variant: 'development',
  name: 'TummyTracker (dev)',
  androidPackage: 'com.tummytracker.app.dev',
  iosBundleIdentifier: 'com.tummytracker.app.dev',
  scheme: 'tummytracker-dev',
};

const PRODUCTION_IDENTITY: AppIdentity = {
  variant: 'production',
  name: 'TummyTracker',
  androidPackage: 'com.tummytracker.app',
  iosBundleIdentifier: 'com.tummytracker.app',
  scheme: 'tummytracker',
};

export function resolveAppIdentity(variantEnv: string | undefined): AppIdentity {
  if (variantEnv === 'development') {
    return DEVELOPMENT_IDENTITY;
  }
  return PRODUCTION_IDENTITY;
}
