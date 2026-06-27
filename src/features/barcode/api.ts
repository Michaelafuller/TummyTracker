import { mapOffResponse, type OffProduct } from '@/lib/openFoodFacts';

// The only network call in the app (CLAUDE.md §9): Open Food Facts, no API key.
const BASE_URL = 'https://world.openfoodfacts.org/api/v2/product';

export async function fetchOffProduct(barcode: string, signal?: AbortSignal): Promise<OffProduct> {
  const response = await fetch(`${BASE_URL}/${encodeURIComponent(barcode)}.json`, {
    signal,
    headers: {
      // OFF asks clients to identify themselves.
      'User-Agent': 'TummyTracker/1.0 (local-first food journal)',
    },
  });

  if (!response.ok) {
    throw new Error(`Open Food Facts request failed (${response.status}).`);
  }

  const json: unknown = await response.json();
  return mapOffResponse(barcode, json);
}
