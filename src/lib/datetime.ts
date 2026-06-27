// Pure date/time helpers for editing a log entry's `loggedAt` without a native
// date picker. Inputs are split into a date field (YYYY-MM-DD) and a time field
// (HH:MM), parsed/formatted in the device's local timezone.

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Format an epoch-ms timestamp to a local 'YYYY-MM-DD' date string. */
export function formatDateInput(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Format an epoch-ms timestamp to a local 'HH:MM' time string. */
export function formatTimeInput(epochMs: number): string {
  const d = new Date(epochMs);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export interface ParsedDateTime {
  /** Epoch ms, or null when the inputs are invalid. */
  ms: number | null;
  error?: string;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

/**
 * Combine a 'YYYY-MM-DD' date and 'HH:MM' time into an epoch-ms timestamp in local
 * time. Rejects malformed strings and impossible dates (e.g. 2025-02-30) by checking
 * that the constructed Date round-trips to the same components.
 */
export function parseDateTime(dateInput: string, timeInput: string): ParsedDateTime {
  const dateMatch = DATE_RE.exec(dateInput.trim());
  const timeMatch = TIME_RE.exec(timeInput.trim());
  if (!dateMatch || !timeMatch) {
    return { ms: null, error: 'Use date YYYY-MM-DD and time HH:MM.' };
  }

  const [, yearStr, monthStr, dayStr] = dateMatch;
  const [, hourStr, minuteStr] = timeMatch;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return { ms: null, error: 'Date or time is out of range.' };
  }

  const d = new Date(year, month - 1, day, hour, minute, 0, 0);
  // Reject overflow (e.g. Feb 30 rolling into March).
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day ||
    d.getHours() !== hour ||
    d.getMinutes() !== minute
  ) {
    return { ms: null, error: 'That date does not exist.' };
  }

  return { ms: d.getTime() };
}
