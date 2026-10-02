// Writes a backup v6 JSON holding an elimination experiment that is READY for
// its verdict today (GitHub #19, Cycle B) — for device checks: import it via
// Settings -> Import data, then Home shows "Lactose experiment · Verdict
// ready" and the experiment screen reads "Likely a trigger".
//
// Dependency-free Node ESM (like generate-icons.mjs). Dates are computed
// relative to the day it runs, so generate it just before a device run:
//
//   node scripts/make-experiment-fixture.mjs [outPath] [--today=YYYY-MM-DD]
//
// Default outPath: .qa-shots/experiment-ready-backup.json (gitignored).
// The script only PRINTS the adb push command — it never runs adb.
//
// Every id is prefixed `fixture-` and stable. The experiment row keeps its id
// on import, so a second import skips it; log entries get fresh ids on import
// (the app's existing import path, for every backup), so import the file once.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_OUT = '.qa-shots/experiment-ready-backup.json';
const TERM = 'lactose';
const PROTOCOL = { baselineDays: 14, eliminationDays: 14, challengeDays: 3, observationDays: 3 };
/** The experiment started this many days before "today" — 14 + 3 + 3 = 20
 * schedule days (start … start+19), so today is the first "ready" day. */
const STARTED_DAYS_AGO = 20;
/** Baseline days (of the first rough ones) with an ibuprofen dose — for the
 * #20 Insights check: a "Medications linked to rough days" finding (the dose
 * day and the next day are all rough) and a confounder caveat on the lactose
 * ingredient finding (7 of its 12 hit meals fall in ibuprofen's window). */
const IBUPROFEN_DOSE_DAYS = 6;
/** Baseline days (of 14) with a bad BM, and challenge days (of 3) with one. Observation days always have one. */
const BASELINE_BAD_DAYS = 10;
const CHALLENGE_BAD_DAYS = 2;

const pad2 = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Local calendar-day arithmetic (setDate — DST-safe, never ms/86 400 000). */
function addDays(key, days) {
  const d = parseKey(key);
  d.setDate(d.getDate() + days);
  return keyOf(d);
}

function at(key, hour) {
  const d = parseKey(key);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

function entry(id, type, dayKey, hour, fields) {
  const loggedAt = at(dayKey, hour);
  return {
    id,
    type,
    mealSlot: null,
    name: '',
    barcode: null,
    loggedAt,
    sentiment: null,
    bristolScale: null,
    symptomType: null,
    severity: null,
    notes: null,
    ingredientsText: null,
    tagsJson: null,
    calories: null,
    fatG: null,
    saturatedFatG: null,
    carbsG: null,
    proteinG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    servingG: null,
    componentCount: null,
    createdAt: loggedAt,
    updatedAt: loggedAt,
    ...fields,
  };
}

const lactoseMeal = (id, dayKey) =>
  entry(id, 'meal', dayKey, 12, {
    mealSlot: 'lunch',
    name: 'Milky pasta',
    ingredientsText: 'pasta, milk, cheese',
    tagsJson: JSON.stringify([TERM]),
  });

const plainMeal = (id, dayKey) =>
  entry(id, 'meal', dayKey, 12, {
    mealSlot: 'lunch',
    name: 'Rice and chicken',
    ingredientsText: 'rice, chicken',
    tagsJson: JSON.stringify(['rice', 'chicken']),
  });

// Bristol 7 counts as a bad BM (isOutcome), so the day is a "rough day".
const badBm = (id, dayKey) => entry(id, 'bowel_movement', dayKey, 15, { name: 'Bowel movement', bristolScale: 7 });

/**
 * The backup object (version 5) for an experiment that is ready today, as
 * seen from `todayKey` ('YYYY-MM-DD', default: the local day this runs).
 * Pure — no I/O — so it can be checked without touching the filesystem.
 */
export function buildExperimentFixture(todayKey = keyOf(new Date())) {
  const startDate = addDays(todayKey, -STARTED_DAYS_AGO);
  const entries = [];

  // Baseline: the 14 days before the start — lactose every day, rough on 10.
  for (let i = 0; i < PROTOCOL.baselineDays; i++) {
    const day = addDays(startDate, -PROTOCOL.baselineDays + i);
    entries.push(lactoseMeal(`fixture-baseline-${day}-meal`, day));
    if (i < BASELINE_BAD_DAYS) entries.push(badBm(`fixture-baseline-${day}-bm`, day));
  }

  // Elimination: a non-lactose meal each day, no outcomes.
  for (let i = 0; i < PROTOCOL.eliminationDays; i++) {
    const day = addDays(startDate, i);
    entries.push(plainMeal(`fixture-elimination-${day}-meal`, day));
  }

  // Challenge: lactose each day, rough on 2 of 3.
  const challengeStart = addDays(startDate, PROTOCOL.eliminationDays);
  for (let i = 0; i < PROTOCOL.challengeDays; i++) {
    const day = addDays(challengeStart, i);
    entries.push(lactoseMeal(`fixture-challenge-${day}-meal`, day));
    if (i < CHALLENGE_BAD_DAYS) entries.push(badBm(`fixture-challenge-${day}-bm`, day));
  }

  // Observation: a meal and a bad BM every day (the reaction carries on).
  const observationStart = addDays(challengeStart, PROTOCOL.challengeDays);
  for (let i = 0; i < PROTOCOL.observationDays; i++) {
    const day = addDays(observationStart, i);
    entries.push(plainMeal(`fixture-observation-${day}-meal`, day));
    entries.push(badBm(`fixture-observation-${day}-bm`, day));
  }

  // Ibuprofen 200 mg at 07:00 on the first IBUPROFEN_DOSE_DAYS baseline days.
  const baselineStart = addDays(startDate, -PROTOCOL.baselineDays);
  const medicationEvents = [];
  const medicationDoses = [];
  for (let i = 0; i < IBUPROFEN_DOSE_DAYS; i++) {
    const day = addDays(baselineStart, i);
    const takenAt = at(day, 7);
    medicationEvents.push({
      id: `fixture-ibuprofen-event-${day}`,
      takenAt,
      timeKnown: true,
      notes: null,
      createdAt: takenAt,
      updatedAt: takenAt,
    });
    medicationDoses.push({
      id: `fixture-ibuprofen-dose-${day}`,
      eventId: `fixture-ibuprofen-event-${day}`,
      medicationId: 'fixture-medication-ibuprofen',
      dose: 200,
      doseUnit: 'mg',
      createdAt: takenAt,
      updatedAt: takenAt,
    });
  }
  const baselineStartedAt = at(baselineStart, 6);

  // #23 day details: stress 5 on the rough baseline days, stress 2 on the
  // calm ones and every elimination day — a "high-stress days" finding and a
  // stress caveat on the lactose finding (its rough baseline meals all fall on
  // high-stress days).
  const dayFactors = [];
  const factorRow = (day, stress) => ({
    id: `fixture-factor-${day}`,
    date: day,
    sleep: null,
    stress,
    alcohol: null,
    caffeine: null,
    period: null,
    createdAt: at(day, 21),
    updatedAt: at(day, 21),
  });
  for (let i = 0; i < PROTOCOL.baselineDays; i++) {
    const day = addDays(startDate, -PROTOCOL.baselineDays + i);
    dayFactors.push(factorRow(day, i < BASELINE_BAD_DAYS ? 5 : 2));
  }
  for (let i = 0; i < PROTOCOL.eliminationDays; i++) {
    dayFactors.push(factorRow(addDays(startDate, i), 2));
  }

  const startedAt = at(startDate, 8);
  return {
    version: 6,
    entries,
    mealComponents: [],
    medications: [
      {
        id: 'fixture-medication-ibuprofen',
        name: 'Ibuprofen',
        defaultDose: 200,
        doseUnit: 'mg',
        frequency: 'as needed',
        startDate: null,
        endDate: null,
        isActive: true,
        notes: null,
        createdAt: baselineStartedAt,
        updatedAt: baselineStartedAt,
      },
    ],
    medicationEvents,
    medicationDoses,
    dayCheckIns: [],
    dayFactors,
    experiments: [
      {
        id: 'fixture-experiment-lactose',
        term: TERM,
        startDate,
        ...PROTOCOL,
        status: 'active',
        verdictJson: null,
        endedAt: null,
        createdAt: startedAt,
        updatedAt: startedAt,
      },
    ],
  };
}

function main(argv) {
  const args = argv.slice(2);
  const todayArg = args.find((a) => a.startsWith('--today='));
  const todayKey = todayArg ? todayArg.slice('--today='.length) : undefined;
  if (todayKey !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(todayKey)) {
    console.error('--today must look like YYYY-MM-DD');
    process.exit(1);
  }
  const outPath = resolve(args.find((a) => !a.startsWith('--')) ?? DEFAULT_OUT);

  const fixture = buildExperimentFixture(todayKey);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n');

  const exp = fixture.experiments[0];
  console.log(`Wrote ${outPath}`);
  console.log(`  ${fixture.entries.length} entries; ${exp.term} experiment started ${exp.startDate} (ready today).`);
  console.log('\nPush it to the phone, then in the app: Settings -> Import data -> pick the file:\n');
  console.log(`  adb push "${outPath}" /sdcard/Download/experiment-ready-backup.json`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv);
}
