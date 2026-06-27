// Pure parsing of optional numeric text-field input (nutrition fields).

export interface ParsedNumber {
  /** null when the field was left blank; a finite number otherwise. */
  value: number | null;
  error?: string;
}

/**
 * Parse a numeric form input. Blank/whitespace → null (the field is optional).
 * Anything that isn't a finite number → an error. Leading/trailing spaces are ignored.
 */
export function parseOptionalNumber(input: string | null | undefined): ParsedNumber {
  if (input == null) return { value: null };
  const trimmed = input.trim();
  if (trimmed.length === 0) return { value: null };

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { value: null, error: 'Enter a number.' };
  }
  return { value: parsed };
}
