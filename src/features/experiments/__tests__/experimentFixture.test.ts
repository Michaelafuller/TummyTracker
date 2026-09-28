import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { parseBackupJson } from '@/lib/backup';
import { currentPhase, evaluateExperiment, experimentSchedule } from '../engine';

// The fixture generator is a dependency-free Node ESM script (scripts/
// make-experiment-fixture.mjs, like generate-icons.mjs). Jest here runs
// CommonJS-transformed sources and does not transform .mjs, so instead of
// importing its pure builder the test runs the real CLI — the exact thing
// the owner runs — and checks the file it writes.
const SCRIPT = resolve(__dirname, '../../../../scripts/make-experiment-fixture.mjs');

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'tt-fixture-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function generate(todayKey: string, name = `backup-${todayKey}.json`) {
  const outPath = join(dir, name);
  const stdout = execFileSync(process.execPath, [SCRIPT, outPath, `--today=${todayKey}`], { encoding: 'utf8' });
  return { outPath, stdout, text: readFileSync(outPath, 'utf8') };
}

describe('scripts/make-experiment-fixture.mjs', () => {
  it.each(['2026-09-28', '2026-11-15', '2027-03-20'])(
    'writes a backup v5 that parses and evaluates to a likely-trigger verdict today (%s)',
    (todayKey) => {
      const { text } = generate(todayKey);

      const parsed = parseBackupJson(text);
      if (!parsed.ok) throw new Error(parsed.error);
      expect(JSON.parse(text).version).toBe(5);
      expect(parsed.experiments).toHaveLength(1);

      const exp = parsed.experiments[0];
      expect(exp).toMatchObject({
        term: 'lactose',
        status: 'active',
        baselineDays: 14,
        eliminationDays: 14,
        challengeDays: 3,
        observationDays: 3,
        verdictJson: null,
      });
      expect(currentPhase(exp, todayKey).phase).toBe('ready');

      const evaluation = evaluateExperiment(exp, parsed.entries, parsed.dayCheckIns, todayKey);
      expect(evaluation.verdict?.kind).toBe('likely-trigger');
      expect(evaluation.slipDays).toEqual([]);
      expect(evaluation.challengeExposureDays).toBe(3);
      expect(evaluation.baseline.rough).toBe(10);
      expect(evaluation.baseline.covered).toBe(14);
      expect(evaluation.elimination.rough).toBe(0);
    },
  );

  it('dates the experiment so that today is exactly its first ready day (started 20 days ago)', () => {
    const parsed = parseBackupJson(generate('2026-09-28').text);
    if (!parsed.ok) throw new Error(parsed.error);
    const exp = parsed.experiments[0];
    expect(exp.startDate).toBe('2026-09-08');
    expect(experimentSchedule(exp).lastDay).toBe('2026-09-27');
    expect(currentPhase(exp, '2026-09-27').phase).toBe('observation');
    expect(currentPhase(exp, '2026-09-28').phase).toBe('ready');
  });

  it('gives every entry and the experiment a stable, unique fixture- id', () => {
    const parsed = parseBackupJson(generate('2026-09-28').text);
    if (!parsed.ok) throw new Error(parsed.error);
    const ids = [...parsed.entries.map((e) => e.id), ...parsed.experiments.map((e) => e.id)];
    expect(ids.length).toBeGreaterThan(40);
    expect(ids.every((id) => id.startsWith('fixture-'))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is deterministic for a given day', () => {
    expect(generate('2026-09-28', 'a.json').text).toBe(generate('2026-09-28', 'b.json').text);
  });

  it('prints the adb push command but never runs adb', () => {
    const { stdout, outPath } = generate('2026-09-28');
    expect(stdout).toContain('adb push');
    expect(stdout).toContain(outPath);
    expect(stdout).toContain('/sdcard/Download/experiment-ready-backup.json');
  });

  it('rejects a malformed --today', () => {
    expect(() =>
      execFileSync(process.execPath, [SCRIPT, join(dir, 'x.json'), '--today=tomorrow'], { stdio: 'pipe' }),
    ).toThrow();
  });
});
