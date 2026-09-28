import {
  baselinePreviewSentence,
  baselineWarning,
  challengeTodayLabel,
  confidenceChipLabel,
  daysLoggedSoFarSentence,
  endedEarlySentence,
  experimentPlanLines,
  formatDayRange,
  phaseInstruction,
  phaseStatusLine,
  slipsSentence,
  verdictHeadline,
  verdictNumbersSentence,
  verdictRatesSentence,
} from '../copy';
import { experimentSchedule, type ExperimentEvaluation, type ExperimentLike } from '../engine';

describe('formatDayRange', () => {
  it('formats a same-month range without repeating the month', () => {
    expect(formatDayRange('2026-09-28', '2026-10-11')).toBe('Sep 28 – Oct 11');
    expect(formatDayRange('2026-10-12', '2026-10-14')).toBe('Oct 12 – 14');
  });

  it('formats a single day (start === end) once', () => {
    expect(formatDayRange('2026-09-28', '2026-09-28')).toBe('Sep 28');
  });
});

describe('experimentPlanLines', () => {
  it('matches the start-screen example verbatim', () => {
    const exp: ExperimentLike = {
      term: 'lactose',
      startDate: '2026-09-28',
      baselineDays: 14,
      eliminationDays: 14,
      challengeDays: 3,
      observationDays: 3,
    };
    const lines = experimentPlanLines(experimentSchedule(exp));
    expect(lines).toEqual([
      'Avoid it: Sep 28 – Oct 11',
      'Eat it once a day: Oct 12 – 14',
      'Keep logging: Oct 15 – 17',
    ]);
  });
});

describe('baselinePreviewSentence / baselineWarning', () => {
  it('renders the days/logged/rough sentence', () => {
    expect(baselinePreviewSentence({ days: 14, covered: 9, rough: 4, rate: 4 / 9 })).toBe(
      'Your last 14 days: 9 logged, 4 rough.',
    );
  });

  it('warns when fewer than the minimum baseline days are covered', () => {
    expect(baselineWarning({ days: 14, covered: 3, rough: 1, rate: 1 / 3 })).toMatch(/inconclusive/);
  });

  it('warns when nothing rough happened recently', () => {
    expect(baselineWarning({ days: 14, covered: 10, rough: 0, rate: 0 })).toMatch(/nothing to detect/);
  });

  it('is null when coverage and rough days both look fine', () => {
    expect(baselineWarning({ days: 14, covered: 10, rough: 3, rate: 0.3 })).toBeNull();
  });
});

describe('phaseStatusLine', () => {
  it('matches the follow-screen examples verbatim', () => {
    expect(phaseStatusLine('elimination', 5, 14)).toBe('Avoiding · day 5 of 14');
    expect(phaseStatusLine('challenge', 2, 3)).toBe('Eat it once today · challenge day 2 of 3');
    expect(phaseStatusLine('observation', 1, 3)).toBe('Keep logging · day 1 of 3');
    expect(phaseStatusLine('ready', 3, 3)).toBe('Verdict ready');
  });
});

describe('phaseInstruction', () => {
  it('names the term in the elimination and challenge instructions', () => {
    expect(phaseInstruction('elimination', 'lactose')).toContain('lactose');
    expect(phaseInstruction('challenge', 'lactose')).toContain('lactose');
  });

  it('gives a distinct instruction for every phase', () => {
    const all = new Set(
      (['elimination', 'challenge', 'observation', 'ready'] as const).map((p) => phaseInstruction(p, 'soy')),
    );
    expect(all.size).toBe(4);
  });
});

describe('challengeTodayLabel', () => {
  it('reflects whether exposure was logged today', () => {
    expect(challengeTodayLabel(true)).toBe('Logged today ✓');
    expect(challengeTodayLabel(false)).toBe('Not logged yet');
  });
});

describe('slipsSentence', () => {
  it('is null when there were no slips', () => {
    expect(slipsSentence([])).toBeNull();
  });

  it('uses singular "slip" for exactly one', () => {
    expect(slipsSentence(['2026-04-03'])).toBe('1 slip — the day after is left out too.');
  });

  it('uses plural "slips" for more than one', () => {
    expect(slipsSentence(['2026-04-03', '2026-04-05'])).toBe('2 slips — the day after each is left out too.');
  });
});

describe('daysLoggedSoFarSentence', () => {
  it('reports elimination and reintroduction coverage', () => {
    const evaluation: ExperimentEvaluation = {
      baseline: { days: 14, covered: 14, rough: 4, rate: 4 / 14 },
      elimination: { days: 14, covered: 9, rough: 1, rate: 1 / 9 },
      reintroduction: { days: 6, covered: 3, rough: 2, rate: 2 / 3 },
      slipDays: [],
      challengeExposureDays: 1,
      verdict: null,
    };
    expect(daysLoggedSoFarSentence(evaluation)).toBe('Logged so far — avoiding: 9 of 14, reintroducing: 3 of 6.');
  });
});

describe('endedEarlySentence', () => {
  it('formats the abandon date', () => {
    const endedAt = new Date(2026, 7, 21, 12, 0, 0).getTime();
    expect(endedEarlySentence(endedAt)).toBe('Ended early on August 21, 2026.');
  });
});

describe('verdictHeadline', () => {
  it('has a distinct headline per kind', () => {
    expect(verdictHeadline('likely-trigger')).toBe('Likely a trigger');
    expect(verdictHeadline('likely-not-trigger')).toBe('Likely not a trigger');
    expect(verdictHeadline('inconclusive')).toBe('Inconclusive');
  });
});

describe('confidenceChipLabel', () => {
  it('names each tier', () => {
    expect(confidenceChipLabel('high')).toBe('High confidence');
    expect(confidenceChipLabel('medium')).toBe('Medium confidence');
    expect(confidenceChipLabel('low')).toBe('Low confidence');
  });
});

describe('verdictNumbersSentence', () => {
  it('matches the verdict-card example verbatim', () => {
    const evaluation: ExperimentEvaluation = {
      baseline: { days: 14, covered: 14, rough: 6, rate: 6 / 14 },
      elimination: { days: 14, covered: 14, rough: 1, rate: 1 / 14 },
      reintroduction: { days: 6, covered: 6, rough: 3, rate: 3 / 6 },
      slipDays: [],
      challengeExposureDays: 3,
      verdict: null,
    };
    expect(verdictNumbersSentence(evaluation)).toBe(
      'Rough days: before 43% (6 of 14 logged) · while avoiding 7% (1 of 14) · after reintroducing 50% (3 of 6)',
    );
  });

  it('shows a dash for a phase with no covered days', () => {
    const evaluation: ExperimentEvaluation = {
      baseline: { days: 14, covered: 0, rough: 0, rate: null },
      elimination: { days: 14, covered: 0, rough: 0, rate: null },
      reintroduction: { days: 6, covered: 0, rough: 0, rate: null },
      slipDays: [],
      challengeExposureDays: 0,
      verdict: null,
    };
    expect(verdictNumbersSentence(evaluation)).toContain('before — (0 of 0 logged)');
  });
});

describe('verdictRatesSentence', () => {
  it('renders only the three rates, no absolute counts (a frozen verdict has none)', () => {
    expect(
      verdictRatesSentence({
        kind: 'likely-trigger',
        confidence: 'high',
        reason: 'x',
        baselineRate: 0.43,
        eliminationRate: 1 / 14,
        reintroductionRate: 0.5,
      }),
    ).toBe('Rough days: before 43% · while avoiding 7% · after reintroducing 50%');
  });

  it('shows a dash for a null rate', () => {
    expect(
      verdictRatesSentence({
        kind: 'inconclusive',
        confidence: null,
        reason: 'x',
        baselineRate: null,
        eliminationRate: null,
        reintroductionRate: null,
      }),
    ).toBe('Rough days: before — · while avoiding — · after reintroducing —');
  });
});
