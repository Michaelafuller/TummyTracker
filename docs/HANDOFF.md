# HANDOFF.md — Test coverage for UI/UX sprint (Sonnet 4.6 execute session)

Read this file first, then `CLAUDE.md` (the constitution).
This is a **test-only session** — no new features, no UI changes. Three new test
files only, one commit, all rungs green.

---

## TL;DR

The UI/UX sprint (5 commits, 2026-06-28) shipped:
- New color scheme + `primary`/`primaryText` tokens
- Insights + Settings as bottom tabs (4-tab bar)
- Offline mode toggle (prefs file, zustand store, `useOffLookup` guard)
- Collapsible week/month calendar in Journal tab
- Programmatic app + notification icons

The execute session wrote `src/lib/__tests__/prefs.test.ts` (3 tests covering
`loadPrefs`/`savePrefs`). Three test gaps remain — write them in a single commit.

**Current test count:** 154 (all rungs green, `bundle:check` green).

---

## How to work

- **Gate:** `npm run typecheck && npm run lint && npm test` must be green after
  your commit. Run them yourself.
- One commit: `test(prefs,barcode,journal): coverage for offline mode and calendar toggle`
  (or split by file if you prefer, but keep it ≤ 3 commits).
- No `// @ts-ignore`. If a type is wrong, fix the type.
- End commit messages with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.

---

## Architecture reminders

- **RNTL v14 is async.** `render(...)` and `fireEvent.*` return Promises — always
  `await` them and destructure queries from the awaited result. The global `screen`
  proxy is unreliable under the jest-expo preset.
- **Zustand stores are module singletons.** Reset with
  `usePrefsStore.setState({ offlineMode: false, loaded: false })` in `beforeEach`
  so tests don't bleed state into each other.
- **`react-native-calendars` is not in the Babel transform list** in `jest.config.js`
  (the `transformIgnorePatterns` allowlist doesn't include it). Mock it at the module
  level to avoid transform errors in the explore screen test.
- **Module path alias:** use `@/...` for all imports (the jest-expo preset resolves
  the tsconfig `@/*` → `./src/*` alias).

---

## Test files to write

---

### 1. `src/features/prefs/__tests__/prefsStore.test.ts`

**Why:** `prefsStore.ts` has two side-effectful actions — `load()` reads from the
filesystem (via `loadPrefs`) and `setOfflineMode()` both updates state and writes
to the filesystem (via `savePrefs`). Neither is covered.

**What to mock:** `@/lib/prefs` — mock both `loadPrefs` and `savePrefs`. The real
implementations hit `expo-file-system`; the unit test only cares about the store's
behaviour.

```typescript
// src/features/prefs/__tests__/prefsStore.test.ts
import { usePrefsStore } from '../prefsStore';

// Jest hoists jest.mock() calls automatically.
jest.mock('@/lib/prefs', () => ({
  loadPrefs: jest.fn(),
  savePrefs: jest.fn(),
}));

// Import AFTER mocking so we get the mock references.
import { loadPrefs, savePrefs } from '@/lib/prefs';

beforeEach(() => {
  // Reset store to known initial state before each test.
  usePrefsStore.setState({ offlineMode: false, loaded: false });
  jest.clearAllMocks();
});

describe('prefsStore.load', () => {
  it('reads from loadPrefs and marks loaded:true', async () => {
    (loadPrefs as jest.Mock).mockResolvedValue({ offlineMode: true });
    await usePrefsStore.getState().load();
    expect(usePrefsStore.getState().offlineMode).toBe(true);
    expect(usePrefsStore.getState().loaded).toBe(true);
  });

  it('marks loaded:true even when offlineMode is false', async () => {
    (loadPrefs as jest.Mock).mockResolvedValue({ offlineMode: false });
    await usePrefsStore.getState().load();
    expect(usePrefsStore.getState().loaded).toBe(true);
    expect(usePrefsStore.getState().offlineMode).toBe(false);
  });
});

describe('prefsStore.setOfflineMode', () => {
  it('updates offlineMode in store state', () => {
    (savePrefs as jest.Mock).mockResolvedValue(undefined);
    usePrefsStore.getState().setOfflineMode(true);
    expect(usePrefsStore.getState().offlineMode).toBe(true);
  });

  it('persists the new value by calling savePrefs', () => {
    (savePrefs as jest.Mock).mockResolvedValue(undefined);
    usePrefsStore.getState().setOfflineMode(true);
    expect(savePrefs).toHaveBeenCalledWith(
      expect.objectContaining({ offlineMode: true }),
    );
  });

  it('toggling false after true persists the false value', () => {
    (savePrefs as jest.Mock).mockResolvedValue(undefined);
    usePrefsStore.getState().setOfflineMode(true);
    usePrefsStore.getState().setOfflineMode(false);
    expect(usePrefsStore.getState().offlineMode).toBe(false);
    expect(savePrefs).toHaveBeenLastCalledWith(
      expect.objectContaining({ offlineMode: false }),
    );
  });
});
```

**Expected output:** 5 new passing tests.

---

### 2. `src/features/barcode/__tests__/useOffLookup.test.ts`

**Why:** The offline mode guard (`enabled: barcode != null && !offlineMode`) is
the key new integration in `useOffLookup.ts`. Without a test, a refactor could
drop the guard silently.

**What to mock:**
- `@/features/barcode/api` — mock `fetchOffProduct` so the hook never makes a real
  network call.
- `@/features/prefs/prefsStore` state — set via `usePrefsStore.setState()` directly
  (the zustand singleton is available in the test module).

**Setup:** `renderHook` needs a `QueryClientProvider` wrapper. Construct a
`QueryClient` with `retry: false` so failed/disabled queries don't spin.

```typescript
// src/features/barcode/__tests__/useOffLookup.test.ts
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';

import { usePrefsStore } from '@/features/prefs/prefsStore';
import { useOffLookup } from '../useOffLookup';

jest.mock('../api', () => ({
  fetchOffProduct: jest.fn().mockResolvedValue({ found: false }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  usePrefsStore.setState({ offlineMode: false, loaded: true });
});

describe('useOffLookup', () => {
  it('is idle (disabled) when barcode is null', async () => {
    const { result } = await renderHook(() => useOffLookup(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.isPending).toBe(true);
  });

  it('is idle (disabled) when offline mode is active', async () => {
    usePrefsStore.setState({ offlineMode: true, loaded: true });
    const { result } = await renderHook(() => useOffLookup('0123456789'), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('is not idle when a barcode is present and offline mode is off', async () => {
    const { result } = await renderHook(() => useOffLookup('0123456789'), { wrapper });
    // The query is enabled — fetchStatus will be 'fetching' or 'idle' after settling,
    // but it will NOT be 'idle' immediately (the fetch is kicked off).
    // Confirm the query is in an active state, not permanently disabled.
    expect(result.current.fetchStatus).not.toBe('idle');
  });
});
```

**Note on the third test:** `fetchStatus === 'fetching'` immediately after `renderHook`
on an enabled query; after the mock resolves it becomes `'idle'` again. The assertion
`not.toBe('idle')` is intentionally loose — it just confirms the query *did* activate.
If this proves flaky, replace with `waitFor(() => expect(result.current.isSuccess).toBe(true))`.

**Expected output:** 3 new passing tests.

---

### 3. `src/app/(tabs)/__tests__/explore.test.tsx`

**Why:** The `calendarExpanded` toggle is new interaction wiring. Per CLAUDE.md
§8, component tests cover interaction wiring. A thin test verifies the
accessibility labels switch correctly and the state transition works.

**What to mock:**
- `react-native-calendars` — not in the Babel transform list; will fail without
  a mock. Use string-component mocks so RNTL can render them without errors.
- `@/features/logging/useEntries` — mock `useAllEntries` to return `[]` (avoids
  the DB).
- `react-native-safe-area-context` — mock `useSafeAreaInsets` to return zero insets
  (standard pattern; check if `jest-expo` already provides this mock via its preset
  before adding manually).
- `@/features/prefs/prefsStore` — mock or set via `usePrefsStore.setState` so the
  store is initialized and doesn't hit the filesystem.

```typescript
// src/app/(tabs)/__tests__/explore.test.tsx
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { usePrefsStore } from '@/features/prefs/prefsStore';

// Calendar library is not Babel-transformed — replace with inert stubs.
jest.mock('react-native-calendars', () => ({
  Calendar: 'MockCalendar',
  WeekCalendar: 'MockWeekCalendar',
  CalendarProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Avoid DB access.
jest.mock('@/features/logging/useEntries', () => ({
  useAllEntries: () => [],
}));

// Stable zero insets (jest-expo may already provide this; add only if needed).
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Import the screen AFTER all mocks are declared.
import BrowseScreen from '../explore';

beforeEach(() => {
  usePrefsStore.setState({ offlineMode: false, loaded: true });
});

describe('BrowseScreen calendar toggle', () => {
  it('defaults to collapsed state (Expand calendar button visible)', async () => {
    const { getByLabelText } = await render(<BrowseScreen />);
    expect(getByLabelText('Expand calendar')).toBeTruthy();
  });

  it('expands when the toggle is pressed', async () => {
    const { getByLabelText } = await render(<BrowseScreen />);
    await fireEvent.press(getByLabelText('Expand calendar'));
    expect(getByLabelText('Collapse calendar')).toBeTruthy();
  });

  it('collapses again on a second press', async () => {
    const { getByLabelText } = await render(<BrowseScreen />);
    await fireEvent.press(getByLabelText('Expand calendar'));
    await fireEvent.press(getByLabelText('Collapse calendar'));
    expect(getByLabelText('Expand calendar')).toBeTruthy();
  });
});
```

**Heads-up:** if `jest-expo` already mocks `react-native-safe-area-context`,
adding a duplicate `jest.mock(...)` for it will shadow the preset's mock.
Check by running the test without that mock first; add it only if you see an
error.

**Expected output:** 3 new passing tests.

---

## Summary

| File | Tests | Priority |
|------|-------|----------|
| `src/features/prefs/__tests__/prefsStore.test.ts` | 5 | High — store side effects uncovered |
| `src/features/barcode/__tests__/useOffLookup.test.ts` | 3 | Medium — offline guard wiring |
| `src/app/(tabs)/__tests__/explore.test.tsx` | 3 | Medium — interaction wiring |

Total new tests: **11** (154 → 165).

## Commit message

```
test(prefs,barcode,journal): coverage for offline mode store and calendar toggle

- prefsStore: load() populates from file, setOfflineMode persists correctly
- useOffLookup: query disabled when offline mode active or barcode null
- BrowseScreen: calendar expand/collapse toggle accessibility wiring
```

---

## Pointers

- `CLAUDE.md` — constitution (conventions, §8 test rules, §0 deviations)
- `PROGRESS.md` — ranked roadmap; update test count after this session
- `src/lib/__tests__/prefs.test.ts` — reference for how expo-file-system is
  mocked under jest-expo (the jest-expo preset provides the mock)
- `src/features/sentiment/__tests__/SentimentSelector.test.tsx` — reference for
  the RNTL v14 `await render` / `await fireEvent` pattern
