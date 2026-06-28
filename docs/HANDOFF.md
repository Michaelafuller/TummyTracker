# HANDOFF.md — UI/UX Sprint (for Sonnet 4.6 execute session)

Read this file first, then `CLAUDE.md` (the constitution) and `PROGRESS.md`.
This session targets **5 UI/UX issues only** — no data-model changes, no new
navigation patterns beyond what is explicitly specced here.

---

## TL;DR

TummyTracker is a local-first food-sensitivity journal (Expo SDK 56 / RN 0.85 /
React 19 / TS 6 / npm, Node 25). **151 tests** · all rungs + `bundle:check` green ·
`main` is clean.

This is a **pure UI/UX sprint**. Five changes, five commits, in the order listed
below. Each commit must leave `npm run typecheck && npm run lint && npm test` green
before you move to the next.

---

## How to work

- **Definition of done for each commit:** `npm run typecheck && npm run lint &&
  npm test` all green. Run them yourself; don't rely on "it should work."
- **After the final commit:** `npm run bundle:check` (Metro export — catches
  transform/babel issues the three rungs don't see).
- One logical change per commit; scoped imperative messages; end with
  `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- No `// @ts-ignore`, no disabling lint rules, no silencing tests.

---

## Architecture pointers (what to know before touching any file)

- **Theme system:** `src/constants/theme.ts` → `Colors.light` / `Colors.dark`;
  `useTheme()` in `src/hooks/use-theme.ts` returns the right palette.
  `ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark` — add a
  token to both objects and it's automatically typed everywhere.
- **Navigation:** root `Stack` in `src/app/_layout.tsx`; `(tabs)` group
  (`src/app/(tabs)/`); `NativeTabs` in `src/components/app-tabs.tsx`.
  When adding or removing a route, update `.expo/types/router.d.ts`
  (`hrefInputParams`, `hrefOutputParams`, and `href` union members).
- **Tab icons:** PNG assets in `assets/images/tabIcons/` at 1×/2×/3× (`name.png`,
  `name@2x.png`, `name@3x.png`); referenced in `app-tabs.tsx` via `require(...)`.
  All use `renderingMode="template"` — they are tinted, so ship them as white
  silhouettes on transparent.
- **`useColorScheme()` returns `null`** on first render (not `'unspecified'`).
  `useTheme()` already handles this. Anywhere else that reads the raw scheme must
  use `scheme === 'dark' ? 'dark' : 'light'`, never `Colors[scheme]` directly.
- **Existing tab files:** `src/app/(tabs)/index.tsx` (Home) and
  `src/app/(tabs)/explore.tsx` (Journal). Adding a file there automatically creates
  a new tab; its route is `/(tabs)/filename`.
- **`BottomTabInset`** in `src/constants/theme.ts` adds scroll padding below the
  tab bar (iOS 50, Android 80). Apply it wherever a screen is a tab so content
  isn't hidden behind the bar.

---

## Sprint changes — execute in this order

---

### Commit 1 — Color scheme rebrand
`feat(ui): new accessible color scheme with primary action token`

#### Why

The current scheme (black/white text inversion for primary CTAs) loses contrast
with the new palette. The primary "Scan barcode" CTA on the home screen becomes
invisible because `theme.text` (#000 in light) blends into the new dark element
backgrounds. We introduce a dedicated `primary` / `primaryText` pair.

#### Files to modify

**`src/constants/theme.ts`**

Replace the `Colors` constant with the following. All values have been verified
against WCAG 2.1 AA/AAA; ratios are noted inline.

```typescript
export const Colors = {
  light: {
    text: '#1A1016',            // 17.1:1 on background — AAA ✓
    background: '#FFFFFF',
    backgroundElement: '#EDF6F6',   // light teal wash — fills, not text bg
    backgroundSelected: '#C5E3E3',  // stronger teal tint for selected state
    textSecondary: '#69585F',       // 6.1:1 on background — AA ✓
    border: '#BCDCDC',              // subtle teal border
    primary: '#5BC0BE',             // CTA button background
    primaryText: '#0D2426',         // 7.0:1 on primary — AAA (large) / AA (small) ✓
  },
  dark: {
    text: '#F0ECEE',            // 13.4:1 on background — AAA ✓
    background: '#0D1C20',          // very dark teal
    backgroundElement: '#162B30',   // cards, inputs
    backgroundSelected: '#1E3D44',  // visible selected state
    textSecondary: '#B7ADCF',       // 7.7:1 on background — AAA ✓
    border: '#2A4A51',              // dark teal border
    primary: '#5BC0BE',             // same teal — 7.6:1 on dark bg ✓
    primaryText: '#0D2426',         // 7.0:1 on primary — same in both modes ✓
  },
} as const;
```

Also update `ThemeColor`:
```typescript
export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
```
(No change needed to the type declaration itself — the intersection updates
automatically when both objects gain `primary` and `primaryText`.)

Also update the android adaptive icon background color (currently `#E6F4FE`, old
scheme):
```json
// in app.json, expo.android.adaptiveIcon
"backgroundColor": "#0D1C20"
```

**`src/components/app-tabs.tsx`**

Fix the `scheme === 'unspecified'` bug (the hook returns `null`, not
`'unspecified'` per the HANDOFF gotchas):

```typescript
// BEFORE
const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
// AFTER — null-safe, same pattern as use-theme.ts
const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
```

Also update the `indicatorColor` and `labelStyle` to use the new `primary` token:
```typescript
indicatorColor={colors.primary}
labelStyle={{ selected: { color: colors.primary } }}
```

**`src/app/(tabs)/index.tsx`**

Swap the primary CTA from the text-inversion trick to the explicit primary token:
```typescript
// Primary CTA (Scan barcode) — BEFORE
style={[styles.cta, { backgroundColor: theme.text }]}
// label: color: theme.background

// AFTER — explicit primary token
style={[styles.cta, { backgroundColor: theme.primary }]}
// label: color: theme.primaryText
```

Update the label style accordingly. All secondary CTAs (`backgroundElement` bg)
and the link row are fine as-is with the new palette values.

#### Propagation check

After changing `Colors`, `grep` for any raw hex strings from the old scheme
(`#000000`, `#ffffff`, `#F0F0F3`, `#60646C`, `#D0D3DA`, `#2A2C31`, `#43474E`,
`#B0B4BA`) in `src/` and replace with `useTheme()` tokens. The only legitimate
raw hex strings remaining in `src/` are:
- `#000` / `#fff` inside `src/app/scan.tsx` (camera overlay — intentionally
  hardcoded black, camera background is always black)
- `rgba(255,255,255,0.92)` in `scan.tsx` (the manual-entry pill, intentional)

#### Definition of done

Three rungs green. Verify visually if possible (EAS preview), but automated
checks are the gate.

---

### Commit 2 — Navigation restructure
`feat(nav): insights and settings promoted to bottom tabs`

#### Goal

Remove the "Insights" and "Reminders" text links from the home screen. Promote
both as proper bottom-tab destinations alongside Home and Journal. The resulting
tab bar: **Home | Journal | Insights | Settings**.

#### Files to create

**`src/app/(tabs)/insights.tsx`**

Copy the full content of `src/app/insights.tsx` verbatim. Then add safe-area
padding so content clears the tab bar:

```typescript
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// in the component:
const insets = useSafeAreaInsets();
// wrap the ScrollView contentContainerStyle:
{ paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + BottomTabInset + Spacing.four }
```

Also import `BottomTabInset` from `@/constants/theme` if not already imported.

**`src/app/(tabs)/settings.tsx`**

Copy the full content of `src/app/settings.tsx` verbatim. Add insets the same
way. Add a `<ThemedText type="subtitle">Settings</ThemedText>` heading at the
top of the scroll content (the modal had a Stack header "Reminders"; the tab
has no Stack header).

#### Files to modify

**`src/app/insights.tsx`** and **`src/app/settings.tsx`** — delete both files
(they are replaced by their `(tabs)/` counterparts). Keeping them would create
duplicate routes and confuse the router.

**`src/app/_layout.tsx`**

Remove the two Stack.Screen entries for `settings` and `insights`:
```typescript
// DELETE these two lines:
<Stack.Screen name="settings" options={{ title: 'Reminders', presentation: 'modal' }} />
<Stack.Screen name="insights" options={{ title: 'Insights', presentation: 'modal' }} />
```

**`src/components/app-tabs.tsx`**

Add two new `NativeTabs.Trigger` entries. Tab icons will reference assets
created in Commit 5 — use `require('@/assets/images/tabIcons/insights.png')`
and `require('@/assets/images/tabIcons/settings.png')`. **These files won't
exist yet, so stub them for now using one of the existing icons (e.g. copy
`explore.png` as `insights.png` and `settings.png` temporarily).** Commit 5
replaces them with real assets. The order should match visual left-to-right:

```typescript
<NativeTabs.Trigger name="index">
  {/* Home — unchanged */}
</NativeTabs.Trigger>
<NativeTabs.Trigger name="explore">
  {/* Journal — unchanged */}
</NativeTabs.Trigger>
<NativeTabs.Trigger name="insights">
  <NativeTabs.Trigger.Label>Insights</NativeTabs.Trigger.Label>
  <NativeTabs.Trigger.Icon
    src={require('@/assets/images/tabIcons/insights.png')}
    renderingMode="template"
  />
</NativeTabs.Trigger>
<NativeTabs.Trigger name="settings">
  <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
  <NativeTabs.Trigger.Icon
    src={require('@/assets/images/tabIcons/settings.png')}
    renderingMode="template"
  />
</NativeTabs.Trigger>
```

Copy the stub PNG files:
```bash
cp assets/images/tabIcons/explore.png assets/images/tabIcons/insights.png
cp assets/images/tabIcons/explore@2x.png assets/images/tabIcons/insights@2x.png
cp assets/images/tabIcons/explore@3x.png assets/images/tabIcons/insights@3x.png
cp assets/images/tabIcons/home.png assets/images/tabIcons/settings.png
cp assets/images/tabIcons/home@2x.png assets/images/tabIcons/settings@2x.png
cp assets/images/tabIcons/home@3x.png assets/images/tabIcons/settings@3x.png
```

**`src/app/(tabs)/index.tsx`**

Remove the entire `<View style={styles.links}>` block containing the Insights
and Reminders Pressables (approximately lines 106–124). Remove the `styles.links`
and `styles.linkRow` entries from the StyleSheet.

**`.expo/types/router.d.ts`**

Add `/(tabs)/insights` and `/(tabs)/settings` to the three union members
(`hrefInputParams`, `hrefOutputParams`, `href`). Remove `/insights` and
`/settings` (bare modal routes) from all three unions if they exist.

#### Definition of done

Three rungs green. No dangling references to the old `/insights` or `/settings`
routes anywhere in `src/`. `grep -r "href.*settings\|href.*insights\|push.*settings\|push.*insights" src/` should return nothing except the new tab trigger definitions.

---

### Commit 3 — Settings screen reorganization + offline mode
`feat(settings): offline mode toggle and settings layout reorganization`

#### Goal

Reorganize `src/app/(tabs)/settings.tsx` into three clearly labeled sections
(Data, Reminders, App), and add a persistent "Offline mode" toggle that disables
all Open Food Facts network calls when on.

#### Offline mode persistence

Use a lightweight prefs file stored in the device's document directory (no new
dependency, no migration, no new package). Create **`src/lib/prefs.ts`**:

```typescript
import { File, Paths } from 'expo-file-system';

export type AppPrefs = {
  offlineMode: boolean;
};

const DEFAULT_PREFS: AppPrefs = { offlineMode: false };
const PREFS_FILENAME = 'prefs.json';

function prefsFile(): File {
  return new File(Paths.document, PREFS_FILENAME);
}

export async function loadPrefs(): Promise<AppPrefs> {
  const file = prefsFile();
  if (!file.exists) return DEFAULT_PREFS;
  try {
    const text = await file.text();
    return { ...DEFAULT_PREFS, ...JSON.parse(text) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(prefs: AppPrefs): Promise<void> {
  prefsFile().write(JSON.stringify(prefs));
}
```

Create **`src/features/prefs/prefsStore.ts`** (a zustand store):

```typescript
import { create } from 'zustand';
import { loadPrefs, savePrefs, type AppPrefs } from '@/lib/prefs';

type PrefsStore = AppPrefs & {
  loaded: boolean;
  load: () => Promise<void>;
  setOfflineMode: (value: boolean) => void;
};

export const usePrefsStore = create<PrefsStore>((set, get) => ({
  offlineMode: false,
  loaded: false,
  load: async () => {
    const prefs = await loadPrefs();
    set({ ...prefs, loaded: true });
  },
  setOfflineMode: (value) => {
    set({ offlineMode: value });
    savePrefs({ ...get(), offlineMode: value });
  },
}));
```

**`src/components/app-providers.tsx`**

Call `usePrefsStore(s => s.load)` on mount so prefs are loaded before any
screen renders. Add to the existing `useEffect` init block (or add a new one):

```typescript
useEffect(() => {
  usePrefsStore.getState().load();
}, []);
```

**`src/features/barcode/useOffLookup.ts`**

Read `offlineMode` from the prefs store and pass `enabled: !offlineMode` to the
`useQuery` call so that the OFF fetch is skipped entirely when offline mode is
active:

```typescript
import { usePrefsStore } from '@/features/prefs/prefsStore';

// inside useOffLookup(barcode):
const offlineMode = usePrefsStore((s) => s.offlineMode);
// add to useQuery options:
enabled: !!barcode && !offlineMode,
```

When offline mode is on and the user scans a barcode, `lookup.isSuccess` will be
false and `lookup.isLoading` will be false — the existing fallback in `scan.tsx`
already handles this (routes to manual entry with barcode attached). No changes
needed in `scan.tsx`.

#### Settings screen layout

Reorganize `src/app/(tabs)/settings.tsx` into three sections with labeled
headers. Use `ThemedText type="smallBold"` as section headers and `<View
style={styles.divider} />` between sections (as the existing screen already does).

Section order:
1. **Data** — Export data, Import data (existing — no change to logic)
2. **Reminders** — Breakfast/Lunch/Dinner toggle + time (existing — no change
   to logic). Update the descriptive copy to remove "Daily local reminders" and
   use something cleaner: `"Scheduled reminders to log meals and rate how they
   sat with you. Nothing leaves your device."`
3. **App** — Offline mode toggle with description:
   ```typescript
   <View style={styles.row}>
     <View style={styles.rowHeader}>
       <View style={styles.rowLabel}>
         <ThemedText type="smallBold">Offline mode</ThemedText>
         <ThemedText type="small" themeColor="textSecondary">
           Disables Open Food Facts lookups. Barcode scans fall back to
           manual entry. No external calls are made.
         </ThemedText>
       </View>
       <Switch
         value={offlineMode}
         onValueChange={setOfflineMode}
         accessibilityLabel="Offline mode"
       />
     </View>
   </View>
   ```

Wire up `offlineMode` and `setOfflineMode` from `usePrefsStore`.

#### Tests

Add **`src/lib/__tests__/prefs.test.ts`** — unit-test `loadPrefs` (returns
defaults when file missing), `savePrefs` + `loadPrefs` round-trip. Mock
`expo-file-system` the same way it is mocked elsewhere in the test suite (check
`jest.config.js` or `__mocks__/` for the pattern; add an inline mock if needed).

#### Definition of done

Three rungs green. `useOffLookup` must pass `enabled: false` to the underlying
query when `offlineMode` is true — verify the integration in the prefs test or a
unit test for `useOffLookup`.

---

### Commit 4 — Collapsible journal calendar
`feat(journal): collapsible week/month calendar in Journal tab`

#### Goal

The full month calendar is the dominant element in the Journal tab. By default,
show only the current week (`WeekCalendar`). A toggle button expands to the full
month `Calendar`. This halves the initial vertical footprint, letting the entry
list show immediately without scrolling.

#### Implementation

`WeekCalendar` is already exported from `react-native-calendars` (verified —
it's at `react-native-calendars/src/expandableCalendar/WeekCalendar/new`).
Import it alongside `Calendar`:

```typescript
import { Calendar, WeekCalendar } from 'react-native-calendars';
```

Add `calendarExpanded` state (default `false`) to `src/app/(tabs)/explore.tsx`.

Replace the `<Calendar ... />` block with a conditional:

```typescript
{/* Month/year toggle header */}
<Pressable
  accessibilityRole="button"
  accessibilityLabel={calendarExpanded ? 'Collapse calendar' : 'Expand calendar'}
  onPress={() => setCalendarExpanded((e) => !e)}
  style={styles.calendarToggle}>
  <ThemedText type="smallBold">
    {/* Format: "June 2026" — derive from selectedDate */}
    {new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    })}
  </ThemedText>
  <ThemedText type="small" themeColor="textSecondary">
    {calendarExpanded ? '▲' : '▼'}
  </ThemedText>
</Pressable>

{calendarExpanded ? (
  <Calendar
    key={`cal-${theme.background}`}
    current={selectedDate}
    onDayPress={(day) => setSelectedDate(day.dateString)}
    markedDates={markedDates}
    enableSwipeMonths
    theme={{ /* unchanged from current */ }}
  />
) : (
  <WeekCalendar
    key={`week-${theme.background}`}
    current={selectedDate}
    onDayPress={(day) => setSelectedDate(day.dateString)}
    markedDates={markedDates}
    theme={{ /* same theme object as Calendar */ }}
    hideDayNames={false}
  />
)}
```

Add to the StyleSheet:
```typescript
calendarToggle: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingVertical: Spacing.two,
},
```

#### Behaviour notes

- `WeekCalendar` does not have an `enableSwipeMonths` prop — swipe on the week
  strip advances by one week naturally. No additional config needed.
- When the user selects a day in week view then expands to month view, the month
  view opens to the month containing `selectedDate` because both use the same
  `current` prop. This is the correct behaviour — no extra state needed.
- The `key` prop on both calendar components includes `theme.background` so the
  calendar re-themes correctly when the device colour scheme changes (same pattern
  as the existing `Calendar` key).
- Do **not** auto-expand when the user switches to "Month" mode — the mode
  segmented control and the calendar expand toggle are independent. Let the user
  control each separately.

#### Definition of done

Three rungs green. If `WeekCalendar` requires additional peer props that cause a
TypeScript error, consult its exported type (`WeekCalendarProps` from
`react-native-calendars`) and satisfy them with sensible defaults.

---

### Commit 5 — App and notification icons
`feat(assets): programmatic app icon and notification icon in new palette`

#### Goal

Replace the placeholder icon with a thematic stomach/gut icon in the new color
palette. Generate: the main app icon, the Android adaptive icon layers, and the
Android notification icon (white monochrome silhouette).

#### Step 1 — Create the SVG source file

Create **`assets/icons/icon.svg`** (1024×1024 coordinate space):

```xml
<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <!-- Background rounded square -->
  <rect width="1024" height="1024" rx="200" ry="200" fill="#326771"/>

  <!-- Stomach silhouette: a rounded, slightly asymmetric blob that reads as
       a digestive organ. Centered at (512, 540), roughly 360×380 bounding box.
       Drawn as a closed filled path in the accent teal. -->
  <path
    d="M 460 240
       C 460 210, 480 195, 512 195
       C 544 195, 564 210, 564 240
       L 564 270
       C 640 278, 700 330, 700 430
       C 700 560, 640 660, 540 700
       C 520 750, 525 800, 550 830
       C 565 848, 555 875, 530 878
       C 505 881, 490 862, 500 835
       C 515 800, 510 750, 490 700
       C 395 655, 340 560, 340 430
       C 340 330, 400 278, 470 270
       L 460 240 Z"
    fill="#5BC0BE"
  />
</svg>
```

Create **`assets/icons/icon-monochrome.svg`** (same structure, icon path fill
changed to `#FFFFFF`, background removed — transparent):

```xml
<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <path
    d="M 460 240 C 460 210, 480 195, 512 195
       C 544 195, 564 210, 564 240 L 564 270
       C 640 278, 700 330, 700 430 C 700 560, 640 660, 540 700
       C 520 750, 525 800, 550 830 C 565 848, 555 875, 530 878
       C 505 881, 490 862, 500 835 C 515 800, 510 750, 490 700
       C 395 655, 340 560, 340 430 C 340 330, 400 278, 470 270 L 460 240 Z"
    fill="#FFFFFF"
  />
</svg>
```

Create **`assets/icons/tab-insights.svg`** (24×24, simple bar-chart silhouette):
```xml
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="14" width="4" height="7" rx="1" fill="white"/>
  <rect x="10" y="9" width="4" height="12" rx="1" fill="white"/>
  <rect x="17" y="4" width="4" height="17" rx="1" fill="white"/>
</svg>
```

Create **`assets/icons/tab-settings.svg`** (24×24, gear/cog silhouette):
```xml
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="3.5" fill="white"/>
  <path fill-rule="evenodd" clip-rule="evenodd" fill="white"
    d="M12 2 L13.5 4.5 L16.5 3.5 L17.5 6.5 L20 7 L20 9 L22 10.5 L20 12 L22 13.5 L20 15 L20 17
       L17.5 17.5 L16.5 20.5 L13.5 19.5 L12 22 L10.5 19.5 L7.5 20.5 L6.5 17.5 L4 17 L4 15
       L2 13.5 L4 12 L2 10.5 L4 9 L4 7 L6.5 6.5 L7.5 3.5 L10.5 4.5 Z
       M12 8.5 A3.5 3.5 0 1 0 12 15.5 A3.5 3.5 0 0 0 12 8.5 Z"/>
</svg>
```

#### Step 2 — Install the SVG rasterizer (dev-only)

```bash
npm install --save-dev @resvg/resvg-js
```

`@resvg/resvg-js` is a pure-WASM Node.js library (no native build step). It
converts SVG to PNG at any resolution. It is a `devDependency` only — it is
never bundled into the app.

#### Step 3 — Create the generation script

Create **`scripts/generate-icons.mjs`**:

```javascript
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { Resvg } from '@resvg/resvg-js';

function rasterize(svgPath, outputPath, width, height) {
  const svg = readFileSync(svgPath, 'utf8');
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
  });
  const pngData = resvg.render();
  writeFileSync(outputPath, pngData.asPng());
  console.log(`  ✓ ${outputPath} (${width}×${height ?? width})`);
}

console.log('Generating app icons…');
// Main app icon
rasterize('assets/icons/icon.svg', 'assets/images/icon.png', 1024);
// Android adaptive icon layers
rasterize('assets/icons/icon.svg', 'assets/images/android-icon-foreground.png', 1024);
rasterize('assets/icons/icon-monochrome.svg', 'assets/images/android-icon-monochrome.png', 1024);
// The background is a solid colour — write a minimal SVG inline
const bgSvg = '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><rect width="1024" height="1024" fill="#0D1C20"/></svg>';
writeFileSync('assets/icons/_bg.svg', bgSvg);
rasterize('assets/icons/_bg.svg', 'assets/images/android-icon-background.png', 1024);

// Splash icon (centred on transparent — use the monochrome style at 200px)
rasterize('assets/icons/icon-monochrome.svg', 'assets/images/splash-icon.png', 200);

// Notification icon: white silhouette, 96×96 (Android requirement)
rasterize('assets/icons/icon-monochrome.svg', 'assets/images/notification-icon.png', 96);

// Tab icons — white silhouettes, template-rendered by NativeTabs
const tabIconSizes = [
  { scale: '', size: 24 },
  { scale: '@2x', size: 48 },
  { scale: '@3x', size: 72 },
];
for (const { scale, size } of tabIconSizes) {
  rasterize(`assets/icons/tab-insights.svg`, `assets/images/tabIcons/insights${scale}.png`, size);
  rasterize(`assets/icons/tab-settings.svg`, `assets/images/tabIcons/settings${scale}.png`, size);
}

console.log('Done.');
```

Run the script:
```bash
node scripts/generate-icons.mjs
```

This produces the final PNG files, overwriting the stubs placed in Commit 2.

#### Step 4 — Wire notification icon in app.json

Add the `notification` key to `expo` in `app.json`:
```json
"notification": {
  "icon": "./assets/images/notification-icon.png",
  "color": "#5BC0BE",
  "androidMode": "default"
}
```

Note: `app.json` has a strict schema. Do not add any key outside the official
EAS/Expo spec. Verify against the Expo docs before committing.

#### Step 5 — Add `generate:icons` script to package.json

```json
"scripts": {
  "generate:icons": "node scripts/generate-icons.mjs"
}
```

#### Definition of done

- Three rungs green (the icon generation is a build asset, not bundled — rungs
  still pass).
- `npm run generate:icons` runs without error and all output PNGs exist.
- `npm run bundle:check` green (run once after this commit as the final
  gate before any EAS build).
- The stub tab icon PNGs from Commit 2 are replaced by the real ones.

---

## Commit sequence summary

| # | Commit message | Key files |
|---|----------------|-----------|
| 1 | `feat(ui): new accessible color scheme with primary action token` | `theme.ts`, `app-tabs.tsx`, `(tabs)/index.tsx` |
| 2 | `feat(nav): insights and settings promoted to bottom tabs` | `(tabs)/insights.tsx` (new), `(tabs)/settings.tsx` (new), `_layout.tsx`, `app-tabs.tsx`, `index.tsx`, route types, stub PNGs |
| 3 | `feat(settings): offline mode toggle and settings layout reorganization` | `lib/prefs.ts` (new), `features/prefs/prefsStore.ts` (new), `app-providers.tsx`, `useOffLookup.ts`, `(tabs)/settings.tsx`, tests |
| 4 | `feat(journal): collapsible week/month calendar in Journal tab` | `(tabs)/explore.tsx` |
| 5 | `feat(assets): programmatic app and notification icons` | `assets/icons/*.svg` (new), `scripts/generate-icons.mjs` (new), generated PNGs, `app.json`, `package.json` |

---

## Gotchas for this sprint

- **`scheme === 'unspecified'` is wrong.** `useColorScheme()` returns `null` on
  first render. Always compare `scheme === 'dark' ? 'dark' : 'light'`.
- **`WeekCalendar` lives at** `react-native-calendars/src/expandableCalendar/WeekCalendar/new`.
  It is exported from the top-level package — `import { WeekCalendar } from
  'react-native-calendars'` works. Its props type is `WeekCalendarProps`.
- **Deleting `app/insights.tsx` and `app/settings.tsx`** removes the Stack routes.
  Update `.expo/types/router.d.ts` accordingly or `tsc` will error on any `<Link
  href="/insights">` or `<Link href="/settings">` remaining anywhere.
- **`BottomTabInset`** is 80 on Android, 50 on iOS. Tab screens need this as
  `paddingBottom` on their scroll content or the last item is hidden behind the
  tab bar.
- **`@resvg/resvg-js`** is a dev dependency only. Never import it from
  application code. The `generate:icons` script is run once manually, not in CI
  or as part of any rung.
- **SVG icon paths:** if the stomach path in Commit 5 looks off after
  rasterizing, adjust the path vertices in `assets/icons/icon.svg`. The
  coordinate space is 1024×1024. Preview locally with any browser before
  re-running the generator.
- **Offline mode + scan flow:** when `offlineMode` is true and the user scans a
  barcode, `useOffLookup` returns `{ isLoading: false, isSuccess: false }`.
  The `useEffect` in `scan.tsx` checks `!lookup.isLoading` and falls through to
  `setPrefill({ barcode })` → `router.replace('/entry/new')`. This is exactly
  the no-network-hit / miss path — no changes to `scan.tsx` required.

---

## Pointers

- `CLAUDE.md` — constitution (conventions, stack, §0 deviations log)
- `PROGRESS.md` — ranked roadmap; the **Tier-1 Trigger watchlist** is the next
  specced feature after this sprint
- `docs/BUILD_PLAN.md` — original phased spec
- `docs/ACCEPTANCE.md` — on-device checklist (update after device testing)
