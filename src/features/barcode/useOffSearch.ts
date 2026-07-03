import { useQuery } from '@tanstack/react-query';

import { usePrefsStore } from '@/features/prefs/prefsStore';
import { fetchOffSearchResults } from './api';

/**
 * Looks up a food name against Open Food Facts search. Disabled until a query
 * of at least 2 non-whitespace chars is committed, or when offline mode is
 * active. One retry; the caller shows an inline notice on miss/error.
 */
export function useOffSearch(query: string | null) {
  const offlineMode = usePrefsStore((s) => s.offlineMode);
  const trimmed = query?.trim() ?? '';
  const enabled = trimmed.length >= 2 && !offlineMode;
  return useQuery({
    queryKey: ['off-search', trimmed],
    queryFn: ({ signal }) => fetchOffSearchResults(trimmed, signal),
    enabled,
    retry: 1,
    staleTime: 1000 * 60 * 60,
  });
}
