// Pure HTML builder for the doctor/dietitian PDF report (HANDOFF.md doctor-PDF-
// report cycle §1.1). No React, no Date.now() inside — `now` is passed in so
// this stays fixture-testable, mirroring bmTrends.ts's windowing convention.
//
// This produces a complete, printable HTML document — black-on-white, system
// font stack — for expo-print's printToFileAsync, not the app's own theme.
// Every user-authored string (entry names, notes, ingredient/food tags) is run
// through escapeHtml before being embedded, so a hostile entry name can never
// break out of its cell or inject markup into the generated PDF.

import type { LogEntry } from '@/db/schema';
import { isBristolValue } from '@/features/bm/bristol';
import { isSentimentValue, sentimentLabel } from '@/features/sentiment/scale';
import { isSeverityValue } from '@/features/symptoms/severity';
import {
  computeInsights,
  type FoodFinding,
  type NutrientFinding,
  type PairFinding,
  type TagFinding,
  type TemporalFinding,
} from '@/features/analysis/insights';
import { formatLongDate, formatTime12h, MONTHS_LONG } from '@/lib/datetime';
import { groupEntriesByDay } from '@/lib/journal';
import { NUTRITION_NOUNS } from '@/lib/nutrition';
import type { ConfidenceTier } from '@/lib/stats';

const DAY_MS = 24 * 60 * 60 * 1000;

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

function ingredientSentence(f: TagFinding): string {
  return (
    `${escapeHtml(f.tag)} averages ${f.avgSentiment} vs a usual ${f.baselineAvg} across ${f.occurrences} meals ` +
    `containing it (${tierLabel(f.confidence)} confidence, n=${f.occurrences}).`
  );
}

function pairSentence(f: PairFinding): string {
  return (
    `${escapeHtml(f.tags[0])} + ${escapeHtml(f.tags[1])} together average ${f.avgSentiment} vs a usual ${f.baselineAvg} ` +
    `across ${f.occurrences} meals (${tierLabel(f.confidence)} confidence, n=${f.occurrences}).`
  );
}

function foodSentence(f: FoodFinding): string {
  return (
    `${escapeHtml(f.name)} averages ${f.avgSentiment} vs a usual ${f.baselineAvg} across ${f.occurrences} logs ` +
    `(${tierLabel(f.confidence)} confidence, n=${f.occurrences}).`
  );
}

function temporalSentence(f: TemporalFinding): string {
  const pct = Math.round(f.hitRate * 100);
  const basePct = Math.round(f.baseRate * 100);
  return (
    `${escapeHtml(f.tag)}: ${f.hits} of ${f.meals} meals with this ingredient were followed by a rough outcome ` +
    `within 24h (${pct}% vs ${basePct}% baseline) (${tierLabel(f.confidence)} confidence, n=${f.meals}).`
  );
}

function nutrientSentence(f: NutrientFinding): string {
  return (
    `Higher ${NUTRITION_NOUNS[f.nutrient]} (≥ ${f.thresholdValue}) meals average sentiment ${f.highAvgSentiment} ` +
    `vs ${f.lowAvgSentiment} otherwise (${tierLabel(f.confidence)} confidence, n=${f.sampleSize}).`
  );
}

function entryDetail(entry: LogEntry): string {
  const parts: string[] = [];
  if (isSentimentValue(entry.sentiment)) parts.push(sentimentLabel(entry.sentiment));
  if (isBristolValue(entry.bristolScale)) parts.push(`Bristol ${entry.bristolScale}`);
  if (isSeverityValue(entry.severity)) parts.push(`Severity ${entry.severity}`);
  return parts.join(' · ');
}

/**
 * Builds a complete printable HTML document summarizing `entries` over the
 * `rangeDays` calendar days ending today (inclusive) — same windowing as
 * bmRegularity: `[todayStart + DAY_MS - rangeDays * DAY_MS, todayStart + DAY_MS)`.
 */
export function buildReportHtml(
  entries: readonly LogEntry[],
  now: number,
  rangeDays: ReportRangeDays,
): string {
  const todayStart = startOfDay(now);
  const end = todayStart + DAY_MS;
  const start = end - rangeDays * DAY_MS;
  const ranged = entries.filter((e) => e.loggedAt >= start && e.loggedAt < end);

  const insights = computeInsights(ranged);
  const { summary } = insights;
  const summaryLine =
    `${summary.totalEntries} entries · ${summary.foodEntries} food · ${summary.bmEntries} BM · ` +
    `${summary.ratedEntries} rated${summary.averageSentiment != null ? ` · avg sentiment ${summary.averageSentiment}` : ''}`;

  const sections: { title: string; items: string[] }[] = [
    { title: 'Ingredients', items: insights.ingredientFindings.map(ingredientSentence) },
    { title: 'Combinations', items: insights.pairFindings.map(pairSentence) },
    { title: 'Foods', items: insights.foodFindings.map(foodSentence) },
    { title: 'Timing', items: insights.temporalFindings.map(temporalSentence) },
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

  const dayGroups = groupEntriesByDay(ranged);
  const journalHtml =
    dayGroups.length === 0
      ? '<p class="empty">No entries in this range.</p>'
      : dayGroups
          .map((group) => {
            const dayLabel = formatLongDate(group.entries[0].loggedAt);
            const rows = group.entries
              .map((entry) => {
                const notes = entry.notes != null && entry.notes !== '' ? escapeHtml(entry.notes) : '';
                return (
                  `<tr><td>${formatTime12h(entry.loggedAt)}</td>` +
                  `<td>${escapeHtml(entry.name)}</td>` +
                  `<td>${entryDetail(entry)}</td>` +
                  `<td>${notes}</td></tr>`
                );
              })
              .join('');
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
<h2>Journal</h2>
${journalHtml}
<p class="disclaimer">These are observations from the user's own logs — patterns, not medical advice.</p>
</body>
</html>`;
}
