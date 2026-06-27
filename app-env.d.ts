/// <reference types="expo/types" />

// Committed counterpart to Expo's auto-generated (and gitignored) expo-env.d.ts.
// Pulls in Expo's ambient module declarations (CSS modules, assets, etc.) so the
// `tsc --noEmit` verification rung passes on a clean checkout, before any
// `expo start` has had a chance to regenerate expo-env.d.ts.

// Drizzle's generated migrations.js imports `.sql` files as strings (resolved by
// Metro via metro.config.js). Declare the module so tsc accepts the import.
declare module '*.sql' {
  const content: string;
  export default content;
}
