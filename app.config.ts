import type { ExpoConfig } from 'expo/config';

// Relative import — the `@/*` alias is a Metro/tsconfig alias and does not
// exist when the Expo CLI evaluates this file in plain Node. The explicit
// `.ts` extension is required too: @expo/config only runs this entry file
// itself through TypeScript transpilation — a nested `require('./foo')` with
// no extension falls through to Node's plain CJS resolver, which only probes
// `.js`/`.json`/`.node` (verified: Node 25's native type-stripping loader is
// keyed to an explicit `.ts` specifier, not implicit extension resolution).
import { resolveAppIdentity } from './src/lib/appVariant.ts';

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
