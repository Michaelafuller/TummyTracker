import type { ExpoConfig } from 'expo/config';

// The variant-identity resolver is INLINED here rather than imported from
// src/lib/appVariant.ts (deleted). @expo/config only runs *this* entry file
// through TypeScript transpilation — any nested `import`/`require` of a
// local .ts file falls through to Node's plain CJS resolver afterward, which
// would only work on Node >= 23.6 (native type-stripping keyed to an
// explicit `.ts` specifier) and fails outright on older Node with a
// "Unexpected token 'export'" syntax error. EAS cloud build workers may run
// an older/LTS Node, so a runtime import here risked breaking the exact
// `eas build` this cycle exists to enable. Keeping this file import-free
// (aside from the type-only `expo/config` import, which is erased before
// runtime) sidesteps the whole problem. `resolveAppIdentity` and the types
// are re-exported as named exports so they stay unit-testable from
// __tests__/app.config.test.ts.

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

/**
 * Resolves the app's identity (display name, package/bundle id, deep-link
 * scheme) from the `APP_VARIANT` environment variable.
 *
 * Unknown/undefined/empty values deliberately fall back to the production
 * identity, never to development: a typo must not ship a dev-looking release
 * identity, and must never let a "real" build land on the dev package.
 */
export function resolveAppIdentity(variantEnv: string | undefined): AppIdentity {
  if (variantEnv === 'development') {
    return DEVELOPMENT_IDENTITY;
  }
  return PRODUCTION_IDENTITY;
}

// Typed separately: TS infers plugin-array entries as plain `(string | any[])[]`
// from an object-literal position, which isn't assignable to ExpoConfig's
// tuple-shaped `plugins` type ([string, any]). Annotating the array itself
// fixes the inference without needing `as const`/casts on every entry.
const PLUGINS: ExpoConfig['plugins'] = [
  'expo-router',
  [
    'expo-splash-screen',
    {
      backgroundColor: '#0D1C20',
      android: {
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    },
  ],
  'expo-sqlite',
  [
    'expo-camera',
    {
      cameraPermission: 'Allow TummyTracker to use the camera to scan product barcodes.',
    },
  ],
  [
    'expo-notifications',
    {
      color: '#5BC0BE',
    },
  ],
  '@react-native-community/datetimepicker',
  'expo-sharing',
];

export default ({ config }: { config: ExpoConfig }): ExpoConfig => {
  const identity = resolveAppIdentity(process.env.APP_VARIANT);

  // Not annotated as `: ExpoConfig` here — `notification` below is a legacy
  // top-level field (superseded by the expo-notifications plugin config) that
  // Expo still honors at runtime but that `ExpoConfig` no longer types. An
  // annotated object literal would trip TS's excess-property check on it;
  // assigning through an unannotated identifier and letting it flow into the
  // function's declared ExpoConfig return type only does normal structural
  // assignability, which allows the extra known-but-untyped field through.
  const merged = {
    ...config,
    name: identity.name,
    slug: 'tummytracker',
    version: '1.0.0',
    orientation: 'portrait' as const,
    icon: './assets/images/icon.png',
    scheme: identity.scheme,
    userInterfaceStyle: 'automatic' as const,
    ios: {
      icon: './assets/images/icon.png',
      bundleIdentifier: identity.iosBundleIdentifier,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: identity.androidPackage,
      adaptiveIcon: {
        backgroundColor: '#0D1C20',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      permissions: ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO'],
    },
    web: {
      output: 'static' as const,
      favicon: './assets/images/favicon.png',
    },
    notification: {
      icon: './assets/images/notification-icon.png',
      color: '#5BC0BE',
      androidMode: 'default' as const,
    },
    plugins: PLUGINS,
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: 'f7438f6a-f52a-4f45-80c9-a71013f94d3c',
      },
    },
  };

  return merged;
};
