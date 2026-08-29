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
// Never crosses midnight backward, and nudges the offset so the target
// minute-of-hour is >= 4 (room to subtract 1-4 for the other trigger times
// without wrapping to the previous hour). A flow run in the first ~24
// minutes after local midnight can't fully satisfy that nudge — at worst
// some of the five collapse onto the same minute in that rare window; every
// other run of the day gets five genuinely distinct minutes.
const now = new Date();
const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();

let backOffset = Math.min(180, minutesSinceMidnight - 20);
if (backOffset < 20) backOffset = Math.max(5, minutesSinceMidnight - 1);

let target = new Date(now.getTime() - backOffset * 60000);
if (target.getMinutes() < 4) {
  backOffset += 4;
  target = new Date(Math.max(now.getTime() - backOffset * 60000, 0));
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
