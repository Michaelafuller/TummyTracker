# ACCEPTANCE.md — On-device checklist (owner-driven)

The autonomous build verifies everything machine-checkable (`typecheck`, `lint`,
`test`). The items below **cannot** be automated by the agent — they need the
Pixel 5, an EAS build, and your hands/eyes. Run them after the autonomous run (or
at any boundary you like).

## How to get a build on the Pixel 5

```bash
npm install              # if not already
npm run bundle:check     # runs `expo export` — same bundling EAS does; catches
                         # Metro/Babel config bugs the test/typecheck/lint rungs miss
eas login                # your Expo account (set NODE_EXTRA_CA_CERTS behind a proxy)
eas build --profile preview --platform android   # standalone APK, runs offline
# download the .apk, then over USB (no Wi-Fi/proxy needed):
adb install -r path/to/app.apk
```

For live-reload development instead of a standalone APK, build the `development`
profile and run `npx expo start --dev-client`. On a corporate network the device
often can't reach Metro over Wi-Fi — tunnel it over USB with
`adb reverse tcp:8081 tcp:8081` then connect to `http://localhost:8081`.

(`eas.json` profiles are committed. The agent never runs these — they touch your
account and device.)

---

## Phase 0 — Scaffold
- [ ] App launches on the Pixel 5 (dev build) without a redbox.
- [ ] A placeholder home screen renders.

## Phase 1b — Manual entry
- [ ] Add a meal manually: name, slot, time, a couple nutrition fields, notes, sentiment.
- [ ] The 200-char notes counter blocks overflow.
- [ ] Entry persists across an app restart (SQLite).

## Phase 1c — Barcode
- [ ] Scan a real product barcode; nutrition pre-fills from Open Food Facts.
- [ ] Scan an unknown/again-no-network barcode; it drops into the manual form with
      the barcode attached.

## Phase 1d — Browse & edit
- [ ] Entries are grouped by day.
- [ ] Day / week / month calendar toggle works.
- [ ] Open a past entry, add/change its sentiment, save; the change sticks.

## Phase 1e — Reminders
- [ ] Configure a reminder time; the OS permission prompt appears.
- [ ] Receive the local notification at the scheduled time; tapping it opens the app.

## Phase 2 — Bowel-movement tracking
- [ ] Quick-add a bowel movement (optional Bristol 1–7).
- [ ] It renders distinctly in the list/calendar.
- [ ] Filter by type (meals / BMs / both) works.
- [ ] Pre-existing entries still load after the migration.

## Phase 3 — Insights
- [ ] With some seeded data, the Insights screen shows a sensible finding and its
      supporting sample size.
- [ ] Findings read as observations, never medical advice.
