# HANDOFF.md — Execute session: build-variant split + Home-screen layout

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§0 build decisions,
> §4 rungs, §8 conventions). This cycle touches `app.json` → **`app.config.ts`**,
> `eas.json`, `src/lib/appVariant.ts` (new), `flows/*.yaml` (mechanical),
> `docs/E2E.md` + `CLAUDE.md §0` (docs), and — Part B — `src/app/(tabs)/index.tsx`
> + `src/features/logging/RecentFoodPicker.tsx` (+ its test). **Part A is a
> config cycle — `npm run bundle:check` is a mandatory rung this time**, in
> addition to the usual three. No new dependency, no schema change, no device
> needed (flow edits are authored-only; running them is a later test session's
> job, after the owner installs the new dev-variant build).

**Planned 2026-08-21 (Fable plan session). Part A owner-approved 2026-08-16
(PROGRESS Tier 4); Part B owner-requested 2026-08-21.** One cycle, two
independent parts — commit them separately; if one part hits trouble, the
other still lands.

---

## 0. Context — why (verified 2026-08-21, don't re-derive)

All three EAS profiles currently build the same Android package
`com.tummytracker.app` (`app.json:18`), so the dev client and any
preview/production install **displace each other** on the Pixel — and Maestro's
`clearState` wipes whichever app holds that identity, i.e. potentially the
owner's real journal (bit us 2026-08-16). The split gives the development
profile its own identity so both apps coexist and automation is permanently
walled off from real data.

Verified surface (plan session, this worktree):
- `app.json` is static; no `app.config.js/ts` exists yet. Full contents must
  carry over **byte-equivalent for the default variant** — including
  `extra.eas.projectId` (`f7438f6a-…`), `slug: "tummytracker"` (BOTH variants
  keep the same slug/projectId — one EAS project, two packages; standard Expo
  multi-variant practice), plugins, adaptive-icon, notification, splash,
  `experiments` blocks.
- **No app code reads the scheme or app name from config** — no
  `Linking.createURL`, no `expoConfig` identity usage (grepped `src/`). The
  Home header "TummyTracker" is an in-app literal
  (`src/app/(tabs)/index.tsx:52`) and does NOT change with the variant.
- 27 flow files carry `appId: com.tummytracker.app` (23 flows + 4 helpers in
  `flows/_helpers/`). The only live deep-link scheme reference is
  `flows/_helpers/reconnect-dev-client.yaml:31`. (`docs/RESULTS.md:70` also
  shows it but is a historical run report — leave it.)
- `eas.json` has a **strict schema** (CLAUDE.md §0): no comments, no unknown
  keys. `env` is a valid build-profile key.
- Jest uses the `jest-expo` preset with default test matching — a test under
  `src/lib/__tests__/` is picked up automatically.

## 1. The change

### 1.1 Pure resolver first — `src/lib/appVariant.ts` (new)

Pure, no React, no Expo imports (it will be evaluated by Node when the config
loads, and by Jest):

```ts
export type AppVariant = 'development' | 'production';

export interface AppIdentity {
  variant: AppVariant;
  name: string;              // display name
  androidPackage: string;
  iosBundleIdentifier: string;
  scheme: string;            // deep-link scheme
}

export function resolveAppIdentity(variantEnv: string | undefined): AppIdentity
```

- `variantEnv === 'development'` → `{ variant: 'development', name:
  'TummyTracker (dev)', androidPackage: 'com.tummytracker.app.dev',
  iosBundleIdentifier: 'com.tummytracker.app.dev', scheme: 'tummytracker-dev' }`.
- Anything else (undefined, `''`, `'production'`, unknown values) → the
  production identity: `TummyTracker` / `com.tummytracker.app` /
  `com.tummytracker.app` / `tummytracker`. Unknown values deliberately fall
  back to production, never to dev — a typo must not ship a dev-looking
  release identity, and must never let a "real" build land on the dev package.

Unit tests (`src/lib/__tests__/appVariant.test.ts`): the two identities, plus
the fallback cases (undefined, empty string, arbitrary junk → production).

### 1.2 `app.json` → `app.config.ts`

- Create `app.config.ts` at the repo root exporting a function of
  `({ config })` returning the full `ExpoConfig`. Import the resolver with a
  **relative path** (`./src/lib/appVariant`) — the `@/*` alias is a
  Metro/tsconfig alias and does not exist when Expo CLI evaluates the config
  in Node. Type it with `ExpoConfig` from `expo/config` (already a transitive
  dependency of `expo` — do NOT add a package).
- Body: today's `app.json` contents verbatim, with exactly four fields driven
  by `resolveAppIdentity(process.env.APP_VARIANT)`: `name`, `scheme`,
  `ios.bundleIdentifier`, `android.package`. Everything else identical —
  icons, splash, notification color, permissions, plugins, `experiments`,
  `extra` (projectId), `web`, `version`, `orientation`, `slug`.
- **Delete `app.json` in the same commit** (if both exist, Expo may prefer or
  merge confusingly; one source of truth).
- Icon badging for the dev variant: **out of scope** (owner-approved as
  optional; asset work is not worth it this cycle — the "(dev)" name is the
  distinguisher).

### 1.3 `eas.json`

Add to the `development` profile only:

```json
"env": { "APP_VARIANT": "development" }
```

`preview`/`production` get nothing (they resolve to the production identity by
fallback — deliberately not an explicit env, so the fallback path is the one
actually exercised). No other changes; remember the strict schema.

### 1.4 Maestro flows (mechanical, authored-only)

- All 27 files under `flows/` (including `_helpers/`): `appId:
  com.tummytracker.app` → `appId: com.tummytracker.app.dev`.
- `flows/_helpers/reconnect-dev-client.yaml:31`: `tummytracker://…` →
  `tummytracker-dev://expo-development-client/?url=…` (keep the port note and
  the encoded localhost URL exactly as is).
- **Do NOT touch any `assertVisible: "TummyTracker"` line.** Those are
  post-save sync points pinning the in-app Home header literal
  (`index.tsx:52`), which is variant-independent. Maestro text selectors are
  full-regex-match (RESULTS.md 2026-08-16/17 root cause #3), so the new native
  label "TummyTracker (dev)" can no longer accidentally satisfy them — the
  split actually removes the connect-screen/header ambiguity RESULTS root
  cause #2 complained about. Leave them alone.

### 1.5 Docs

- `docs/E2E.md`: update the three `com.tummytracker.app` references (the
  "App not found" troubleshooting row, the `dumpsys` and `run-as` commands in
  the bundle-staleness row) to `com.tummytracker.app.dev`, and add one short
  paragraph: flows now target the dev variant; the real app
  (`com.tummytracker.app`) is never touched by automation; Metro sessions do
  NOT need `APP_VARIANT` set (native identity is baked into the installed
  build — served JS is identity-agnostic).
- Root `CLAUDE.md` §0: add one build-decision bullet — the variant split
  (what/why, one paragraph max, incl. "dev builds get `APP_VARIANT=development`
  via the eas.json development profile's env; config lives in `app.config.ts`;
  the resolver is unit-tested in `src/lib/appVariant.ts`").

## 1B. Part B — Home tab: frozen hero/actions, scrolling Recent

**Owner ask (verbatim intent):** the Recent section should use more of the
viewport, and the title + main buttons should stay frozen — only the Recent
list scrolls.

Current state (verified): `src/app/(tabs)/index.tsx` wraps the whole screen in
one `ScrollView` (`scrollContent` has `flexGrow: 1, justifyContent: 'center'`),
and `RecentFoodPicker` renders search field + up to `limit = 6` rows inline
(Home fetches 50 via `listRecentFoodEntries(50)`; `filterRecents` caps display
at `limit`). `RecentFoodPicker` is used ONLY by the Home screen (verified), so
its API can change freely.

### 1B.1 Layout restructure (`src/app/(tabs)/index.tsx`)

- Remove the outer `ScrollView`. New structure inside the `SafeAreaView`: a
  plain column — hero (fixed), actions (fixed), then the Recent section with
  `flex: 1` so it fills all remaining viewport (this is the "show more"
  part — the section now owns the rest of the screen instead of 6 rows).
- Drop `justifyContent: 'center'`/`flexGrow` (they only made sense for a
  short centered scroll page); keep existing horizontal padding, top padding,
  gaps, and `BottomTabInset` bottom padding so nothing else visually moves.
- Keep the `recents.length > 0` gate: with no recents the lower area is
  simply empty, same as today.

### 1B.2 Scrolling rows (`src/features/logging/RecentFoodPicker.tsx`)

- Heading ("Recent") and the search field stay fixed; only the **rows** live
  in a scrollable container. Put the `ScrollView` inside `RecentFoodPicker`,
  wrapping just the rows list: container gets `flex: 1`, the rows
  `ScrollView` gets `flex: 1` with the existing `gap` moved to its
  `contentContainerStyle`, plus `keyboardShouldPersistTaps="handled"` (so a
  row tap works while the search keyboard is up — same option every other
  scroll screen here uses) and `showsVerticalScrollIndicator` left on
  (default) since the list is now genuinely scrollable.
- A plain `ScrollView` over `.map()` rows is fine at this scale (display cap
  ≤ 50 lightweight rows; `FlashList`/virtualization is explicitly a Tier-4
  backlog item, don't reach for it, and `FlatList` would be a gratuitous
  restructure).
- Raise the display cap so the taller viewport actually shows more: Home
  passes `limit={50}` (matching the existing fetch). Keep the prop default
  at 6 — the component stays usable inline elsewhere.
- No behavior change to search filtering (`filterRecents`) or `onSelect`.

### 1B.3 Tests

- `RecentFoodPicker.test.tsx`: update for the new structure (rows render
  inside the scroll container; more than 6 rows render when `limit` allows —
  e.g. 8 entries + `limit={50}` → all 8 rows present; search filtering still
  works). RNTL renders ScrollView children synchronously, so existing
  queries should mostly survive.
- If a Home-screen test exists (check `src/app/(tabs)/__tests__/`), update it
  for the removed outer ScrollView; if none exists, don't add one this cycle
  (the interaction wiring is unchanged — prefill + push on row tap).

## 2. Definition of done (config cycle — four rungs, not three)

- `npm run typecheck` && `npm run lint` && `npm test` green.
- **`npm run bundle:check` green** — mandatory: the three rungs never evaluate
  `app.config.ts` through the real export path; this does.
- Config spot-check, both variants (do it, paste results into your summary):
  - `npx expo config --type public` → name `TummyTracker`, package/scheme
    production values.
  - Same with `APP_VARIANT=development` in the environment (PowerShell:
    `$env:APP_VARIANT='development'; npx expo config --type public;
    Remove-Item Env:APP_VARIANT`) → `TummyTracker (dev)` /
    `com.tummytracker.app.dev` / `tummytracker-dev`.
- No `// @ts-ignore`, no lint disables, no new dependency.
- Suggested commit split (imperative, scoped, one logical change each):
  1. `feat(config): add unit-tested app-variant identity resolver`
  2. `feat(config): split dev/prod app identity via app.config.ts + eas env`
     (includes the app.json deletion + eas.json env)
  3. `chore(e2e): point flows at the dev-variant appId and scheme` (+ docs
     edits — or split docs into a 4th `docs:` commit if cleaner)
  4. `feat(home): freeze hero and actions, let Recent fill and scroll`
     (Part B, fully independent of 1–3)
- Part B is covered by the three normal rungs (pure JS/TS); the fourth rung
  (`bundle:check`) is owed to Part A but run it after both parts are in.
- End with an execute summary: what shipped per commit, file list, all four
  rung results, both `expo config` spot-check outputs, deviations, punts.

## 3. Not this session (sequencing for the owner, after merge)

1. `eas build --profile development --platform android` → install: appears as
   a separate "TummyTracker (dev)" app; the existing install is untouched.
2. Reclaim `com.tummytracker.app` as the real journal app:
   `eas build --profile preview --platform android` → installs **in place**
   over the currently installed (dev-client) build — same EAS signing key, so
   data survives; export an in-app backup first anyway (CLAUDE.md §0 signing
   caveat).
3. iOS: the variant applies automatically via `ios.bundleIdentifier` whenever
   a development-profile iOS build is next made; no extra work owed now.
4. Test-execute (later session): full Maestro re-run against the dev variant
   (shared-infra rule — appId/scheme changed under every flow), with the
   reconnect helper's Metro port updated per session as usual.
5. Flow rework owed for Part B (test-plan session's call, flagged here):
   `flows/h-recent-foods.yaml` scrolls the old full-page ScrollView to reach
   the second Recent row ("Pizza slice") — with the page no longer scrollable
   and rows in a nested ScrollView, that step's semantics change
   (`scrollUntilVisible` scrolls the innermost scrollable under its target,
   which should still work, but the assertion set deserves a re-check — and
   the frozen CTAs mean `scrollUntilVisible` on "Add an entry manually" et
   al. in other flows now no-op-pass, which is fine). Also re-check the
   keyboard-covers-list behavior noted in RESULTS root cause #5 still holds
   with `keyboardShouldPersistTaps="handled"`.
