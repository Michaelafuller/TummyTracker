// Small pure array helpers. No React, no I/O — trivially unit-testable.

/**
 * Splits `rows` into consecutive chunks of at most `size` elements each,
 * preserving order (backup restore hardening, HANDOFF.md §2). SQLite caps
 * bound variables at 32,766 — a single `inArray(...)` lookup or multi-row
 * INSERT over a large id-preserving restore (e.g. `medication_dose`, 7 cols,
 * hits the cap at ~4,700 rows) must be split into batches instead of sent as
 * one statement. The last chunk may be shorter than `size`; an empty input
 * yields an empty array (not `[[]]`).
 */
export function chunk<T>(rows: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk size must be > 0');
  if (rows.length === 0) return [];

  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}
