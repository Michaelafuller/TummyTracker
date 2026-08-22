# HANDOFF.md — Execute session: Home "Recent" viewport budget (bottom-inset fix)

> **Read first:** this file only. `CLAUDE.md` is auto-loaded (§4 rungs, §8
> conventions). Touches `src/constants/theme.ts`, `src/app/(tabs)/index.tsx`,
> and a new tiny test. Pure JS/TS — no dependency, no schema, no config, no
> build. The device check is done by the review pass (Fable has the Pixel +
> Metro on 8081), not by you.

**Planned 2026-08-21 (Fable plan session) from an on-device finding.** One
small cycle, one commit (two if you prefer test separate).

---

## 0. The finding (verified on the Pixel 5 — don't re-derive)

The owner reported that the Home tab's Recent list still looks truncated after
the 2026-08-21 "freeze hero/actions, let Recent fill and scroll" change. A
uiautomator dump + painted-box screenshots on the dev variant showed:

- The `flex: 1` chain (`content` → `recentSection` → picker `container` →
  rows `ScrollView`) **works** — it fills whatever remainder it is given.
- The remainder is tiny because `safeArea` reserves
  `paddingBottom: BottomTabInset + Spacing.four` = **104dp ≈ 286px** of dead
  space. The native tab bar is **in-flow** (react-navigation bottom tabs; the
  tab-screen area ends at y=2139 and the bar occupies 2139–2340 *below* it),
  so nothing ever overlaps that padding. `BottomTabInset` only makes sense for
  **web**, where `src/components/app-tabs.web.tsx` positions its tab bar
  `position: 'absolute'` — and ironically `BottomTabInset` resolves to `0`
  on web today (`Platform.select({ ios: 50, android: 80 }) ?? 0`), i.e. the
  constant is backwards: applied where it's dead space, absent where it's
  needed.
- Hero (title + subtitle) + four 59dp buttons + 32dp gaps + 24dp paddings eat
  the rest. Net: the rows `ScrollView` got ~140px ≈ one row on a Pixel 5.

All four tab screens use the constant (`index.tsx`, `goals.tsx`,
`insights.tsx`, `settings.tsx`). The three `ScrollView` screens just end up
with ~104dp of useless scroll slack; Home is the only non-scrolling screen,
so it's the only one where the waste is visible.

## 1. The change

### 1.1 `src/constants/theme.ts` — make the inset platform-correct

```ts
/** Extra bottom padding tab screens need UNDER the tab bar. Only the web tab
 *  bar (app-tabs.web.tsx) is position:absolute and overlays content; native
 *  bottom tabs are in-flow, so the screen area already stops above the bar
 *  (verified on-device 2026-08-21 — this used to reserve 80dp of dead space
 *  on Android and starve Home's Recent list). */
export const BottomTabInset = Platform.select({ web: <web bar height>, default: 0 });
```

Take `<web bar height>` from `app-tabs.web.tsx`'s tab-bar style (its
height/padding; if it has no explicit height, use 80 — the old Android value
— and say so in the commit). Keep the export name and type (`number`).

### 1.2 `src/app/(tabs)/index.tsx` — reclaim the space, tighten gently

- `safeArea.paddingBottom` → `BottomTabInset + Spacing.two` (breathing room
  above the bar; `SafeAreaView` already applies the OS bottom inset).
- `content.gap` → `Spacing.four` (was `five`; 8dp × 2 gaps back to the list).
- Nothing else: keep the hero, the four buttons, their sizes, the frozen
  layout, `limit={50}`, and `RecentFoodPicker` untouched.

Do **not** touch `goals.tsx` / `insights.tsx` / `settings.tsx`: they pick up
the corrected constant automatically (their `insets.bottom + BottomTabInset +
Spacing.four` becomes `insets.bottom + Spacing.four`), which only removes
scroll slack.

### 1.3 Test

Add `src/constants/__tests__/theme.test.ts` (create the dir): under
jest-expo's default native platform, `BottomTabInset` is `0`; and `Spacing`
values are ascending (cheap guard that nobody re-orders the scale). Keep it
tiny.

## 2. Definition of done

- `npm run typecheck` && `npm run lint` && `npm test` green — run them.
- No `// @ts-ignore`, no lint disables, no new dependency.
- Commit: `fix(home): stop reserving a phantom tab-bar inset so Recent can fill
  the viewport` (test may ride along or be `test(theme): …`).
- Execute summary: what changed, the web inset value you chose and why, rung
  counts, deviations.

## 3. After this (review pass, not you)

Fable re-screenshots Home on the Pixel via Metro 8081 and confirms ≥4 Recent
rows visible with the seeded journal. If "a little more" is still wanted,
the next lever is layout, not padding: put "Log bowel movement" and "Log
symptom" side by side (≈ +67dp ≈ one more row) — owner's call, not this
cycle. Maestro: Goals/Insights/Settings flows that scroll to the bottom lose
~104dp of slack; `scrollUntilVisible` is unaffected, but the full regression
already owed will confirm.
