import { useQuery } from '@tanstack/react-query';

import { fetchOffProduct } from './api';

/**
 * Looks up a scanned barcode against Open Food Facts. Disabled until a barcode is
 * provided. One retry, then the caller falls back to manual entry on error/miss.
 */
export function useOffLookup(barcode: string | null) {
  return useQuery({
    queryKey: ['off-product', barcode],
    queryFn: ({ signal }) => fetchOffProduct(barcode as string, signal),
    enabled: barcode != null,
    retry: 1,
    staleTime: 1000 * 60 * 60, // an hour — product data barely changes
  });
}
