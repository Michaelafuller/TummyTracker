import type { LogEntry } from '@/db/schema';
import { buildReportHtml, escapeHtml, REPORT_RANGES } from '../report';

let seq = 0;
function makeEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: `e${seq++}`,
    type: 'meal',
    mealSlot: null,
    name: 'Food',
    barcode: null,
    loggedAt: 0,
    sentiment: null,
    bristolScale: null,
    symptomType: null,
    severity: null,
    notes: null,
    calories: null,
    fatG: null,
    saturatedFatG: null,
    carbsG: null,
    proteinG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    servingG: null,
    ingredientsText: null,
    tagsJson: null,
    componentCount: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

// "Now" = local Aug 24, 2026, 10:00 — the 30-day window ending today (inclusive)
// spans [Jul 26 00:00, Aug 25 00:00).
const NOW = new Date(2026, 7, 24, 10, 0, 0).getTime();

describe('REPORT_RANGES', () => {
  it('is exactly 14, 30, 90', () => {
    expect(REPORT_RANGES).toEqual([14, 30, 90]);
  });
});

describe('escapeHtml', () => {
  it('escapes &, <, >, double quotes, and single quotes', () => {
    expect(escapeHtml(`<b>Tom & Jerry's "great" show</b>`)).toBe(
      '&lt;b&gt;Tom &amp; Jerry&#39;s &quot;great&quot; show&lt;/b&gt;',
    );
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Rice and beans')).toBe('Rice and beans');
  });
});

describe('buildReportHtml — range filtering', () => {
  it('includes an entry logged at the start of the window (inclusive) and one logged today', () => {
    const windowStart = new Date(2026, 6, 26, 0, 0, 0).getTime(); // Jul 26 00:00, exactly 30 days back
    const entries = [
      makeEntry({ name: 'WindowStart', loggedAt: windowStart }),
      makeEntry({ name: 'Today', loggedAt: NOW }),
    ];
    const html = buildReportHtml(entries, NOW, 30);
    expect(html).toContain('WindowStart');
    expect(html).toContain('Today');
  });

  it('excludes an entry logged just before the window and one logged in the future', () => {
    const windowStart = new Date(2026, 6, 26, 0, 0, 0).getTime();
    const entries = [
      makeEntry({ name: 'TooOld', loggedAt: windowStart - 1 }),
      makeEntry({ name: 'Future', loggedAt: new Date(2026, 7, 25, 0, 0, 0).getTime() }), // Aug 25 00:00 — outside [..., Aug 25 00:00)
    ];
    const html = buildReportHtml(entries, NOW, 30);
    expect(html).not.toContain('TooOld');
    expect(html).not.toContain('Future');
    expect(html).toContain('No entries in this range.');
  });
});

describe('buildReportHtml — escaping', () => {
  it('renders a malicious entry name only in its escaped form', () => {
    const entries = [makeEntry({ name: 'Rice<script>alert(1)</script>', loggedAt: NOW, notes: '<img src=x onerror=alert(2)>' })];
    const html = buildReportHtml(entries, NOW, 30);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain(escapeHtml('Rice<script>alert(1)</script>'));
    expect(html).toContain(escapeHtml('<img src=x onerror=alert(2)>'));
  });
});

describe('buildReportHtml — summary', () => {
  it('includes the entries/food/BM/rated/avg-sentiment summary numbers', () => {
    const entries = [
      makeEntry({ type: 'meal', name: 'Toast', loggedAt: NOW, sentiment: 4 }),
      makeEntry({ type: 'bowel_movement', name: 'BM', loggedAt: NOW, bristolScale: 4 }),
    ];
    const html = buildReportHtml(entries, NOW, 30);
    expect(html).toContain('2 entries');
    expect(html).toContain('1 food');
    expect(html).toContain('1 BM');
    expect(html).toContain('1 rated');
    expect(html).toContain('avg sentiment 4');
  });
});

describe('buildReportHtml — findings', () => {
  it('produces a finding sentence for a seeded low-sentiment recurring food', () => {
    // Same fixture shape as analyzeFoodSentiment's proven case (insights.test.ts):
    // "Chicken Salad" x3 low sentiment vs "Toast" x3 baseline -> delta clears
    // DELTA_MARGIN and the food is flagged (confidence 'low' at n=3, which is
    // fine — this test only needs the sentence to appear, not high confidence).
    const entries = [
      makeEntry({ name: 'Chicken Salad', sentiment: 2, loggedAt: NOW }),
      makeEntry({ name: 'chicken salad', sentiment: 2, loggedAt: NOW }),
      makeEntry({ name: 'CHICKEN SALAD', sentiment: 3, loggedAt: NOW }),
      makeEntry({ name: 'Toast', sentiment: 5, loggedAt: NOW }),
      makeEntry({ name: 'Toast', sentiment: 4, loggedAt: NOW }),
      makeEntry({ name: 'Toast', sentiment: 5, loggedAt: NOW }),
    ];
    const html = buildReportHtml(entries, NOW, 30);
    expect(html).toContain('Foods');
    expect(html).toContain('Chicken Salad averages 2.3');
    expect(html).toContain('confidence');
  });

  it('shows "No patterns stand out yet." when there are no findings (and no journal rows) for an empty range', () => {
    const html = buildReportHtml([], NOW, 30);
    expect(html).toContain('No patterns stand out yet.');
    expect(html).toContain('No entries in this range.');
  });
});

describe('buildReportHtml — disclaimer', () => {
  it('includes the exact observation-framing disclaimer', () => {
    const html = buildReportHtml([], NOW, 30);
    expect(html).toContain(
      "These are observations from the user's own logs — patterns, not medical advice.",
    );
  });
});
