import { useQuery } from '@tanstack/react-query';

import { usePrefsStore } from '@/features/prefs/prefsStore';
import { fetchOffProduct } from './api';

/**
 * Looks up a scanned barcode against Open Food Facts. Disabled until a barcode is
 * provided, or when offline mode is active. One retry, then the caller falls back
 * to manual entry on error/miss.
 */
export function useOffLookup(barcode: string | null) {
  const offlineMode = usePrefsStore((s) => s.offlineMode);
  return useQuery({
    queryKey: ['off-product', barcode],
    queryFn: ({ signal }) => fetchOffProduct(barcode as string, signal),
    enabled: barcode != null && !offlineMode,
    retry: 1,
    staleTime: 1000 * 60 * 60, // an hour — product data barely changes
  });
}
