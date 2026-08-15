import { mapOffResponse, mapOffSearchResponse, type OffProduct } from '@/lib/openFoodFacts';

// The only network calls in the app (CLAUDE.md §9): Open Food Facts, no API key.
// Name search uses Search-a-licious (OFF's officially recommended replacement for
// the legacy cgi/search.pl Generic_Search endpoint, which now 503s on unfiltered
// queries and returned native-language names anyway).
const BASE_URL = 'https://world.openfoodfacts.org/api/v2/product';
const SEARCH_URL = 'https://search.openfoodfacts.org/search';
// OFF's terms ask for a contact email in the User-Agent.
const USER_AGENT = 'TummyTracker/1.0 (michaellovesellen@gmail.com)';

export async function fetchOffProduct(barcode: string, signal?: AbortSignal): Promise<OffProduct> {
  const response = await fetch(`${BASE_URL}/${encodeURIComponent(barcode)}.json`, {
    signal,
    headers: {
      // OFF asks clients to identify themselves.
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Open Food Facts request failed (${response.status}).`);
  }

  const json: unknown = await response.json();
  return mapOffResponse(barcode, json);
}

/**
 * Search-a-licious search by food name — for manual entries with no barcode.
 * Deliberately no `countries_tags` filter: live testing showed `langs=en` alone
 * ranks generic entries best; a US-only filter would exclude the UK/international
 * generic produce entries that are OFF's de-facto "generic food" rows.
 */
export async function fetchOffSearchResults(query: string, signal?: AbortSignal): Promise<OffProduct[]> {
  const params = new URLSearchParams({
    q: query,
    langs: 'en', // selects which language-specific name fields are searched and returned
    page_size: '24', // the genericity re-ranker wants a wide pool
    // Deliberately no sort_by: Search-a-licious's default sort is descending
    // relevance, live-tested to rank generic English entries ("Fresh Banana",
    // plain "Bananas") at the top. Do NOT port the old sort_by=unique_scans_n
    // habit — on Search-a-licious that ranks by *global* popularity, which
    // resurfaces French products.
    fields:
      'code,product_name,product_name_en,brands,nutriments,serving_quantity,ingredients_text,allergens_tags,additives_tags,categories_tags',
  });
  const response = await fetch(`${SEARCH_URL}?${params.toString()}`, {
    signal,
    headers: {
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Open Food Facts search failed (${response.status}).`);
  }

  const json: unknown = await response.json();
  return mapOffSearchResponse(json, query);
}
