// Computes up to 5 distinct-minute times "a few hours ago, same calendar day"
// for trigger meals in seed-ingredient-reactions.yaml / seed-meals-for-insights.yaml,
// plus the shared hour/am-pm the native time picker's text-input mode needs
// (see docs/E2E.md's date/time-picker finding for the picker mechanics).
// All five share one hour + am/pm — they're only minutes apart — so one
// spinner selection covers all of them; only the minute differs, guaranteeing
// distinct-minute loggedAt values (gotcha #6) without touching the date chip
// (they all stay "today", which DateTimeField already defaults to on a fresh
// entry). Callers use as many of triggerMinute1..5 as they need.
//
// Never crosses midnight backward: the target is clamped to today's 00:00,
// because the flows only set the TIME chip — the date chip stays "today", so
// a target that slipped into yesterday would come out as a FUTURE time today
// and the outcome (logged "now") would no longer follow the meals at all.
// (Exactly this bit the 2026-08-29 00:xx full-regression run: the minute>=4
// nudge pushed the target across midnight and m-finding-drilldown seeded
// future meals.) In the first minutes after midnight the five minutes may
// collapse toward 00:00 — harmless: the outcome is still strictly after,
// only meal-vs-meal minute distinctness degrades, which no assertion needs.
const now = new Date();
const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();

let backOffset = Math.min(180, minutesSinceMidnight - 20);
if (backOffset < 20) backOffset = Math.max(5, minutesSinceMidnight - 1);

let target = new Date(Math.max(now.getTime() - backOffset * 60000, startOfToday));
if (target.getMinutes() < 4 && target.getTime() - 4 * 60000 >= startOfToday) {
  target = new Date(target.getTime() - 4 * 60000);
}

const hour24 = target.getHours();
const amPm = hour24 < 12 ? 'AM' : 'PM';
const hour12 = ((hour24 + 11) % 12) + 1;
const baseMinute = target.getMinutes();

output.triggerHour = String(hour12);
output.triggerAmPm = amPm;
output.triggerMinute1 = String(Math.max(baseMinute, 0)).padStart(2, '0');
output.triggerMinute2 = String(Math.max(baseMinute - 1, 0)).padStart(2, '0');
output.triggerMinute3 = String(Math.max(baseMinute - 2, 0)).padStart(2, '0');
output.triggerMinute4 = String(Math.max(baseMinute - 3, 0)).padStart(2, '0');
output.triggerMinute5 = String(Math.max(baseMinute - 4, 0)).padStart(2, '0');
