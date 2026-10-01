// Pure HTML builder for the doctor/dietitian PDF report (HANDOFF.md doctor-PDF-
// report cycle §1.1). No React, no Date.now() inside — `now` is passed in so
// this stays fixture-testable, mirroring bmTrends.ts's windowing convention.
//
// This produces a complete, printable HTML document — black-on-white, system
// font stack — for expo-print's printToFileAsync, not the app's own theme.
// Every user-authored string (entry names, notes, ingredient/food tags) is run
// through escapeHtml before being embedded, so a hostile entry name can never
// break out of its cell or inject markup into the generated PDF.

import type { Experiment, LogEntry, Medication, MedicationDose, MedicationEvent } from '@/db/schema';
import { isBristolValue } from '@/features/bm/bristol';
import { isSentimentValue, sentimentLabel } from '@/features/sentiment/scale';
import { isSeverityValue } from '@/features/symptoms/severity';
import { findingInstances, type DrilldownInstance } from '@/features/analysis/drilldown';
import {
  computeInsights,
  type NutrientOutcomeFinding,
  type OutcomeFinding,
} from '@/features/analysis/insights';
import { latencyLine, latencySummary } from '@/features/analysis/latency';
import { pairInstances } from '@/features/analysis/medications';
import {
  formatDayRange,
  phaseStatusLine,
  verdictRatesSentence,
  verdictSummaryLabel,
} from '@/features/experiments/copy';
import { currentPhase, experimentSchedule } from '@/features/experiments/engine';
import { parseFrozenVerdict } from '@/features/experiments/frozenVerdict';
import { dayBounds, formatDateInput, formatLongDate, formatTime12h, MONTHS_LONG } from '@/lib/datetime';
import {
  groupEntriesByDay,
  logEntriesToJournalItems,
  medicationEventsToJournalItems,
  type JournalItem,
} from '@/lib/journal';
import { summarizeMedicationUse, type MedicationUseSummary } from '@/lib/medications';
import { NUTRITION_NOUNS } from '@/lib/nutrition';
import type { ConfidenceTier } from '@/lib/stats';

export const REPORT_RANGES = [14, 30, 90] as const;
export type ReportRangeDays = (typeof REPORT_RANGES)[number];

/** Escapes text for safe embedding in HTML — user-authored strings only pass through here. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function startOfDay(epochMs: number): number {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** e.g. "July 26 – August 24, 2026" (same year), or full dates on both sides across a year boundary. */
function formatRangeLabel(startMs: number, inclusiveEndMs: number): string {
  const start = new Date(startMs);
  const end = new Date(inclusiveEndMs);
  if (start.getFullYear() === end.getFullYear()) {
    return `${MONTHS_LONG[start.getMonth()]} ${start.getDate()} – ${formatLongDate(inclusiveEndMs)}`;
  }
  return `${formatLongDate(startMs)} – ${formatLongDate(inclusiveEndMs)}`;
}

function tierLabel(confidence: ConfidenceTier): string {
  return confidence === 'high' ? 'High' : confidence === 'medium' ? 'Medium' : 'Low';
}

/** "Usually about 5 h later (3–8 h)" from a finding's 24 h instances, or null with fewer than 3 hits (#21). */
function latencyOf(instances: readonly DrilldownInstance[]): string | null {
  const summary = latencySummary(
    instances.flatMap((instance) => (instance.outcomeDelayMs == null ? [] : [instance.outcomeDelayMs])),
  );
  return summary ? latencyLine(summary) : null;
}

/**
 * Shared sentence for an ingredient/combination/food outcome finding, plus
 * the typical-latency sentence when there is one (#21). The report stays at
 * 24 h — slower patterns are not part of it.
 */
function outcomeSentence(f: OutcomeFinding, latency: string | null): string {
  const pct = Math.round(f.hitRate * 100);
  const basePct = Math.round(f.baseRate * 100);
  return (
    `${escapeHtml(f.label)}: ${f.hits} of ${f.occurrences} meals were followed by a rough outcome ` +
    `within 24h (${pct}% vs ${basePct}% baseline) (${tierLabel(f.confidence)} confidence, n=${f.occurrences}).` +
    (latency ? ` ${latency}.` : '')
  );
}

function nutrientSentence(f: NutrientOutcomeFinding): string {
  const pct = Math.round(f.highRate * 100);
  const basePct = Math.round(f.lowRate * 100);
  return (
    `Meals higher in ${NUTRITION_NOUNS[f.nutrient]} (≥ ${f.thresholdValue}) are followed by a rough outcome ` +
    `${pct}% of the time, vs ${basePct}% for lighter meals (${tierLabel(f.confidence)} confidence, n=${f.sampleSize}).`
  );
}

/**
 * A BM's optional "how did it feel?" rating (the `sentiment` column, reused
 * from the old meal-rating field) still prints alongside Bristol — it's a
 * real observation about the BM itself. Meals/snacks no longer carry a
 * sentiment rating in this report; the outcome engine doesn't use it.
 */
function entryDetail(entry: LogEntry): string {
  const parts: string[] = [];
  if (entry.type === 'bowel_movement' && isSentimentValue(entry.sentiment)) {
    parts.push(`Felt ${sentimentLabel(entry.sentiment)}`);
  }
  if (isBristolValue(entry.bristolScale)) parts.push(`Bristol ${entry.bristolScale}`);
  if (isSeverityValue(entry.severity)) parts.push(`Severity ${entry.severity}`);
  return parts.join(' · ');
}

/** One row of the merged Journal table — a log entry or a medication event (#17). */
function journalRowHtml(item: JournalItem): string {
  if (item.kind === 'medication') {
    const time = item.timeKnown ? formatTime12h(item.loggedAt) : 'time not set';
    const notes = item.notes != null && item.notes !== '' ? escapeHtml(item.notes) : '';
    // `item.summary` is built from user-authored medication names/units
    // (lib/journal.ts) but never escaped there — escaping the whole joined
    // string here is equivalent and keeps every user-authored piece covered
    // (HANDOFF.md §0).
    return `<tr><td>${time}</td><td>Medication</td><td>${escapeHtml(item.summary)}</td><td>${notes}</td></tr>`;
  }

  const entry = item.entry;
  const notes = entry.notes != null && entry.notes !== '' ? escapeHtml(entry.notes) : '';
  return (
    `<tr><td>${formatTime12h(entry.loggedAt)}</td>` +
    `<td>${escapeHtml(entry.name)}</td>` +
    `<td>${entryDetail(entry)}</td>` +
    `<td>${notes}</td></tr>`
  );
}

/** One row of the Medications table (#17): name (+ " (inactive)"), doses logged,
 *  days with a logged dose, snapshot amounts, and the frequency as entered. */
function medicationRowHtml(row: MedicationUseSummary): string {
  const name = escapeHtml(row.name) + (row.isActive ? '' : ' (inactive)');
  const daysCell = `${row.daysWithDose} of ${row.daysInRange}`;
  const amountsCell =
    row.amounts.length === 0
      ? row.dosesLogged === 0
        ? 'No doses logged in this range'
        : '—'
      : row.amounts.map((a) => `${escapeHtml(a.label)} ×${a.count}`).join(', ');
  const trimmedFrequency = row.frequency?.trim() ?? '';
  const frequencyCell = trimmedFrequency.length > 0 ? escapeHtml(trimmedFrequency) : '—';

  return (
    `<tr><td>${name}</td><td>${row.dosesLogged}</td><td>${daysCell}</td>` +
    `<td>${amountsCell}</td><td>${frequencyCell}</td></tr>`
  );
}

/** The Medications section (#17) — omitted entirely when there's nothing to show
 *  (no medication data passed, or summarizeMedicationUse returns nothing). */
function medicationsSectionHtml(summaries: readonly MedicationUseSummary[]): string {
  if (summaries.length === 0) return '';
  const rows = summaries.map(medicationRowHtml).join('');
  return (
    '<h2>Medications</h2>' +
    '<p class="summary">Doses the user logged in this range. Only logged doses are counted; ' +
    'a day without a logged dose may simply not have been recorded.</p>' +
    '<table><thead><tr><th>Medication</th><th>Doses logged</th><th>Days with a logged dose</th>' +
    '<th>Amounts</th><th>Frequency (as entered)</th></tr></thead>' +
    `<tbody>${rows}</tbody></table>`
  );
}

/** One row of the Experiments table (#19): term, dates, status, result. A
 *  completed experiment's result is its FROZEN verdict only — never re-evaluated. */
function experimentRowHtml(exp: Experiment, todayKey: string, lastDay: string): string {
  const term = escapeHtml(exp.term);
  const dates = escapeHtml(formatDayRange(exp.startDate, lastDay));

  let status: string;
  let result = '—';
  if (exp.status === 'completed') {
    status = 'Completed';
    const verdict = parseFrozenVerdict(exp.verdictJson);
    if (verdict) {
      result = `${escapeHtml(verdictSummaryLabel(verdict))}<br>${escapeHtml(verdictRatesSentence(verdict))}`;
    }
  } else if (exp.status === 'abandoned') {
    status = 'Ended early';
  } else {
    const phase = currentPhase(exp, todayKey);
    status = `In progress — ${escapeHtml(phaseStatusLine(phase.phase, phase.dayOfPhase, phase.phaseLength))}`;
  }

  return `<tr><td>${term}</td><td>${dates}</td><td>${status}</td><td>${result}</td></tr>`;
}

/** The Experiments section (#19) — omitted when none was passed, or none is active or overlaps the range. */
function experimentsSectionHtml(
  experiments: readonly Experiment[] | undefined,
  now: number,
  start: number,
  end: number,
): string {
  if (!experiments || experiments.length === 0) return '';
  const todayKey = formatDateInput(now);
  const windowStartKey = formatDateInput(start);
  const windowEndKey = formatDateInput(end - 1);

  const rows = experiments
    .map((exp) => ({ exp, lastDay: experimentSchedule(exp).lastDay }))
    .filter(
      ({ exp, lastDay }) =>
        exp.status === 'active' || (exp.startDate <= windowEndKey && lastDay >= windowStartKey),
    )
    .sort((a, b) => a.exp.startDate.localeCompare(b.exp.startDate))
    .map(({ exp, lastDay }) => experimentRowHtml(exp, todayKey, lastDay));
  if (rows.length === 0) return '';

  return (
    '<h2>Elimination experiments</h2>' +
    '<p class="summary">Elimination experiments the user ran. Verdicts are observations from their own logs, ' +
    'not diagnoses.</p>' +
    '<table><thead><tr><th>Tested</th><th>Dates</th><th>Status</th><th>Result</th></tr></thead>' +
    `<tbody>${rows.join('')}</tbody></table>`
  );
}

/** Medication data for the report (#17) — optional; existing callers that omit
 *  it get exactly today's report, with no Medications section at all. */
export interface ReportMedicationData {
  meds: readonly Medication[];
  events: readonly MedicationEvent[];
  doses: readonly MedicationDose[];
}

/**
 * Builds a complete printable HTML document summarizing `entries` over the
 * `rangeDays` calendar days ending today (inclusive) — same windowing as
 * bmRegularity, but stepped in LOCAL calendar days: `[local midnight
 * (rangeDays - 1) days before today, next local midnight)`. Fixed-24h
 * arithmetic drifted by an hour whenever the range crossed a DST change —
 * pulling in the last hour of the day before, and making a 30-day report's
 * medication denominators read "of 31" (#17 review).
 * `medications` is optional (#17) — when passed, a Medications section is
 * added (only when it has something to show) and medication doses join the
 * Journal; when omitted, output is unchanged from before #17.
 * `experiments` is optional (#19) — when passed, an Elimination experiments
 * section (between Medications and the Journal) lists those that overlap the
 * range or are still active; omitted, output is unchanged.
 */
export function buildReportHtml(
  entries: readonly LogEntry[],
  now: number,
  rangeDays: ReportRangeDays,
  medications?: ReportMedicationData,
  experiments?: readonly Experiment[],
): string {
  const { end } = dayBounds(now);
  const startDate = new Date(startOfDay(now));
  startDate.setDate(startDate.getDate() - (rangeDays - 1));
  const start = startDate.getTime();
  const ranged = entries.filter((e) => e.loggedAt >= start && e.loggedAt < end);

  const insights = computeInsights(ranged);
  const { summary } = insights;

  const medicationSummaries = medications
    ? summarizeMedicationUse(medications.meds, medications.events, medications.doses, { start, end })
    : [];
  const medicationDoseCount = medicationSummaries.reduce((sum, row) => sum + row.dosesLogged, 0);

  const summaryLine =
    `${summary.totalEntries} entries · ${summary.foodEntries} food · ${summary.bmEntries} BM · ` +
    `${summary.symptomEntries} symptoms · ${summary.roughOutcomes} rough outcomes` +
    (medicationDoseCount > 0 ? ` · ${medicationDoseCount} medication doses` : '');

  const sections: { title: string; items: string[] }[] = [
    {
      title: 'Ingredients',
      items: insights.ingredientFindings.map((f) =>
        outcomeSentence(f, latencyOf(findingInstances(ranged, 'tag', f.key))),
      ),
    },
    {
      title: 'Combinations',
      items: insights.pairFindings.map((f) => outcomeSentence(f, latencyOf(pairInstances(ranged, f.key)))),
    },
    {
      title: 'Foods',
      items: insights.foodFindings.map((f) =>
        outcomeSentence(f, latencyOf(findingInstances(ranged, 'food', f.label))),
      ),
    },
    { title: 'Nutrients', items: insights.nutrientFindings.map(nutrientSentence) },
  ].filter((section) => section.items.length > 0);

  const findingsHtml =
    sections.length === 0
      ? '<p class="empty">No patterns stand out yet.</p>'
      : sections
          .map(
            (section) =>
              `<h2>${section.title}</h2>` +
              section.items.map((item) => `<p class="finding">${item}</p>`).join(''),
          )
          .join('');

  const medicationsHtml = medicationsSectionHtml(medicationSummaries);
  const experimentsHtml = experimentsSectionHtml(experiments, now, start, end);

  const medicationEventsInRange = medications
    ? medications.events.filter((event) => event.takenAt >= start && event.takenAt < end)
    : [];
  const journalItems: JournalItem[] = medications
    ? [
        ...logEntriesToJournalItems(ranged),
        ...medicationEventsToJournalItems(medicationEventsInRange, medications.doses, medications.meds),
      ]
    : logEntriesToJournalItems(ranged);

  const dayGroups = groupEntriesByDay(journalItems);
  const journalHtml =
    dayGroups.length === 0
      ? '<p class="empty">No entries in this range.</p>'
      : dayGroups
          .map((group) => {
            const dayLabel = formatLongDate(group.entries[0].loggedAt);
            const rows = group.entries.map(journalRowHtml).join('');
            return (
              `<h3>${dayLabel}</h3>` +
              '<table><thead><tr><th>Time</th><th>Name</th><th>Detail</th><th>Notes</th></tr></thead>' +
              `<tbody>${rows}</tbody></table>`
            );
          })
          .join('');

  const rangeLabel = formatRangeLabel(start, end - 1);
  const generatedLabel = formatLongDate(now);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>TummyTracker report</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #000; background: #fff; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 20px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  h3 { font-size: 13px; margin: 16px 0 4px; }
  .meta { color: #444; font-size: 12px; margin-bottom: 12px; }
  .summary { font-size: 13px; margin-bottom: 8px; }
  .finding { font-size: 12px; margin: 0 0 6px; }
  .empty { font-size: 12px; color: #444; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px; }
  th, td { text-align: left; padding: 3px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
  .disclaimer { margin-top: 24px; font-size: 10px; color: #555; }
</style>
</head>
<body>
<h1>TummyTracker report</h1>
<div class="meta">${rangeLabel} · Generated ${generatedLabel}</div>
<p class="summary">${summaryLine}</p>
${findingsHtml}
${medicationsHtml}${experimentsHtml}
<h2>Journal</h2>
${journalHtml}
<p class="disclaimer">These are observations from the user's own logs — patterns, not medical advice.</p>
</body>
</html>`;
}
