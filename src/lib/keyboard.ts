// Graceful seam for `react-native-keyboard-controller` (owner-approved,
// Milestone A1 — see docs/PROGRESS.md 2026-08-28). The installed dev client on
// the owner's Pixel predates this dependency's native module, so nothing in
// this app may render a keyboard-controller component (or call into its
// native surface) until the owner's next EAS build ships it.
//
// Unlike src/lib/haptics.ts — which hides its native dependency entirely
// behind an async function and can therefore use a plain dynamic
// `await import(...)` — a `<KeyboardProvider>` is a component that must be
// resolved *synchronously* at module scope (React Compiler forbids
// conditional hooks, and a provider component can't be swapped in after the
// fact without one). So the probe here is synchronous too:
//
//   1. Only the NATIVE module can be missing. The JS package is always
//      bundled by Metro once it's a dependency — there is no scenario where
//      `require('react-native-keyboard-controller')` itself is absent on a
//      built app, only where the Fabric/TurboModule it registers isn't
//      linked into the running native binary.
//   2. `TurboModuleRegistry.get('KeyboardController')` returns `null` (never
//      throws) when the native side isn't there, so it's a safe, synchronous
//      way to detect an old client *before* touching the JS package at all.
//   3. Only once the probe succeeds do we `require` the JS package — wrapped
//      in try/catch as defense in depth, mirroring the haptics precedent's
//      "never let a missing/incompatible native module throw into the
//      caller" rule.
//
// Never render any component from the returned module when this returns
// `null` — mounting the missing native view is what throws on the old
// client, not merely importing the JS module.
//
// In Jest (jest-expo), `TurboModuleRegistry.get` always returns `null` for an
// unregistered spec, so every existing test exercises the fallback path with
// no global mocks required.

import { TurboModuleRegistry } from 'react-native';

export type KCModule = typeof import('react-native-keyboard-controller');

let cached: KCModule | null | undefined;

/**
 * Returns the `react-native-keyboard-controller` module if its native side is
 * linked into the running client, or `null` if it predates this dependency
 * (falls back gracefully — never throws). The result is cached after the
 * first call.
 */
export function getKeyboardController(): KCModule | null {
  if (cached !== undefined) {
    return cached;
  }

  if (!TurboModuleRegistry.get('KeyboardController')) {
    cached = null;
    return cached;
  }

  try {
    // Sync require (not dynamic import) so callers can resolve a component
    // at module scope — see file header for why this can't be async here.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- native-module presence probe must be synchronous; see file header.
    cached = require('react-native-keyboard-controller') as KCModule;
  } catch {
    cached = null;
  }

  return cached;
}
