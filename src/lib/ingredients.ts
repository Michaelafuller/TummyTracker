// Pure helpers for ingredient/allergen/additive tag extraction (HANDOFF.md flagship trio).
// No React, no I/O — fully fixture-testable.

const STOPWORDS = new Set([
  'and', 'or', 'with', 'of', 'the', 'a', 'an', 'in', 'for', 'to', 'from',
  'at', 'by', 'as', 'is', 'it', 'may', 'contain', 'contains', 'trace',
  'traces', 'less', 'than', 'natural', 'artificial', 'flavour', 'flavor',
  'flavors', 'flavours', 'colour', 'color', 'colours', 'colors',
]);

/** Strip OFF language prefix (e.g. "en:", "fr:"), lowercase, trim. */
export function normalizeTag(raw: string): string {
  return raw.replace(/^[a-z]{2}:/, '').toLowerCase().trim();
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

/**
 * Produce a deduped array of normalized tags from three sources:
 *  - allergensTags  (OFF allergens_tags, e.g. ["en:milk", "en:gluten"])
 *  - additivesTags  (OFF additives_tags, e.g. ["en:e322"])
 *  - ingredientsText (raw comma-separated ingredient list from OFF or manual entry)
 *
 * Allergens and additives come first (highest signal). Percentage figures are
 * stripped from ingredient text, then brackets/parens are treated as *token
 * delimiters* (not deleted) so compound-ingredient breakdowns — e.g. "Tofu
 * (water, soybeans, calcium sulfate)" — contribute their sub-ingredients
 * (soybeans, calcium sulfate) as separate tags instead of losing them. The
 * text is then split on commas/semicolons; within each resulting token,
 * individual STOPWORD words are stripped (so a filler phrase like "may
 * contain traces of nuts" reduces to "nuts" rather than surviving whole or
 * vanishing entirely) and the remaining words are rejoined. Tokens shorter
 * than 2 chars after this are dropped. The result is deduplicated.
 */
export function extractTags({
  ingredientsText,
  allergensTags,
  additivesTags,
}: {
  ingredientsText: string | null;
  allergensTags: unknown;
  additivesTags: unknown;
}): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  const add = (raw: string) => {
    const t = normalizeTag(raw);
    if (t.length >= 2 && !seen.has(t)) {
      seen.add(t);
      tags.push(t);
    }
  };

  for (const raw of coerceStringArray(allergensTags)) add(raw);
  for (const raw of coerceStringArray(additivesTags)) add(raw);

  if (ingredientsText && ingredientsText.trim().length > 0) {
    ingredientsText
      .replace(/\d+(\.\d+)?%/g, '') // strip percentage figures (e.g. "13%", "8.7%")
      .replace(/[()[\]]/g, ',') // treat brackets as delimiters, capturing sub-ingredients as tags
      .split(/[,;]+/)
      .map((t) => t.toLowerCase().replace(/[^a-z0-9 -]/g, '').trim())
      .map((t) =>
        t
          .split(/\s+/)
          .filter((word) => word.length > 0 && !STOPWORDS.has(word))
          .join(' '),
      )
      .filter((t) => t.length >= 2)
      .forEach(add);
  }

  return tags;
}

/** Safely parse a JSON tag array, returning [] on any error. */
export function parseTagsJson(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const parsed = JSON.parse(s) as unknown;
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

/** Serialize a tag array to JSON for DB storage. */
export function serializeTags(tags: string[]): string {
  return JSON.stringify(tags);
}
