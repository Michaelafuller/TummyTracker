// Reads the verdict frozen into `experiment.verdictJson` at finish (GitHub
// #19). Shared by the experiment screen, history, the watchlist and the PDF
// so a completed experiment is never re-evaluated against today's logs.
import type { ExperimentVerdict } from './engine';

/** The frozen verdict, or null when there is none (active/abandoned) or the JSON is unreadable. */
export function parseFrozenVerdict(verdictJson: string | null): ExperimentVerdict | null {
  if (!verdictJson) return null;
  try {
    return JSON.parse(verdictJson) as ExperimentVerdict;
  } catch {
    return null;
  }
}
