import { mapOffResponse, mapOffSearchResponse, type OffProduct } from '@/lib/openFoodFacts';

// The only network calls in the app (CLAUDE.md §9): Open Food Facts, no API key.
const BASE_URL = 'https://world.openfoodfacts.org/api/v2/product';
const SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';
const USER_AGENT = 'TummyTracker/1.0 (local-first food journal)';

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

/** Generic_Search by food name — for manual entries with no barcode. */
export async function fetchOffSearchResults(query: string, signal?: AbortSignal): Promise<OffProduct[]> {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '5',
    sort_by: 'unique_scans_n', // most-scanned (most reliable) products first
    fields: 'code,product_name,brands,nutriments,serving_quantity,ingredients_text,allergens_tags,additives_tags',
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
  return mapOffSearchResponse(json);
}
